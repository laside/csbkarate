-- =============================================================
-- Migration 0004 — Table `grades`
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (IF NOT EXISTS / ON CONFLICT).
--
-- DEUX PARTICULARITÉS PAR RAPPORT À news/competitions :
--
-- 1) ORDRE D'AFFICHAGE : grades.js n'a jamais trié les données, l'ordre
--    vient uniquement de l'ordre du tableau JSON (5,4,3,2,1 puis 101→105,
--    pas un tri par id). On préserve ça avec une colonne `position`
--    (re-numérotée à chaque sauvegarde selon l'ordre du tableau côté
--    client, cf. store.js) plutôt que de trier par id.
--
-- 2) CHAMP `hidden` : avec le JSON, un grade "masqué" restait quand même
--    dans le fichier (donc visible si on regardait le JSON brut) — le
--    masquage n'était qu'un filtre d'affichage côté client. Avec Supabase
--    on peut faire mieux : la RLS interdit carrément à l'anon de lire les
--    lignes masquées. Les utilisateurs connectés (admin) voient tout,
--    pour pouvoir les "Afficher" à nouveau depuis le dashboard.
-- =============================================================

-- 1) Table -----------------------------------------------------
create table if not exists public.grades (
    id                 bigint primary key,
    position           integer not null default 0,
    type               text not null default 'kyu',
    grade              text not null default '',
    ceinture           text not null default '',
    couleur_hex        text not null default '',
    hidden             boolean not null default false,
    katas              text[] not null default '{}',
    kihon_ippon_kumite text[] not null default '{}',
    sanbon_kumite      text[] not null default '{}',
    ohyo_kumite        text[] not null default '{}',
    age_minimum        text not null default '',
    temps_attente      text not null default '',
    licences           text not null default '',
    created_at         timestamptz not null default now()
);

-- 2) Row Level Security ---------------------------------------
alter table public.grades enable row level security;

-- Lecture publique (anon) : uniquement les grades NON masqués.
drop policy if exists "grades_select_public" on public.grades;
create policy "grades_select_public"
    on public.grades for select
    to anon
    using (hidden = false);

-- Lecture admin (connecté) : tout, y compris les grades masqués.
drop policy if exists "grades_select_auth" on public.grades;
create policy "grades_select_auth"
    on public.grades for select
    to authenticated
    using (true);

drop policy if exists "grades_insert_auth" on public.grades;
create policy "grades_insert_auth"
    on public.grades for insert
    to authenticated
    with check (true);

drop policy if exists "grades_update_auth" on public.grades;
create policy "grades_update_auth"
    on public.grades for update
    to authenticated
    using (true) with check (true);

drop policy if exists "grades_delete_auth" on public.grades;
create policy "grades_delete_auth"
    on public.grades for delete
    to authenticated
    using (true);

-- 3) Reprise des données existantes (data/grades.json) --------
insert into public.grades
    (id, position, type, grade, ceinture, couleur_hex, hidden, katas, kihon_ippon_kumite, sanbon_kumite, ohyo_kumite, age_minimum, temps_attente, licences)
values
    (5, 0, 'kyu', '5ème Kyu', 'Jaune', '#F2C94C', false,
        array['Pinan Nidan'],
        array['Jodan Uke'],
        array['Chudan Uke : Ipponme (n°1), Nihonme (n°2)'],
        array[]::text[],
        '', '', ''),
    (4, 1, 'kyu', '4ème Kyu', 'Orange', '#E8833A', false,
        array['Pinan Nidan', 'Pinan Shodan'],
        array['Jodan Uke', 'Chudan Uke'],
        array['Chudan Uke : n°1, n°2', 'Jodan Uke : Ipponme (n°1), Nihonme (n°2)'],
        array[]::text[],
        '', '', ''),
    (3, 2, 'kyu', '3ème Kyu', 'Verte', '#2E9E5B', false,
        array['Pinan Nidan', 'Pinan Shodan', 'Pinan Sandan'],
        array['Jodan Uke', 'Chudan Uke', 'Maegeri Uke'],
        array['Chudan Uke : n°1, n°2', 'Jodan Uke : Sanbonme (n°3), Yonhonme (n°4)', 'Maegeri Uke : Ipponme (n°1), Nihonme (n°2)'],
        array['Ipponme (n°1)', 'Nihonme (n°2)', 'Sanbonme (n°3)'],
        '', '', ''),
    (2, 3, 'kyu', '2ème Kyu', 'Bleue', '#2F73C9', false,
        array['Pinan Nidan', 'Pinan Shodan', 'Pinan Sandan', 'Pinan Yodan'],
        array['Jodan Uke', 'Chudan Uke', 'Maegeri Uke', 'Mawashigeri Uke'],
        array['Chudan Uke : n°1, n°2', 'Jodan Uke : n°1, n°3', 'Maegeri Uke : Sanbonme (n°3), Yonhonme (n°4)'],
        array['Yonhonme (n°4)', 'Gohonme (n°5)'],
        '', '', ''),
    (1, 4, 'kyu', '1er Kyu', 'Marron', '#6F4528', false,
        array['Pinan Nidan', 'Pinan Shodan', 'Pinan Sandan', 'Pinan Yodan', 'Pinan Godan'],
        array['Jodan Uke', 'Chudan Uke', 'Maegeri Uke', 'Mawashigeri Uke', 'Sokutogeri Chudan Uke'],
        array['Chudan Uke : n°1, n°2', 'Jodan Uke : n°2, n°4', 'Maegeri Uke : Gohonme (n°5), Ropponme (n°6)'],
        array['Ropponme (n°6)', 'Nanahonme (n°7)', 'Napponme (n°8)'],
        '', '', ''),
    (101, 5, 'dan', '1er Dan', 'Noire', '#0D1B2A', false,
        array['Pinan Nidan', 'Pinan Shodan', 'Pinan Sandan', 'Pinan Yodan', 'Pinan Godan', 'Naïfanchi Shodan'],
        array[]::text[], array[]::text[], array[]::text[],
        '14 ans', 'Ceinture marron (1er Kyu) validée', '3 licences d''entraînement'),
    (102, 6, 'dan', '2ème Dan', 'Noire', '#0D1B2A', false,
        array['Bassai', 'Kushanku', 'Seishan', 'Jion', 'Wanshu'],
        array[]::text[], array[]::text[], array[]::text[],
        '17 ans', '2 ans d''intervalle depuis le 1er Dan', '2 licences post-1er Dan'),
    (103, 7, 'dan', '3ème Dan', 'Noire', '#0D1B2A', false,
        array['Kushanku', 'Chinto', 'Niseishi', 'Jitte', 'Rohai'],
        array[]::text[], array[]::text[], array[]::text[],
        '21 ans', '3 ans d''intervalle depuis le 2ème Dan', '3 licences post-2ème Dan'),
    (104, 8, 'dan', '4ème Dan', 'Noire', '#0D1B2A', false,
        array['Kushanku', 'Seishan', 'Chinto', 'Niseishi', 'Jitte'],
        array[]::text[], array[]::text[], array[]::text[],
        '25 ans', '4 ans d''intervalle depuis le 3ème Dan', '4 licences post-3ème Dan'),
    (105, 9, 'dan', '5ème Dan', 'Noire', '#0D1B2A', false,
        array['Jion', 'Rohai', 'Bassai', 'Seishan', 'Naihanchi'],
        array[]::text[], array[]::text[], array[]::text[],
        '30 ans', '5 ans d''intervalle depuis le 4ème Dan', '5 licences post-4ème Dan')
on conflict (id) do nothing;
