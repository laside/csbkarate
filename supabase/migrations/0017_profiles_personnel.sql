-- =============================================================
-- Migration 0017 — Champs profil personnel dans `profiles`
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Ajoute les colonnes `prenom`, `nom`, `telephone` à `public.profiles`
-- pour que chaque utilisateur (bureau, enseignant, adhérent) puisse
-- consulter et modifier ses informations personnelles sans dépendre
-- de la table `familles` (qui n'existe que pour les référents).
--
-- L'email est déjà recopié dans `profiles.email` (migration 0008).
-- =============================================================

alter table public.profiles
    add column if not exists prenom    text not null default '',
    add column if not exists nom       text not null default '',
    add column if not exists telephone text not null default '';

-- Backfill depuis `familles` pour les comptes qui sont référents
-- (le référent est la personne qui a créé le compte famille).
update public.profiles p
set
    prenom    = coalesce(p.prenom, ''),
    nom       = coalesce(f.nom_referent, p.nom, ''),
    telephone = coalesce(f.telephone_urgence, p.telephone, '')
from public.familles f
where f.referent_user_id = p.user_id
  and coalesce(p.nom, '') = '';
