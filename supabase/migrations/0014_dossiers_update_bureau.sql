-- =============================================================
-- Migration 0014 — Durcissement RLS : `dossiers` modifiable bureau uniquement
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (drop policy if exists / create).
--
-- POURQUOI : le `montant_total` d'un dossier est le SEUIL de la règle « soldé »
-- (encaissé >= montant_total) qui débloque l'attestation et la facture. La policy
-- d'origine (0006) laissait le RÉFÉRENT modifier son propre dossier → il pouvait,
-- par appel API direct, abaisser `montant_total` (jusqu'à 0) et faire passer son
-- dossier en « soldé » SANS paiement réel (le verrou bureau-only sur `paiements`
-- ne protège que les encaissements, pas le seuil).
--
-- L'écriture de `dossiers` après création n'a AUCUN usage côté membre :
--   - l'inscription en ligne fait un INSERT (inscription.js) — conservé ;
--   - l'espace adhérent (adherent.js) est en LECTURE SEULE ;
--   - toute la gestion du dossier (statut, montant, paiements) est au bureau.
-- On réserve donc l'UPDATE au bureau. INSERT/SELECT/DELETE inchangés.
--
-- LIMITE RÉSIDUELLE CONNUE (à revisiter en Phase 3 / HelloAsso) : `montant_total`
-- reste calculé côté client et fourni à l'INSERT d'inscription. Tant que le
-- paiement est « au club » (chèque/espèces vus par le bureau), le bureau est le
-- contrôle humain ; et la FACTURE fiscale n'est de toute façon émise que sur clic
-- bureau. Le seuil deviendra fiable côté serveur quand le montant viendra du
-- prestataire de paiement plutôt que d'un dossier auto-déclaré.
-- =============================================================

drop policy if exists "dossiers_update" on public.dossiers;
create policy "dossiers_update" on public.dossiers for update to authenticated
    using (public.is_bureau())
    with check (public.is_bureau());
