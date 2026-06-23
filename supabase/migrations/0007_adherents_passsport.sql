-- =============================================================
-- Migration 0007 — Pass'Sport au niveau adhérent
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Le « Pass'Sport » (aide de l'État, 50 €) est attribué PAR jeune éligible :
-- une famille peut avoir 2 enfants éligibles = 2 × 50 €. C'est donc une
-- propriété de l'ADHÉRENT, pas du dossier. (À ne pas confondre avec le
-- `passeport_sportif` FFK déjà présent, qui est le carnet fédéral.)
-- =============================================================

alter table public.adherents
    add column if not exists pass_sport      boolean not null default false,
    add column if not exists pass_sport_code text    not null default '';
