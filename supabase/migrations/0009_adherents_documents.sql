-- =============================================================
-- Migration 0009 — Validation des documents (Espace Bureau, Phase 2)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse.
--
-- Ajoute une checklist de pièces justificatives, validée MANUELLEMENT par le
-- bureau depuis la fiche dossier (membres.html). Stockée en jsonb (souple :
-- ajouter/retirer un type de document = 1 ligne de config dans membres.js,
-- sans nouvelle migration). Exemple : {"photo":true,"certificat_medical":false}.
--
-- Pas de nouvelle RLS : la colonne suit les policies existantes de `adherents`
-- (migration 0006). En pratique, seul le bureau édite cette checklist via l'UI.
-- =============================================================

alter table public.adherents
    add column if not exists documents jsonb not null default '{}'::jsonb;
