-- =============================================================
-- Migration 0019 — RPC `ensure_profile` + politique INSERT profiles
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (CREATE OR REPLACE / DROP IF EXISTS / ADD IF NOT EXISTS).
--
-- PROBLÈME RÉSOLU : certains comptes Auth créés avant l'installation du
-- trigger `handle_new_user` (migration 0006/0008) n'ont pas de ligne dans
-- `public.profiles`. Sans cette ligne, `isBureau()` ne peut pas lire le rôle
-- et l'utilisateur est bloqué (même si un admin l'a promu entre-temps).
--
-- SOLUTION :
--   1) Une RPC SECURITY DEFINER `ensure_profile()` que le front-end appelle
--      au login si aucun profil n'est trouvé. Elle crée la ligne manquante
--      avec le rôle par défaut `adherent`.
--   2) Une politique INSERT sur profiles pour permettre à un utilisateur
--      authentifié de créer SA PROPRE ligne (role forcé à `adherent`).
-- =============================================================

-- =============================================================
-- Partie 1 : RPC SECURITY DEFINER (contourne la RLS, fiable)
-- =============================================================
create or replace function public.ensure_profile()
returns text -- retourne le rôle ('adherent' ou existant)
language plpgsql security definer set search_path = public as $$
declare
    v_role text;
begin
    -- Récupère le rôle existant ou insère avec 'adherent'
    select role into v_role
    from public.profiles
    where user_id = auth.uid();

    if not found then
        v_role := 'adherent';
        insert into public.profiles (user_id, role, email)
        values (auth.uid(), v_role, coalesce(auth.jwt()->>'email', ''))
        on conflict (user_id) do nothing;
    end if;

    return v_role;
end;
$$;


-- =============================================================
-- Partie 2 : Politique INSERT (filet de sécurité)
-- =============================================================
-- Permet à un utilisateur de créer sa propre ligne profiles, mais
-- UNIQUEMENT avec le rôle 'adherent' (personne ne peut s'auto-promouvoir).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
    with check (user_id = auth.uid() and role = 'adherent');
