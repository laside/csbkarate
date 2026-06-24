-- =============================================================
-- Migration 0008 — Email lisible dans `profiles` (écran « Comptes & rôles »)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / backfill borné).
--
-- POURQUOI : l'espace Bureau (membres.html) doit afficher QUI a un compte et
-- son rôle. Or `auth.users` n'est PAS interrogeable depuis le navigateur
-- (PostgREST ne l'expose pas). On recopie donc l'email dans `public.profiles`,
-- table déjà lisible par le bureau (RLS `profiles_select`). Pas de secret :
-- seul le bureau peut lire ces lignes (cf. policy existante).
--
-- L'email est alimenté à la création du compte (trigger ci-dessous) puis
-- backfillé pour les comptes déjà existants.
-- =============================================================

-- 1) Colonne email (vide par défaut, remplie ensuite) ----------
alter table public.profiles
    add column if not exists email text not null default '';

-- 2) Trigger de création de compte : on capte aussi l'email ----
-- (remplace la version de 0006 ; `new` = la ligne auth.users insérée.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (user_id, role, email)
    values (new.id, 'adherent', coalesce(new.email, ''))
    on conflict (user_id) do nothing;
    return new;
end;
$$;

-- 3) Backfill des comptes existants (email encore vide) --------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.user_id
  and coalesce(p.email, '') = '';
