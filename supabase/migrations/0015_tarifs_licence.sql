-- =============================================================
-- 0015 — Tarif licence FFK + cours Baby Karaté
-- =============================================================
-- 1) Ajout du tarif licence sur la table `tarifs` (fallback legacy
--    pour membres.js — la source de vérité est désormais la collection
--    `saison` JSONB, champ `tarifLicence`).
-- 2) Ajout de « Baby » à la contrainte cours_type sur `adherents`
--    (nouveau type de cours : Baby Karaté).
-- =============================================================

-- 1) Colonne tarif_licence sur la table tarifs.
ALTER TABLE public.tarifs
    ADD COLUMN IF NOT EXISTS tarif_licence integer NOT NULL DEFAULT 3700;

COMMENT ON COLUMN public.tarifs.tarif_licence
    IS 'Tarif licence FFK en centimes (37 € = 3700). Ajouté à chaque cotisation.';

-- 2) Élargir la contrainte cours_type pour accepter « Baby ».
--    Postgres ne permet pas ALTER CONSTRAINT : on drop + recreate.
ALTER TABLE public.adherents
    DROP CONSTRAINT IF EXISTS adherents_cours_type_check;

ALTER TABLE public.adherents
    ADD CONSTRAINT adherents_cours_type_check
    CHECK (cours_type IN ('Adulte', 'Enfant', 'Self-Defense', 'Baby'));
