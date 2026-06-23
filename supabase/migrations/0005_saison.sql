-- =============================================================
-- Migration 0005 — Table `saison` (document JSONB, singleton)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (IF NOT EXISTS / ON CONFLICT).
--
-- La « saison active » de la page d'accueil (libellé, plage de dates,
-- horaires d'entraînement, tarifs et notes) est une structure IMBRIQUÉE.
-- Comme pour `galerie`, on la stocke telle quelle dans UNE ligne JSONB :
-- store.js lit/écrit ce document sans le décomposer.
--
-- Pas d'archive multi-saisons : la page d'accueil n'affiche qu'une seule
-- saison à la fois. L'admin met à jour ce document chaque année (libellé,
-- dates, horaires, tarifs). Le statut « Saison active / Hors saison » est
-- calculé côté client à partir de la plage debut/fin.
-- =============================================================

-- 1) Table singleton (une seule ligne, id = 1) ----------------
create table if not exists public.saison (
    id         smallint primary key default 1,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint saison_singleton check (id = 1)
);

-- 2) Row Level Security ---------------------------------------
alter table public.saison enable row level security;

drop policy if exists "saison_select_public" on public.saison;
create policy "saison_select_public"
    on public.saison for select
    to anon, authenticated
    using (true);

drop policy if exists "saison_insert_auth" on public.saison;
create policy "saison_insert_auth"
    on public.saison for insert
    to authenticated
    with check (true);

drop policy if exists "saison_update_auth" on public.saison;
create policy "saison_update_auth"
    on public.saison for update
    to authenticated
    using (true) with check (true);

-- 3) Reprise des données existantes (contenu actuel d'index.html) ---
-- Dollar-quoting ($json$ ... $json$) : aucun échappement à gérer.
insert into public.saison (id, data) values (1, $json$
{
    "label": "2026/2027",
    "debut": "2026-09-01",
    "fin": "2027-06-30",
    "horaires": [
        {
            "groupe": "Baby Karaté & Enfants (Gr. 1)",
            "lieu": "Gymnase Auguste Delaune",
            "jours": "Mardi et Jeudi",
            "heures": "18h30 - 19h30",
            "accent": "dojo"
        },
        {
            "groupe": "Toutes cat. (sauf Baby) - Gr. 2",
            "lieu": "École Louise Michel",
            "jours": "Lundi et Vendredi",
            "heures": "18h00 - 19h00",
            "accent": "dojo"
        },
        {
            "groupe": "Ados & Adultes (dès 2011)",
            "lieu": "Gymnase Auguste Delaune",
            "jours": "Mardi et Jeudi",
            "heures": "19h30 - 21h00",
            "accent": "dojo"
        },
        {
            "groupe": "Self-Défense Féminine",
            "lieu": "Gymnase Auguste Delaune",
            "jours": "Dimanche",
            "heures": "11h00 - 12h30",
            "accent": "corail"
        }
    ],
    "tarifs": [
        { "label": "Baby Karaté", "prix": "183 €" },
        { "label": "Enfants", "prix": "203 €" },
        { "label": "Ados / Adultes", "prix": "233 €" },
        { "label": "Self-Défense Féminine", "prix": "133 €" }
    ],
    "tarifsNote": "Des remises familles sont appliquées (de -10€ à -70€ selon le nombre d'inscrits).",
    "licenceNote": "* Prévoir 37€ supplémentaires pour la licence FFK."
}
$json$::jsonb)
on conflict (id) do nothing;
