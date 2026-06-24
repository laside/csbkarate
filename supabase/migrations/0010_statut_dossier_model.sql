-- =============================================================
-- Migration 0010 — Refonte du statut de dossier (Espace Bureau, Phase 2)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (le remappage conserve les valeurs
-- déjà migrées).
--
-- Le statut de dossier devient un état COMBINÉ, dérivé de DEUX axes :
--   1) pièces justificatives — par adhérent (checklist `adherents.documents`,
--      migration 0009). « Justif OK » = toutes les pièces requises validées,
--      pour TOUS les adhérents de la famille.
--   2) règlement — par dossier (somme des `paiements.encaisse` ≥ `montant_total`).
--
--   Justif OK + Règlement OK  → 'Validé'
--   Justif OK + Règlement KO  → 'En attente paiement'
--   Justif KO + Règlement OK  → 'En attente justificatifs'
--   sinon (ou famille vide)   → 'Incomplet'
--   ('Annulé' : état manuel conservé pour compatibilité, hors dérivation.)
--
-- Vocabulaire UNIFIÉ entre `dossiers.statut` et `adherents.statut_dossier`
-- (= le statut du dossier de l'adhérent, identique pour tous les membres d'une
-- même famille). Calculé et écrit par l'UI bureau (membres.js → refreshStatuts).
-- =============================================================

-- 1) adherents.statut_dossier : remap des données AVANT de poser le nouveau CHECK.
alter table public.adherents drop constraint if exists adherents_statut_dossier_check;
update public.adherents set statut_dossier = case
    when statut_dossier in ('Incomplet', 'En attente paiement', 'En attente justificatifs', 'Validé', 'Annulé') then statut_dossier
    when statut_dossier = 'Attente paiement' then 'En attente paiement'
    when statut_dossier = 'Validé' then 'Validé'
    else 'Incomplet'
end;
alter table public.adherents alter column statut_dossier set default 'Incomplet';
alter table public.adherents add constraint adherents_statut_dossier_check
    check (statut_dossier in ('Incomplet', 'En attente paiement', 'En attente justificatifs', 'Validé', 'Annulé'));

-- 2) dossiers.statut : même vocabulaire (libellés identiques).
alter table public.dossiers drop constraint if exists dossiers_statut_check;
update public.dossiers set statut = case
    when statut in ('Incomplet', 'En attente paiement', 'En attente justificatifs', 'Validé', 'Annulé') then statut
    when statut = 'valide' then 'Validé'
    when statut = 'annule' then 'Annulé'
    else 'Incomplet'   -- attente_paiement, paye_partiel, vide…
end;
alter table public.dossiers alter column statut set default 'Incomplet';
alter table public.dossiers add constraint dossiers_statut_check
    check (statut in ('Incomplet', 'En attente paiement', 'En attente justificatifs', 'Validé', 'Annulé'));
