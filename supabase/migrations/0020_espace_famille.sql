-- =============================================================
-- Migration 0020 — Espace Famille : validation bureau + badge « Nouveau »
--                   + pièces jointes multiples par adhérent
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS + backfill borné).
--
-- Trois ajouts sur `adherents`, tous portés par les policies RLS existantes
-- (migration 0006, aucune nouvelle policy nécessaire) :
--
--  1) `statut_validation` — décision EXPLICITE du bureau sur chaque adhérent
--     ('en_attente' → 'accepte' | 'refuse'). C'est un AXE DISTINCT du
--     `statut_dossier` combiné (pièces × règlement, migration 0010, calculé) :
--     un dossier peut être complet ET l'adhérent pas encore accepté par le
--     bureau, ou inversement. Le bureau accepte/refuse à la main dans la fiche.
--
--  2) `is_new` — flag temporaire « Nouveau » : passé à TRUE quand une famille
--     ajoute un adhérent (Espace Famille ou inscription), remis à FALSE
--     automatiquement dès que le bureau ouvre la fiche du dossier une 1re fois.
--     Sert d'indicateur visuel dans le tableau de l'Espace Bureau.
--
--  3) `documents_files` — chemins Storage (bucket privé `dossiers`) des pièces
--     téléversées par la famille, indexés par clé de document
--     (ex. {"certificat_medical":"<uid>/...pdf","reglement_interieur":"<uid>/..."}).
--     Complète `photo_path` (photo d'identité) SANS le remplacer : le bureau
--     visualise ces fichiers (URL signée) puis coche la checklist `documents`
--     (jsonb de booléens, migration 0009) qui reste sa validation manuelle.
-- =============================================================

alter table public.adherents
    add column if not exists statut_validation text not null default 'en_attente'
        check (statut_validation in ('en_attente', 'accepte', 'refuse')),
    add column if not exists is_new          boolean not null default false,
    add column if not exists documents_files jsonb   not null default '{}'::jsonb,
    add column if not exists validation_note text    not null default '';

-- Backfill : les adhérents déjà connus du bureau ne sont pas « nouveaux ».
-- (Le DEFAULT false suffit à la création de la colonne ; ce UPDATE est un
--  filet explicite si la colonne préexistait avec une autre valeur.)
update public.adherents set is_new = false where is_new is null;
