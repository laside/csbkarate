-- =============================================================
-- Migration 0018 — Email dans `familles` + sync `profiles.email` ON UPDATE
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / backfill borné).
--
-- 1) Ajoute la colonne `email` à `public.familles` (le chaînon manquant
--    entre le compte Auth et les adhérents de la famille).
-- 2) Backfill depuis `adherents` (email du 1er adhérent de chaque famille).
-- 3) Trigger AFTER UPDATE OF email ON auth.users → sync `profiles.email`.
-- =============================================================

-- =============================================================
-- Partie 1 : email dans familles
-- =============================================================
alter table public.familles
    add column if not exists email text not null default '';

-- Backfill depuis `adherents` (email du 1er adhérent de la famille,
-- ou rester vide si aucun adhérent ni email).
update public.familles f
set email = coalesce(sub.email, f.email, '')
from (
    select distinct on (famille_id) famille_id, email
    from public.adherents
    where email is not null and email != ''
    order by famille_id, id
) sub
where f.id = sub.famille_id
  and coalesce(f.email, '') = '';

-- Pour les familles sans adhérent (ex. compte créé sans finaliser),
-- tenter un backfill depuis profiles (référent = user_id → profiles.email).
update public.familles f
set email = coalesce(p.email, f.email, '')
from public.profiles p
where f.referent_user_id = p.user_id
  and coalesce(f.email, '') = ''
  and coalesce(p.email, '') != '';


-- =============================================================
-- Partie 2 : trigger AFTER UPDATE OF email ON auth.users
-- =============================================================
-- Quand un utilisateur change son email dans Auth, on répercute
-- dans `profiles.email` pour éviter la désynchronisation.
create or replace function public.sync_profile_email_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    update public.profiles
    set email = new.email
    where user_id = new.id
      and email is distinct from new.email;
    return new;
end;
$$;

-- Le trigger sur auth.users nécessite que l'extension soit déjà créée
-- (Supabase le fait automatiquement). On drop d'abord pour l'idempotence.
drop trigger if exists on_auth_user_email_update on auth.users;
create trigger on_auth_user_email_update
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.sync_profile_email_on_update();
