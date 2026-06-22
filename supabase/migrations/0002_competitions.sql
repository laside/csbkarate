-- =============================================================
-- Migration 0002 — Table `competitions`
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (IF NOT EXISTS / ON CONFLICT).
-- Même modèle de sécurité que 0001_news.sql.
-- =============================================================

-- 1) Table -----------------------------------------------------
-- `id` reste un bigint fourni par le client (Date.now() de competitions.html).
-- `image` : noms de fichiers séparés par des virgules (inchangé, cf. comp.image.split(',')).
create table if not exists public.competitions (
    id         bigint primary key,
    date       text not null default '',
    title      text not null default '',
    location   text not null default '',
    image      text not null default '',
    results    text not null default '',
    created_at timestamptz not null default now()
);

-- 2) Row Level Security ---------------------------------------
alter table public.competitions enable row level security;

drop policy if exists "competitions_select_public" on public.competitions;
create policy "competitions_select_public"
    on public.competitions for select
    to anon, authenticated
    using (true);

drop policy if exists "competitions_insert_auth" on public.competitions;
create policy "competitions_insert_auth"
    on public.competitions for insert
    to authenticated
    with check (true);

drop policy if exists "competitions_update_auth" on public.competitions;
create policy "competitions_update_auth"
    on public.competitions for update
    to authenticated
    using (true) with check (true);

drop policy if exists "competitions_delete_auth" on public.competitions;
create policy "competitions_delete_auth"
    on public.competitions for delete
    to authenticated
    using (true);

-- 3) Reprise des données existantes (data/competitions.json) ---
insert into public.competitions (id, date, title, location, image, results) values
    (1708500000000, '21 Février 2025', 'Open d''Île de France Combat', 'Nogent-sur-Marne', 'T1.jpg,T2.jpg', 'Junior Masculin (-61 kg) : Ryad Moukaddi (3ème - Qualifié aux Championnats de France)'),
    (1706800000000, '02 Février 2025', 'Championnats d''Île de France Combat', 'Paris 14ème', 'aff1.jpg', 'Benjamin Masculin (-55 kg) : Maxe Schording Bazin (3ème D2)'),
    (1705000000000, '11 & 12 Janvier 2025', 'Championnats de l''Essonne Combat', 'Évry-Courcouronnes', 'cess.jpg', 'Junior Féminine (-66 kg) : Nejma Moukaddi (1ère)
Minime Féminine (-40 kg) : Naomie Valluet (1ère)
Sénior Féminine (-66 kg) : Nejma Moukaddi (2ème)
Cadette (-60 kg) : Eva Bolhy (3ème)
Minime Féminine (-45 kg) : Issra Amari (3ème)'),
    (1697800000000, '20 Octobre 2024', 'Coupe de l''Essonne Combat', 'Saint-Michel-sur-Orge', '', 'Benjamin Masculin (-55kg) : Maxe Schording Bazin (2ème)
Pupille Féminine (-40kg) : Emy Schording Bazin (3ème)
Pupille Féminine (-25kg) : Soraya Haouach (3ème)'),
    (1677300000000, '25 Février 2024', 'Championnat Île de France Combat Minimes', 'Saint-Michel-sur-Orge', '', 'Minime (-40 Kg) : Jack Bonneau (3ème div 1 - Qualifié Champ. France)
Minime (-50 Kg) : Ryad Moukkadi (2ème div 1 - Qualifié Champ. France)')
on conflict (id) do nothing;
