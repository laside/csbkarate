-- =============================================================
-- Migration 0001 — Table `news` (pilote de la bascule Supabase)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (IF NOT EXISTS / ON CONFLICT).
--
-- Modèle de sécurité :
--   - Lecture (SELECT)  : publique (anon + authenticated) -> le site public lit sans login.
--   - Écriture (INSERT/UPDATE/DELETE) : réservée aux utilisateurs CONNECTÉS
--     (l'admin via Supabase Auth). La clé `anon` publique ne peut donc PAS écrire.
-- =============================================================

-- 1) Table -----------------------------------------------------
-- `id` reste un bigint fourni par le client (le Date.now() de news.js),
-- pour ne rien changer côté page. Pas d'identity : on insère l'id nous-mêmes.
create table if not exists public.news (
    id         bigint primary key,
    date       text not null default '',
    category   text not null default '',
    title      text not null default '',
    excerpt    text not null default '',
    image      text not null default '',
    created_at timestamptz not null default now()
);

-- 2) Row Level Security ---------------------------------------
alter table public.news enable row level security;

-- Lecture publique
drop policy if exists "news_select_public" on public.news;
create policy "news_select_public"
    on public.news for select
    to anon, authenticated
    using (true);

-- Écriture réservée aux connectés (admin)
drop policy if exists "news_insert_auth" on public.news;
create policy "news_insert_auth"
    on public.news for insert
    to authenticated
    with check (true);

drop policy if exists "news_update_auth" on public.news;
create policy "news_update_auth"
    on public.news for update
    to authenticated
    using (true) with check (true);

drop policy if exists "news_delete_auth" on public.news;
create policy "news_delete_auth"
    on public.news for delete
    to authenticated
    using (true);

-- 3) Reprise des données existantes (data/news.json) ----------
-- On conserve les id d'origine. ON CONFLICT : ne réécrase pas si déjà importé.
insert into public.news (id, date, category, title, excerpt, image) values
    (1781835622660, '01/09/2026', 'Événement', 'Un Nouveau site pour le club', 'Version en construction', 'site.jpg'),
    (1, '12 Nov 2025', 'Événement', 'Assemblée Générale 2025-2026', 'Convocation à l''assemblée générale ordinaire du CSB Karaté. Invitation à tous les membres du club pour faire le bilan de l''année.', 'groupe1.jpg'),
    (2, '06 Sept 2025', 'Rentrée', 'Reprise des cours saison 2025', 'Le 6 septembre au Forum des associations. Début de la Self-Défense Féminine le 7 sept et reprise du Karaté le 9 sept.', '')
on conflict (id) do nothing;
