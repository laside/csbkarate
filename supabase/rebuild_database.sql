-- #############################################################################
-- ##  CSB KARATÉ — RECONSTRUCTION COMPLÈTE DE LA BASE  ########################
-- #############################################################################
--
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run (tout d'un coup).
--
-- CE QUE FAIT CE SCRIPT (dans l'ordre) :
--   SECTION 0 — TEARDOWN : supprime TOUTES les tables/fonctions/triggers/buckets
--               du projet + les comptes de test « @seed.test ». (Les vrais
--               comptes, dont admin@csbk.com et marsella.lorenzo@gmail.com,
--               sont CONSERVÉS pour garder la possibilité de se connecter.)
--   SECTION 1 — SCHÉMA : rejoue les migrations 0001 → 0019 (recrée tout propre).
--   SECTION 2 — SEED SAISON V2.0 : réécrit la saison AVEC `coursType` + `tarifLicence`
--               (sinon l'inscription en ligne retombe sur les prix codés en dur).
--   SECTION 3 — COMPTE ADMIN DE TEST (admin@csbk.com).
--   SECTION 4 — JEU DE TEST : 20 adhérents (7 bureau, 3 enseignants, 10 adhérents).
--
-- ⚠️ DESTRUCTIF : toutes les données métier ET les images uploadées (buckets
--    dossiers/galerie/news) sont effacées. À réserver à un projet de DEV / recette.
--
-- ⚠️ PRÉ-REQUIS UNIQUE (une seule fois, via l'interface) :
--    Le compte admin@csbk.com doit EXISTER. S'il n'existe pas, créez-le via
--    Dashboard > Authentication > Add user (email admin@csbk.com, n'importe quel
--    mot de passe — la SECTION 3 le réinitialisera à « wW4566$ »), puis relancez.
--    Idem pour « Confirm email » : doit être désactivé (Auth > Providers > Email)
--    pour que le parcours d'inscription en ligne fonctionne.
--
-- ⚠️ Si une instruction « ... policy on storage.objects » est refusée (droits),
--    gérez ces policies via Dashboard > Storage > Policies (mêmes conditions).
--    Le reste du script reste valide.
-- #############################################################################


-- =============================================================================
-- SECTION 0 — TEARDOWN (remise à zéro)
-- =============================================================================

-- 0.1) Policies Storage (sur storage.objects) — droppées avant les buckets et
--      avant les fonctions RLS qu'elles référencent (is_bureau).
drop policy if exists "galerie_select_public"               on storage.objects;
drop policy if exists "galerie_insert_auth"                 on storage.objects;
drop policy if exists "galerie_update_auth"                 on storage.objects;
drop policy if exists "galerie_delete_auth"                 on storage.objects;
drop policy if exists "news_select_public"                  on storage.objects;
drop policy if exists "news_insert_auth"                    on storage.objects;
drop policy if exists "news_update_auth"                    on storage.objects;
drop policy if exists "news_delete_auth"                    on storage.objects;
drop policy if exists "dossiers_obj_insert_own"             on storage.objects;
drop policy if exists "dossiers_obj_select_own_or_bureau"   on storage.objects;
drop policy if exists "dossiers_obj_delete_own_or_bureau"   on storage.objects;

-- 0.2) Buckets Storage : CONSERVÉS tels quels.
--      Supabase interdit la suppression directe des objets en SQL
--      (trigger storage.protect_delete → erreur 42501). Inutile d'y toucher :
--      les migrations 0006/0011/0012 recréent les buckets en « on conflict do
--      nothing », donc aucun drop n'est nécessaire pour reconstruire le schéma.
--      ▶ Pour repartir d'images VIERGES, vider les buckets dossiers/galerie/news
--        à la main via Dashboard > Storage (ou l'API Storage), avant ce script.

-- 0.3) Triggers Auth (recréés par 0006/0008, puis 0018 pour on_auth_user_email_update).
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_email_update on auth.users;

-- 0.4) Tables métier + CMS (CASCADE : emporte policies, index, contraintes, FK).
drop table if exists public.factures     cascade;
drop table if exists public.paiements    cascade;
drop table if exists public.dossiers     cascade;
drop table if exists public.adherents    cascade;
drop table if exists public.familles     cascade;
drop table if exists public.profiles     cascade;
drop table if exists public.tarifs       cascade;
drop table if exists public.news         cascade;
drop table if exists public.competitions cascade;
drop table if exists public.galerie      cascade;
drop table if exists public.grades       cascade;
drop table if exists public.cours         cascade;
drop table if exists public.saisons       cascade;
drop table if exists public.saison        cascade;

-- 0.5) Séquence de numérotation des factures.
drop sequence if exists public.factures_numero_seq;

-- 0.6) Fonctions (CASCADE : au cas où une dépendance subsiste).
drop function if exists public.emettre_facture(bigint)     cascade;
drop function if exists public.handle_new_user()           cascade;
drop function if exists public.is_staff()                  cascade;
drop function if exists public.is_bureau()                 cascade;
drop function if exists public.my_famille_id()             cascade;
drop function if exists public.sync_profile_email_on_update() cascade;
drop function if exists public.ensure_profile()            cascade;

-- 0.7) Comptes de TEST uniquement (@seed.test). Les vrais comptes sont conservés.
--      La cascade (profiles/familles/... via FK) a déjà été emportée par le
--      drop des tables ; ici on nettoie juste auth.users côté données de test.
delete from auth.users where email like '%@seed.test';

-- Fin SECTION 0. La base est vide ; les sections suivantes la reconstruisent.


-- =============================================================================
-- SECTION 1 — SCHEMA (migrations 0001 -> 0019, rejouees dans l ordre)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- >>> migration 0001_news
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0002_competitions
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0003_galerie
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0003 — Table `galerie` (document JSONB, singleton)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse (IF NOT EXISTS / ON CONFLICT).
--
-- La galerie est une structure IMBRIQUÉE (sections plates + stages). Plutôt
-- que de la normaliser, on la stocke telle quelle dans UNE ligne JSONB :
-- store.js lit/écrit ce document sans le décomposer, galerie.js inchangé.
--
-- NOTE STORAGE : cette migration ne déplace que la STRUCTURE de la galerie
-- (quelles photos, dans quelle section/stage). Les fichiers images restent
-- pour l'instant dans assets/photos/galerie/ et sont référencés par leur nom.
-- Le passage à Supabase Storage (upload réel des images) est une étape à part.
-- =============================================================

-- 1) Table singleton (une seule ligne, id = 1) ----------------
create table if not exists public.galerie (
    id         smallint primary key default 1,
    data       jsonb not null default '{"sections":{"club":[],"competitions":[],"entrainement":[],"stages":[]}}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint galerie_singleton check (id = 1)
);

-- 2) Row Level Security ---------------------------------------
alter table public.galerie enable row level security;

drop policy if exists "galerie_select_public" on public.galerie;
create policy "galerie_select_public"
    on public.galerie for select
    to anon, authenticated
    using (true);

drop policy if exists "galerie_insert_auth" on public.galerie;
create policy "galerie_insert_auth"
    on public.galerie for insert
    to authenticated
    with check (true);

drop policy if exists "galerie_update_auth" on public.galerie;
create policy "galerie_update_auth"
    on public.galerie for update
    to authenticated
    using (true) with check (true);

-- 3) Reprise des données existantes (data/galerie.json) -------
-- Dollar-quoting ($json$ ... $json$) : aucun échappement à gérer.
insert into public.galerie (id, data) values (1, $json$
{
    "sections": {
        "club": [],
        "competitions": [
            "4939_1182789329973_1235409397_483775_7867040_n.jpg",
            "IMG_2615-b.jpg",
            "IMG_4279.JPG",
            "IMG_4904b.jpg",
            "IMG_5704.JPG",
            "Im-Laetitia.jpg"
        ],
        "entrainement": [
            "Alexis-et-math-kata-3.jpg",
            "IMG_4398b.jpg",
            "IMG_4405b.jpg",
            "IMG_4406b.jpg",
            "IMG_4407b.jpg",
            "IMG_4411b.jpg",
            "IMG_4416b.jpg",
            "IMG_4421b.jpg",
            "IMG_4423b.jpg",
            "IMG_4425b.jpg",
            "IMG_4453b.jpg",
            "IMG_4466b.jpg",
            "IMG_4491b.jpg",
            "IMG_4492b.jpg",
            "IMG_4516b.jpg",
            "IMG_4574b.jpg",
            "IMG_4592.JPG",
            "P1070459.JPG",
            "P1070462-b.JPG",
            "Photo-decembre-2011.jpg"
        ],
        "stages": [
            {
                "nom": "Stage Enfants 2014",
                "dossier": "Stage_enfants_2014",
                "photos": ["Stage_enfants_2014_03.jpg"]
            },
            {
                "nom": "Stage 2014 Baby",
                "dossier": "Stage_2014_baby",
                "photos": [
                    "Stage_2014_baby_03.jpg",
                    "Stage_2014_baby_04.jpg",
                    "Stage_2014_baby_05.jpg",
                    "Stage_2014_baby_06.jpg",
                    "Stage_2014_baby_07.jpg"
                ]
            },
            {
                "nom": "Stage 2014",
                "dossier": "Stage_2014",
                "photos": [
                    "Stage_2014_03.jpg",
                    "Stage_2014_04.jpg",
                    "Stage_2014_05.jpg",
                    "Stage_2014_06.jpg",
                    "Stage_2014_07.jpg"
                ]
            },
            {
                "nom": "Stage 2013 Baby",
                "dossier": "Stage_2013_baby",
                "photos": [
                    "Stage_2013_baby_03.jpg",
                    "Stage_2013_baby_04.jpg",
                    "Stage_2013_baby_05.jpg",
                    "Stage_2013_baby_06.jpg",
                    "Stage_2013_baby_07.jpg",
                    "Stage_2013_baby_08.jpg",
                    "Stage_2013_baby_09.jpg",
                    "Stage_2013_baby_10.jpg"
                ]
            },
            {
                "nom": "Stage 2013",
                "dossier": "Stage_2013",
                "photos": [
                    "Stage_2013_03.jpg",
                    "Stage_2013_04.jpg",
                    "Stage_2013_05.jpg",
                    "Stage_2013_06.jpg",
                    "Stage_2013_07.jpg",
                    "Stage_2013_08.jpg",
                    "Stage_2013_09.jpg"
                ]
            },
            {
                "nom": "Stage 2012 Baby",
                "dossier": "Stage_2012_Baby",
                "photos": [
                    "Stage_2012_Baby_03.jpg",
                    "Stage_2012_Baby_04.jpg",
                    "Stage_2012_Baby_05.jpg"
                ]
            },
            {
                "nom": "Stage 2012",
                "dossier": "Stage_2012",
                "photos": [
                    "Stage_2012_03.jpg",
                    "Stage_2012_04.jpg",
                    "Stage_2012_05.jpg",
                    "Stage_2012_06.jpg",
                    "Stage_2012_07.jpg",
                    "Stage_2012_08.jpg",
                    "Stage_2012_09.jpg",
                    "Stage_2012_10.jpg",
                    "Stage_2012_11.jpg",
                    "Stage_2012_12.jpg",
                    "Stage_2012_13.jpg",
                    "Stage_2012_14.jpg",
                    "Stage_2012_15.jpg",
                    "Stage_2012_16.jpg",
                    "Stage_2012_17.jpg",
                    "Stage_2012_18.jpg",
                    "Stage_2012_19.jpg",
                    "Stage_2012_20.jpg"
                ]
            },
            {
                "nom": "Stage 2011",
                "dossier": "Stage_2011",
                "photos": [
                    "Stage_2011_03.jpg",
                    "Stage_2011_04.jpg",
                    "Stage_2011_05.jpg",
                    "Stage_2011_06.jpg",
                    "Stage_2011_07.jpg",
                    "Stage_2011_08.jpg",
                    "Stage_2011_09.jpg",
                    "Stage_2011_10.jpg"
                ]
            },
            {
                "nom": "Stage 2010",
                "dossier": "Stage_2010",
                "photos": [
                    "Stage_2010_03.jpg",
                    "Stage_2010_04.jpg",
                    "Stage_2010_05.jpg",
                    "Stage_2010_06.jpg",
                    "Stage_2010_07.jpg",
                    "Stage_2010_08.jpg"
                ]
            },
            {
                "nom": "Stage 2009",
                "dossier": "Stage_2009",
                "photos": [
                    "Stage_2009_03.jpg",
                    "Stage_2009_04.jpg",
                    "Stage_2009_05.jpg",
                    "Stage_2009_06.jpg",
                    "Stage_2009_07.jpg",
                    "Stage_2009_08.jpg"
                ]
            },
            {
                "nom": "Initiation Self-Défense Féminine",
                "dossier": "Initiation_self_defense",
                "photos": [
                    "Initiation_self_defense_03.jpg",
                    "Initiation_self_defense_04.jpg",
                    "Initiation_self_defense_05.jpg",
                    "Initiation_self_defense_06.jpg",
                    "Initiation_self_defense_07.jpg",
                    "Initiation_self_defense_08.jpg"
                ]
            }
        ]
    }
}
$json$::jsonb)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- >>> migration 0004_grades
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0005_saison
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0006_gestion_foundations
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0006 — Fondations du module « Gestion de club »
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse.
--
-- Pose le socle du portail de gestion (inscription, adhérents, paiements) :
--   - auth MULTI-RÔLES (bureau / enseignant / adhérent) via `profiles`,
--   - les 6 tables métier + leur RLS,
--   - un bucket Storage PRIVÉ pour les pièces (photos d'identité de mineurs).
--
-- MODÈLE DE SÉCURITÉ (résumé) :
--   - adhérent  : ne voit/écrit QUE sa propre famille (RLS scopée par auth.uid()).
--   - enseignant: lit les adhérents + met à jour les grades.
--   - bureau    : accès total (secrétariat / trésorier / admin).
--   - POINT CRITIQUE : seul le `bureau` peut écrire dans `paiements`
--     (encaissement). Un membre ne peut JAMAIS marquer son propre paiement
--     comme encaissé → la « règle d'or » des attestations reste inviolable.
--
-- ⚠️ RGPD : `adherents.photo_path` pointe vers le bucket PRIVÉ `dossiers`
-- (données de mineurs). Jamais de bucket public ici (≠ galerie).
-- =============================================================


-- =============================================================
-- 1) RÔLES : table `profiles`
-- =============================================================
-- Chaque utilisateur Auth a une ligne `profiles` (rôle). Un trigger crée
-- automatiquement la ligne (rôle 'adherent') à chaque inscription Auth.
-- (Les fonctions d'aide RLS et le trigger sont définis en section 2bis,
-- une fois que toutes les tables qu'ils référencent (dont `familles`)
-- existent — Postgres valide le corps des fonctions SQL à la création.)
create table if not exists public.profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    role       text not null default 'adherent' check (role in ('bureau', 'enseignant', 'adherent')),
    created_at timestamptz not null default now()
);


-- =============================================================
-- 2) TABLES MÉTIER
-- =============================================================
-- Montants TOUJOURS en CENTIMES (integer) : cohérent avec HelloAsso (phase 3)
-- et évite les erreurs d'arrondi des flottants. 210 € => 21000.

-- Config tarifaire, éditable par le bureau, une ligne par saison.
create table if not exists public.tarifs (
    saison            text primary key,
    cotisation_adulte integer not null default 21000,
    cotisation_enfant integer not null default 18000,
    cotisation_self   integer not null default 13000,
    tarif_bureau      integer not null default 3700,
    remise_passsport  integer not null default 5000,
    -- remises famille : { "2":1000, "3":3000, "4":5000, "5":7000 } (clé = nb d'inscrits, "5" = 5 et +).
    remises_famille   jsonb   not null default '{"2":1000,"3":3000,"4":5000,"5":7000}'::jsonb,
    actif             boolean not null default true,
    created_at        timestamptz not null default now()
);

-- Le foyer + le compte du référent (parent). 1 référent = 1 famille.
create table if not exists public.familles (
    id                bigint generated by default as identity primary key,
    referent_user_id  uuid not null unique references auth.users(id) on delete cascade,
    nom_referent      text not null default '',
    telephone_urgence text not null default '',
    adresse           text not null default '',
    code_postal       text not null default '',
    ville             text not null default '',
    created_at        timestamptz not null default now()
);

-- Une personne pratiquante, rattachée à une famille.
-- NB : `email` volontairement NON unique en base (des frères/sœurs peuvent
-- partager l'email d'un parent). L'unicité « FFK » est une règle métier
-- fédérale, pas une contrainte technique à imposer ici.
create table if not exists public.adherents (
    id                 bigint generated by default as identity primary key,
    famille_id         bigint not null references public.familles(id) on delete cascade,
    nom                text not null default '',
    prenom             text not null default '',
    date_naissance     date,
    genre              text check (genre in ('M', 'F')),
    email              text,
    cours_type         text check (cours_type in ('Adulte', 'Enfant', 'Self-Defense')),
    membre_bureau      boolean not null default false,
    passeport_sportif  boolean not null default false,
    numero_passeport   text not null default '',
    attestation_caf_ce boolean not null default false,
    droit_image        boolean not null default true,
    photo_path         text not null default '',
    grade_actuel       text not null default 'Ceinture Blanche',
    statut_dossier     text not null default 'Incomplet'
                            check (statut_dossier in ('Incomplet', 'Attente paiement', 'Validé')),
    created_at         timestamptz not null default now()
);

-- Le « panier » d'une inscription famille (la remise famille se calcule dessus).
create table if not exists public.dossiers (
    id            bigint generated by default as identity primary key,
    famille_id    bigint not null references public.familles(id) on delete cascade,
    saison        text not null default '',
    montant_total integer not null default 0,             -- centimes
    detail_calcul jsonb   not null default '{}'::jsonb,    -- traçabilité du calcul
    mode_paiement text not null default 'au_club' check (mode_paiement in ('au_club', 'en_ligne')),
    statut        text not null default 'attente_paiement'
                       check (statut in ('attente_paiement', 'paye_partiel', 'valide', 'annule')),
    created_at    timestamptz not null default now()
);

-- Les échéances de règlement (ex. 3 chèques). Écrit UNIQUEMENT par le bureau
-- au fur et à mesure des encaissements (cf. RLS). C'est ce qui conditionne
-- l'attestation : dossier réglé <=> toutes ses lignes `encaisse = true`.
create table if not exists public.paiements (
    id                bigint generated by default as identity primary key,
    dossier_id        bigint not null references public.dossiers(id) on delete cascade,
    montant           integer not null default 0,         -- centimes
    mode              text not null default 'cheque' check (mode in ('cheque', 'espece', 'cb', 'ancv', 'caf')),
    numero_cheque     text not null default '',
    encaisse          boolean not null default false,
    date_encaissement date,
    created_at        timestamptz not null default now()
);

-- Index sur les clés étrangères (jointures fréquentes côté bureau).
create index if not exists idx_familles_referent on public.familles(referent_user_id);
create index if not exists idx_adherents_famille on public.adherents(famille_id);
create index if not exists idx_dossiers_famille  on public.dossiers(famille_id);
create index if not exists idx_paiements_dossier on public.paiements(dossier_id);


-- =============================================================
-- 2bis) FONCTIONS D'AIDE RLS + TRIGGER
-- =============================================================
-- Définies ici (après les tables) car `my_famille_id()` référence
-- `public.familles`, qui doit déjà exister.
-- SECURITY DEFINER : elles lisent `profiles` en CONTOURNANT la RLS,
-- ce qui évite la récursion infinie (une policy sur profiles qui lirait profiles).
create or replace function public.is_bureau()
returns boolean language sql security definer stable set search_path = public as $$
    select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'bureau');
$$;

-- Personnel encadrant = bureau OU enseignant.
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
    select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('bureau', 'enseignant'));
$$;

-- Id de la famille dont l'utilisateur courant est le référent (une seule).
create or replace function public.my_famille_id()
returns bigint language sql security definer stable set search_path = public as $$
    select id from public.familles where referent_user_id = auth.uid() limit 1;
$$;

-- Trigger : crée le profil 'adherent' à la création d'un compte Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (user_id, role)
    values (new.id, 'adherent')
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- =============================================================
-- 3) ROW LEVEL SECURITY
-- =============================================================

-- --- profiles ---
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
    using (user_id = auth.uid() or public.is_bureau());

-- Seul le bureau (re)définit les rôles : un membre ne peut pas se promouvoir.
drop policy if exists "profiles_update_bureau" on public.profiles;
create policy "profiles_update_bureau" on public.profiles for update to authenticated
    using (public.is_bureau()) with check (public.is_bureau());
-- (pas de policy INSERT/DELETE : l'insertion passe par le trigger SECURITY DEFINER.)

-- --- tarifs (lecture publique : ce sont des prix, pas un secret) ---
alter table public.tarifs enable row level security;

drop policy if exists "tarifs_select_public" on public.tarifs;
create policy "tarifs_select_public" on public.tarifs for select to anon, authenticated
    using (true);

drop policy if exists "tarifs_insert_bureau" on public.tarifs;
create policy "tarifs_insert_bureau" on public.tarifs for insert to authenticated
    with check (public.is_bureau());
drop policy if exists "tarifs_update_bureau" on public.tarifs;
create policy "tarifs_update_bureau" on public.tarifs for update to authenticated
    using (public.is_bureau()) with check (public.is_bureau());
drop policy if exists "tarifs_delete_bureau" on public.tarifs;
create policy "tarifs_delete_bureau" on public.tarifs for delete to authenticated
    using (public.is_bureau());

-- --- familles (le membre ne voit que la sienne) ---
alter table public.familles enable row level security;

drop policy if exists "familles_select" on public.familles;
create policy "familles_select" on public.familles for select to authenticated
    using (referent_user_id = auth.uid() or public.is_bureau());

drop policy if exists "familles_insert_self" on public.familles;
create policy "familles_insert_self" on public.familles for insert to authenticated
    with check (referent_user_id = auth.uid());

drop policy if exists "familles_update" on public.familles;
create policy "familles_update" on public.familles for update to authenticated
    using (referent_user_id = auth.uid() or public.is_bureau())
    with check (referent_user_id = auth.uid() or public.is_bureau());

drop policy if exists "familles_delete_bureau" on public.familles;
create policy "familles_delete_bureau" on public.familles for delete to authenticated
    using (public.is_bureau());

-- --- adherents (membre : sa famille ; enseignant : lecture + grade) ---
alter table public.adherents enable row level security;

drop policy if exists "adherents_select" on public.adherents;
create policy "adherents_select" on public.adherents for select to authenticated
    using (famille_id = public.my_famille_id() or public.is_staff());

drop policy if exists "adherents_insert_owner" on public.adherents;
create policy "adherents_insert_owner" on public.adherents for insert to authenticated
    with check (famille_id = public.my_famille_id() or public.is_bureau());

-- Mise à jour : le référent (avant validation) OU le personnel (dont l'enseignant
-- pour le grade). Le filtrage colonne par colonne n'existe pas en RLS : on
-- accepte l'update de ligne, l'UI restreint les champs proposés par rôle.
drop policy if exists "adherents_update" on public.adherents;
create policy "adherents_update" on public.adherents for update to authenticated
    using (famille_id = public.my_famille_id() or public.is_staff())
    with check (famille_id = public.my_famille_id() or public.is_staff());

drop policy if exists "adherents_delete" on public.adherents;
create policy "adherents_delete" on public.adherents for delete to authenticated
    using (famille_id = public.my_famille_id() or public.is_bureau());

-- --- dossiers ---
alter table public.dossiers enable row level security;

drop policy if exists "dossiers_select" on public.dossiers;
create policy "dossiers_select" on public.dossiers for select to authenticated
    using (famille_id = public.my_famille_id() or public.is_bureau());

drop policy if exists "dossiers_insert_owner" on public.dossiers;
create policy "dossiers_insert_owner" on public.dossiers for insert to authenticated
    with check (famille_id = public.my_famille_id() or public.is_bureau());

drop policy if exists "dossiers_update" on public.dossiers;
create policy "dossiers_update" on public.dossiers for update to authenticated
    using (famille_id = public.my_famille_id() or public.is_bureau())
    with check (famille_id = public.my_famille_id() or public.is_bureau());

drop policy if exists "dossiers_delete_bureau" on public.dossiers;
create policy "dossiers_delete_bureau" on public.dossiers for delete to authenticated
    using (public.is_bureau());

-- --- paiements : LECTURE membre, mais ÉCRITURE bureau UNIQUEMENT ---
-- (c'est le verrou de la règle d'or : le membre ne peut pas s'auto-encaisser).
alter table public.paiements enable row level security;

drop policy if exists "paiements_select" on public.paiements;
create policy "paiements_select" on public.paiements for select to authenticated
    using (
        public.is_bureau()
        or dossier_id in (select id from public.dossiers where famille_id = public.my_famille_id())
    );

drop policy if exists "paiements_insert_bureau" on public.paiements;
create policy "paiements_insert_bureau" on public.paiements for insert to authenticated
    with check (public.is_bureau());
drop policy if exists "paiements_update_bureau" on public.paiements;
create policy "paiements_update_bureau" on public.paiements for update to authenticated
    using (public.is_bureau()) with check (public.is_bureau());
drop policy if exists "paiements_delete_bureau" on public.paiements;
create policy "paiements_delete_bureau" on public.paiements for delete to authenticated
    using (public.is_bureau());


-- =============================================================
-- 4) STORAGE — bucket PRIVÉ `dossiers` (photos d'identité, etc.)
-- =============================================================
-- Convention de chemin : `<auth.uid()>/<fichier>` → un membre n'accède qu'à
-- ses propres fichiers ; le bureau accède à tout.
-- NB : si le SQL Editor refuse ces policies (droits), les créer via
-- Dashboard > Storage > Policies (mêmes conditions).
insert into storage.buckets (id, name, public)
values ('dossiers', 'dossiers', false)
on conflict (id) do nothing;

drop policy if exists "dossiers_obj_insert_own" on storage.objects;
create policy "dossiers_obj_insert_own" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'dossiers'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "dossiers_obj_select_own_or_bureau" on storage.objects;
create policy "dossiers_obj_select_own_or_bureau" on storage.objects for select to authenticated
    using (
        bucket_id = 'dossiers'
        and ((storage.foldername(name))[1] = auth.uid()::text or public.is_bureau())
    );

drop policy if exists "dossiers_obj_delete_own_or_bureau" on storage.objects;
create policy "dossiers_obj_delete_own_or_bureau" on storage.objects for delete to authenticated
    using (
        bucket_id = 'dossiers'
        and ((storage.foldername(name))[1] = auth.uid()::text or public.is_bureau())
    );


-- =============================================================
-- 5) DONNÉES INITIALES
-- =============================================================
-- 5a) Tarifs de la saison en cours (valeurs du dossier papier 2022/2023,
--     ajustables ensuite par le bureau). Pass'Sport 50 € (change chaque année).
insert into public.tarifs (saison) values ('2026-2027')
on conflict (saison) do nothing;

-- 5b) Backfill : tous les comptes Auth existants reçoivent un profil 'adherent'…
insert into public.profiles (user_id, role)
select id, 'adherent' from auth.users
on conflict (user_id) do nothing;

-- 5c) …puis on promeut le compte admin historique en 'bureau'.
-- ⚠️ Adapter l'email si le compte bureau principal est différent.
update public.profiles
set role = 'bureau'
where user_id in (select id from auth.users where email = 'marsella.lorenzo@gmail.com');


-- -----------------------------------------------------------------------------
-- >>> migration 0007_adherents_passsport
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0007 — Pass'Sport au niveau adhérent
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Le « Pass'Sport » (aide de l'État, 50 €) est attribué PAR jeune éligible :
-- une famille peut avoir 2 enfants éligibles = 2 × 50 €. C'est donc une
-- propriété de l'ADHÉRENT, pas du dossier. (À ne pas confondre avec le
-- `passeport_sportif` FFK déjà présent, qui est le carnet fédéral.)
-- =============================================================

alter table public.adherents
    add column if not exists pass_sport      boolean not null default false,
    add column if not exists pass_sport_code text    not null default '';


-- -----------------------------------------------------------------------------
-- >>> migration 0008_profiles_email
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0008 — Email lisible dans `profiles` (écran « Comptes & rôles »)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / backfill borné).
--
-- POURQUOI : l'espace Bureau (membres.html) doit afficher QUI a un compte et
-- son rôle. Or `auth.users` n'est PAS interrogeable depuis le navigateur
-- (PostgREST ne l'expose pas). On recopie donc l'email dans `public.profiles`,
-- table déjà lisible par le bureau (RLS `profiles_select`). Pas de secret :
-- seul le bureau peut lire ces lignes (cf. policy existante).
--
-- L'email est alimenté à la création du compte (trigger ci-dessous) puis
-- backfillé pour les comptes déjà existants.
-- =============================================================

-- 1) Colonne email (vide par défaut, remplie ensuite) ----------
alter table public.profiles
    add column if not exists email text not null default '';

-- 2) Trigger de création de compte : on capte aussi l'email ----
-- (remplace la version de 0006 ; `new` = la ligne auth.users insérée.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (user_id, role, email)
    values (new.id, 'adherent', coalesce(new.email, ''))
    on conflict (user_id) do nothing;
    return new;
end;
$$;

-- 3) Backfill des comptes existants (email encore vide) --------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.user_id
  and coalesce(p.email, '') = '';


-- -----------------------------------------------------------------------------
-- >>> migration 0009_adherents_documents
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0010_statut_dossier_model
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0011_storage_galerie
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0011 — Storage Public pour la Galerie
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse.
--
-- Prépare le bucket Storage "galerie" pour uploader les photos 
-- depuis le mode administrateur.
-- =============================================================

-- Création du bucket (public car affiché sur le site web)
insert into storage.buckets (id, name, public)
values ('galerie', 'galerie', true)
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Politiques RLS (Row Level Security) sur storage.objects
-- -------------------------------------------------------------
-- Seul l'administrateur (connecté) peut modifier le contenu.
-- Tout le monde (public) peut lire le contenu.

-- 1. Lecture publique (tout le monde voit les photos)
drop policy if exists "galerie_select_public" on storage.objects;
create policy "galerie_select_public"
on storage.objects for select
to public
using ( bucket_id = 'galerie' );

-- 2. Insertion (seuls les connectés)
drop policy if exists "galerie_insert_auth" on storage.objects;
create policy "galerie_insert_auth"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'galerie' );

-- 3. Mise à jour (seuls les connectés)
drop policy if exists "galerie_update_auth" on storage.objects;
create policy "galerie_update_auth"
on storage.objects for update
to authenticated
using ( bucket_id = 'galerie' );

-- 4. Suppression (seuls les connectés)
drop policy if exists "galerie_delete_auth" on storage.objects;
create policy "galerie_delete_auth"
on storage.objects for delete
to authenticated
using ( bucket_id = 'galerie' );


-- -----------------------------------------------------------------------------
-- >>> migration 0012_storage_news
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0012 — Storage Public pour les Actualités (News)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent : ré-exécutable sans casse.
--
-- Prépare le bucket Storage "news" pour uploader les images d'illustration
-- depuis le mode administrateur.
-- =============================================================

-- Création du bucket (public car affiché sur le site web)
insert into storage.buckets (id, name, public)
values ('news', 'news', true)
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Politiques RLS (Row Level Security) sur storage.objects
-- -------------------------------------------------------------
-- Seul l'administrateur (connecté) peut modifier le contenu.
-- Tout le monde (public) peut lire le contenu.

-- 1. Lecture publique (tout le monde voit les photos)
drop policy if exists "news_select_public" on storage.objects;
create policy "news_select_public"
on storage.objects for select
to public
using ( bucket_id = 'news' );

-- 2. Insertion (seuls les connectés)
drop policy if exists "news_insert_auth" on storage.objects;
create policy "news_insert_auth"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'news' );

-- 3. Mise à jour (seuls les connectés)
drop policy if exists "news_update_auth" on storage.objects;
create policy "news_update_auth"
on storage.objects for update
to authenticated
using ( bucket_id = 'news' );

-- 4. Suppression (seuls les connectés)
drop policy if exists "news_delete_auth" on storage.objects;
create policy "news_delete_auth"
on storage.objects for delete
to authenticated
using ( bucket_id = 'news' );


-- -----------------------------------------------------------------------------
-- >>> migration 0013_factures
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0013 — Factures (documents fiscaux numérotés)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / drop policy if exists).
--
-- POURQUOI une table + une fonction (et pas une simple génération PDF) :
-- en droit français, une facture est une pièce comptable qui doit porter un
-- NUMÉRO unique issu d'une séquence chronologique CONTINUE, être émise par
-- l'association (jamais auto-émise par l'adhérent) et rester IMMUABLE.
--   → la numérotation se fait donc en base, de façon ATOMIQUE et réservée au
--     `bureau`, via la fonction `emettre_facture()` (SECURITY DEFINER).
--   → le navigateur ne fait que rendre le PDF à partir de la ligne renvoyée.
--
-- L'« attestation de paiement » (espace adhérent) est un document distinct,
-- NON fiscal : pas de numéro, générée côté client en lecture seule. Elle ne
-- passe donc PAS par cette table.
-- =============================================================


-- =============================================================
-- 1) SÉQUENCE de numérotation (continuité chronologique)
-- =============================================================
-- Une seule séquence monotone pour tout le club : garantit l'absence de
-- doublon et l'ordre d'émission. Le numéro affiché préfixe l'année d'émission
-- (ex. « 2026-0001 »), purement cosmétique ; la continuité vient de la séquence.
create sequence if not exists public.factures_numero_seq;


-- =============================================================
-- 2) TABLE `factures`
-- =============================================================
-- `dossier_id` UNIQUE : une seule facture par dossier (ré-émission = même
-- numéro, cf. `emettre_facture`). `snapshot` fige les données au moment de
-- l'émission (immuabilité : la facture ne doit pas « bouger » si la famille
-- ou les tarifs changent ensuite). Montant en CENTIMES (cohérent partout).
create table if not exists public.factures (
    id          bigint generated by default as identity primary key,
    numero      text    not null unique,
    dossier_id  bigint  not null unique references public.dossiers(id) on delete restrict,
    famille_id  bigint  not null references public.familles(id) on delete restrict,
    saison      text    not null default '',
    montant     integer not null default 0,             -- centimes (TTC)
    snapshot    jsonb   not null default '{}'::jsonb,    -- copie figée (immuabilité légale)
    emise_par   uuid    references auth.users(id),       -- membre du bureau émetteur
    emise_le    timestamptz not null default now()
);

create index if not exists idx_factures_famille on public.factures(famille_id);


-- =============================================================
-- 3) ROW LEVEL SECURITY
-- =============================================================
-- Lecture : le bureau (tout) + la famille concernée (sa propre facture).
-- Écriture : AUCUNE policy → bloquée pour tout client. La seule voie d'écriture
-- est la fonction `emettre_facture` (SECURITY DEFINER, propriétaire postgres),
-- qui contourne la RLS après avoir vérifié le rôle `bureau`. Verrou « émission
-- réservée au bureau » identique à celui des `paiements`.
alter table public.factures enable row level security;

drop policy if exists "factures_select" on public.factures;
create policy "factures_select" on public.factures for select to authenticated
    using (famille_id = public.my_famille_id() or public.is_bureau());


-- =============================================================
-- 4) FONCTION D'ÉMISSION (atomique, bureau uniquement)
-- =============================================================
-- Contrat :
--   - réservé au `bureau` (sinon exception) → respect de la législation ;
--   - refuse si le dossier n'est PAS soldé (somme encaissée >= montant_total)
--     → on ne facture jamais un règlement incomplet. Gate VOLONTAIREMENT
--     découplée du statut combiné « pièces × règlement » (migration 0010) :
--     une facture concerne l'argent reçu, pas les pièces justificatives —
--     même logique que l'attestation de paiement côté espace adhérent ;
--   - IDEMPOTENTE : si une facture existe déjà pour le dossier, on la renvoie
--     telle quelle (même numéro) → pas de doublon de numérotation ;
--   - fige un `snapshot` (référent + adresse + adhérents + détail du calcul).
create or replace function public.emettre_facture(p_dossier_id bigint)
returns public.factures
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dossier  public.dossiers;
    v_famille  public.familles;
    v_paye     integer;
    v_facture  public.factures;
    v_numero   text;
    v_snapshot jsonb;
begin
    -- 1) Garde de rôle : seul le bureau émet une facture.
    if not public.is_bureau() then
        raise exception 'Émission réservée au bureau.' using errcode = '42501';
    end if;

    -- 2) Dossier + famille.
    select * into v_dossier from public.dossiers where id = p_dossier_id;
    if not found then
        raise exception 'Dossier introuvable (%).', p_dossier_id;
    end if;
    select * into v_famille from public.familles where id = v_dossier.famille_id;

    -- 3) Idempotence : une facture déjà émise est renvoyée telle quelle.
    select * into v_facture from public.factures where dossier_id = p_dossier_id;
    if found then
        return v_facture;
    end if;

    -- 4) Le dossier doit être soldé (règlement uniquement, cf. note plus haut).
    select coalesce(sum(montant) filter (where encaisse), 0) into v_paye
    from public.paiements where dossier_id = p_dossier_id;
    if v_paye < v_dossier.montant_total then
        raise exception 'Dossier non soldé : facture impossible tant que le règlement est incomplet.'
            using errcode = 'P0001';
    end if;

    -- 5) Numéro atomique (nextval) + snapshot figé.
    v_numero := to_char(now(), 'YYYY') || '-' || lpad(nextval('public.factures_numero_seq')::text, 4, '0');

    v_snapshot := jsonb_build_object(
        'referent',    v_famille.nom_referent,
        'adresse',     v_famille.adresse,
        'code_postal', v_famille.code_postal,
        'ville',       v_famille.ville,
        'detail',      v_dossier.detail_calcul,
        'adherents',   coalesce((
            select jsonb_agg(jsonb_build_object('nom', a.nom, 'prenom', a.prenom, 'cours', a.cours_type)
                             order by a.id)
            from public.adherents a where a.famille_id = v_dossier.famille_id
        ), '[]'::jsonb)
    );

    insert into public.factures (numero, dossier_id, famille_id, saison, montant, snapshot, emise_par)
    values (v_numero, p_dossier_id, v_dossier.famille_id, v_dossier.saison,
            v_dossier.montant_total, v_snapshot, auth.uid())
    returning * into v_facture;

    return v_facture;
end;
$$;

-- La fonction est appelable par tout compte connecté ; la garde `is_bureau()`
-- à l'intérieur fait le tri (un adhérent reçoit l'exception 42501).
grant execute on function public.emettre_facture(bigint) to authenticated;


-- -----------------------------------------------------------------------------
-- >>> migration 0014_dossiers_update_bureau
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0015_tarifs_licence
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- >>> migration 0016_saisons_cours
-- -----------------------------------------------------------------------------
-- =============================================================
-- Migration 0016 — Refonte : saisons (historique) + cours (par saison)
-- =============================================================
-- POURQUOI : la table `saison` (0005, document JSONB singleton id=1) ne gérait
-- qu'UNE saison à la fois et n'avait pas de vraie notion de « cours ». On passe
-- à un modèle RELATIONNEL :
--   - `saisons` : une ligne par saison (HISTORIQUE conservé), un flag `active`
--     (au plus une seule active à la fois).
--   - `cours`   : une ligne par cours d'une saison (FK saison_id).

-- 1) TABLE `saisons` (historique multi-saisons)
create table if not exists public.saisons (
    id            bigint generated by default as identity primary key,
    label         text not null unique,
    date_debut    date,
    date_fin      date,
    active        boolean not null default false,
    tarif_licence integer not null default 3700,
    nb_licencies  integer not null default 0,
    tarifs_note   text not null default '',
    licence_note  text not null default '',
    notes         text not null default '',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create unique index if not exists uniq_saison_active
    on public.saisons (active) where active;

-- 2) TABLE `cours` (cours d'une saison)
create table if not exists public.cours (
    id           bigint generated by default as identity primary key,
    saison_id    bigint not null references public.saisons(id) on delete cascade,
    cours_type   text check (cours_type in ('Baby', 'Enfant', 'Adulte', 'Self-Defense')),
    libelle      text not null default '',
    professeur   text not null default '',
    capacite_max integer,
    jours        text not null default '',
    heures       text not null default '',
    lieu         text not null default '',
    accent       text not null default 'dojo',
    prix         integer not null default 0,
    position     integer not null default 0,
    created_at   timestamptz not null default now()
);

-- RLS : lecture publique, écriture bureau
alter table public.saisons enable row level security;
alter table public.cours   enable row level security;

drop policy if exists "saisons_select_public" on public.saisons;
create policy "saisons_select_public" on public.saisons for select to anon, authenticated using (true);

drop policy if exists "saisons_insert_bureau" on public.saisons;
create policy "saisons_insert_bureau" on public.saisons for insert to authenticated with check (public.is_bureau());

drop policy if exists "saisons_update_bureau" on public.saisons;
create policy "saisons_update_bureau" on public.saisons for update to authenticated using (public.is_bureau()) with check (public.is_bureau());

drop policy if exists "saisons_delete_bureau" on public.saisons;
create policy "saisons_delete_bureau" on public.saisons for delete to authenticated using (public.is_bureau());

drop policy if exists "cours_select_public" on public.cours;
create policy "cours_select_public" on public.cours for select to anon, authenticated using (true);

drop policy if exists "cours_insert_bureau" on public.cours;
create policy "cours_insert_bureau" on public.cours for insert to authenticated with check (public.is_bureau());

drop policy if exists "cours_update_bureau" on public.cours;
create policy "cours_update_bureau" on public.cours for update to authenticated using (public.is_bureau()) with check (public.is_bureau());

drop policy if exists "cours_delete_bureau" on public.cours;
create policy "cours_delete_bureau" on public.cours for delete to authenticated using (public.is_bureau());


-- -----------------------------------------------------------------------------
-- >>> migration 0017_profiles_personnel
-- -----------------------------------------------------------------------------
alter table public.profiles
    add column if not exists prenom    text not null default '',
    add column if not exists nom       text not null default '',
    add column if not exists telephone text not null default '';


-- -----------------------------------------------------------------------------
-- >>> migration 0018_familles_email
-- -----------------------------------------------------------------------------
alter table public.familles
    add column if not exists email text not null default '';

-- Fonction sync profile email ON UPDATE
create or replace function public.sync_profile_email_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    update public.profiles
    set email = new.email
    where user_id = new.id
      and email is distinct from new.email;
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_update on auth.users;
create trigger on_auth_user_email_update
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.sync_profile_email_on_update();


-- -----------------------------------------------------------------------------
-- >>> migration 0019_ensure_profile
-- -----------------------------------------------------------------------------
create or replace function public.ensure_profile()
returns text
language plpgsql security definer set search_path = public as $$
declare
    v_role text;
begin
    select role into v_role
    from public.profiles
    where user_id = auth.uid();

    if not found then
        v_role := 'adherent';
        insert into public.profiles (user_id, role, email)
        values (auth.uid(), v_role, coalesce(auth.jwt()->>'email', ''))
        on conflict (user_id) do nothing;
    end if;

    return v_role;
end;
$$;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
    with check (user_id = auth.uid() and role = 'adherent');


-- -----------------------------------------------------------------------------
-- >>> migration 0020_espace_famille
-- -----------------------------------------------------------------------------
-- Espace Famille : validation bureau (statut_validation) + badge « Nouveau »
-- (is_new) + pièces jointes multiples (documents_files) + motif de refus
-- (validation_note). Colonnes portées par les policies RLS de la migration 0006.
alter table public.adherents
    add column if not exists statut_validation text not null default 'en_attente'
        check (statut_validation in ('en_attente', 'accepte', 'refuse')),
    add column if not exists is_new          boolean not null default false,
    add column if not exists documents_files jsonb   not null default '{}'::jsonb,
    add column if not exists validation_note text    not null default '';

update public.adherents set is_new = false where is_new is null;


-- =============================================================================
-- SECTION 2 — SEED SAISON ACTIVE (tables `saisons` + `cours`, migration 0016)
-- =============================================================================
-- Insère la saison 2026/2027 avec ses 4 cours. Les tarifs sont en CENTIMES.
-- La licence FFK (3700 = 37€) est ajoutée par le moteur de calcul.

-- Saison active
insert into public.saisons (label, date_debut, date_fin, active, tarif_licence, nb_licencies, tarifs_note, licence_note)
values ('2026-2027', '2026-09-01', '2027-06-30', true, 3700, 120,
        'Des remises familles sont appliquées (de -10€ à -70€ selon le nombre d''inscrits).',
        '* Prévoir 37€ supplémentaires pour la licence FFK.')
on conflict (label) do update set active = true, updated_at = now();

-- Cours rattachés à la saison active (idempotent : saute si déjà présents)
with active as (select id from public.saisons where active = true limit 1)
insert into public.cours (saison_id, cours_type, libelle, professeur, capacite_max, jours, heures, lieu, accent, prix, position)
select active.id, v.*
from active, (values
    ('Baby',         'Baby Karaté',           'Denis Didier', 15,  'Mardi et Jeudi',    '18h30 - 19h30', 'Gymnase Auguste Delaune', 'dojo',   18300, 0),
    ('Enfant',       'Enfants',               'Denis Didier', 25,  'Mardi et Jeudi',    '18h30 - 19h30', 'Gymnase Auguste Delaune', 'dojo',   20300, 1),
    ('Adulte',       'Ados / Adultes',        'Denis Didier', 30,  'Mardi et Jeudi',    '19h30 - 21h00', 'Gymnase Auguste Delaune', 'dojo',   23300, 2),
    ('Self-Defense', 'Self-Défense Féminine', 'Leshen',       20,  'Dimanche',          '11h00 - 12h30', 'Gymnase Auguste Delaune', 'corail', 13300, 3)
) as v(cours_type, libelle, professeur, capacite_max, jours, heures, lieu, accent, prix, position)
where not exists (select 1 from public.cours where saison_id = active.id);


-- =============================================================================
-- SECTION 3 — COMPTE ADMIN DE TEST (admin@csbk.com -> mot de passe + role bureau)
-- =============================================================================
-- =============================================================
-- COMPTE DE TEST ADMIN / BUREAU — mot de passe + rôle
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
--
-- BUT : (ré)initialiser le compte de test PARTAGÉ « admin@csbk.com » pour la
-- recette par le bureau :
--   1) mot de passe = « wW4566$ » (+ email marqué confirmé),
--   2) rôle « bureau » (accès complet à l'Espace Bureau + écriture CMS).
--
-- ⚠️ Le compte doit déjà exister (créé via Authentication > Add user).
-- ⚠️ DEV / recette uniquement, compte partagé jetable — ne JAMAIS faire ça
--    sur un compte personnel.
--
-- pgcrypto (crypt / gen_salt) est fourni par Supabase. Si l'erreur
-- « function crypt(...) does not exist » apparaît, exécuter d'abord :
--   create extension if not exists pgcrypto with schema extensions;
-- ou préfixer les appels : extensions.crypt(...) / extensions.gen_salt('bf').
-- =============================================================

-- 1) Mot de passe + email confirmé -----------------------------
update auth.users
set encrypted_password = crypt('wW4566$', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at         = now()
where email = 'admin@csbk.com';

-- 2) Rôle « bureau » (upsert, au cas où le profil n'existe pas encore) ---
insert into public.profiles (user_id, role, email)
select id, 'bureau', email
from auth.users
where email = 'admin@csbk.com'
on conflict (user_id) do update
    set role  = 'bureau',
        email = excluded.email;

-- 3) Vérification (doit renvoyer 1 ligne : admin@csbk.com | bureau) ------
select u.email, p.role
from auth.users u
join public.profiles p on p.user_id = u.id
where u.email = 'admin@csbk.com';


-- =============================================================================
-- SECTION 4 — JEU DE TEST (20 adherents : 7 bureau, 3 enseignants, 10 adherents)
-- =============================================================================
-- =============================================================
-- JEU DE TEST — 20 adhérents (dont 7 bureau + 3 enseignants)
-- =============================================================
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > Run.
--
-- ⚠️ DONNÉES DE TEST — destiné à un projet de DEV / preview, PAS à la prod.
-- ⚠️ Insère dans `auth.users` : c'est OBLIGATOIRE car un adhérent dépend d'une
--    famille, elle-même rattachée à un compte (FK NOT NULL). Ces comptes
--    servent à REMPLIR/VISUALISER le dashboard ; ils ne sont PAS prévus pour
--    se connecter (mot de passe vide, pas d'entrée auth.identities).
-- ⚠️ Tous les emails sont en `@seed.test` → nettoyage trivial (voir bas de page).
--
-- Le script est RÉ-EXÉCUTABLE : il purge d'abord les anciennes données @seed.test.
--
-- RÉPARTITION (cf. modèle clarifié) :
--   • 7 « bureau »     → profiles.role='bureau'  + adherents.membre_bureau=true
--                        (membres du bureau du club ET admins du site, tarif 37 €)
--   • 3 « enseignant » → profiles.role='enseignant'
--   • 10 adhérents     → profiles.role='adherent'
-- => Carte « Bureau du club » = 7 · Section « Administrateurs » = 10 · Total = 20.
-- =============================================================

begin;

-- 0) Purge des éventuelles données de test précédentes (cascade complète :
--    auth.users -> profiles / familles -> adherents / dossiers -> paiements).
delete from auth.users where email like '%@seed.test';

-- 1) Table temporaire de travail (supprimée à la fin de la transaction).
create temporary table _seed (
    email         text,
    nom           text,
    prenom        text,
    genre         text,
    naissance     date,
    cours         text,
    grade         text,
    statut        text,
    membre_bureau boolean,
    role          text,
    uid           uuid not null default gen_random_uuid()
) on commit drop;

-- statut = statut de dossier combiné (migration 0010). Les `documents` et
-- les paiements (étapes 4 et 7) sont alignés pour que le statut DÉRIVÉ par
-- l'UI corresponde : Validé (pièces+paiement) · En attente paiement (pièces ok,
-- pas payé) · En attente justificatifs (payé, pièces manquantes) · Incomplet.
insert into _seed (email, nom, prenom, genre, naissance, cours, grade, statut, membre_bureau, role) values
-- ---- 7 BUREAU (bureau du club + admin du site) ----
('president@seed.test',  'Moreau',   'Sylvie',   'F', '1972-04-12', 'Adulte',       '3e Dan',           'Validé',                    true,  'bureau'),
('secretaire@seed.test', 'Lefevre',  'Thomas',   'M', '1980-09-23', 'Adulte',       '2e Dan',           'Validé',                    true,  'bureau'),
('tresorier@seed.test',  'Garcia',   'Nadia',    'F', '1975-01-30', 'Adulte',       '1er Dan',          'Validé',                    true,  'bureau'),
('bureau4@seed.test',    'Petit',    'Karim',    'M', '1983-06-15', 'Adulte',       'Ceinture Marron',  'En attente paiement',       true,  'bureau'),
('bureau5@seed.test',    'Roux',     'Emilie',   'F', '1978-11-05', 'Self-Defense', 'Ceinture Bleue',   'Validé',                    true,  'bureau'),
('bureau6@seed.test',    'Fontaine', 'Olivier',  'M', '1969-03-19', 'Adulte',       '2e Dan',           'En attente justificatifs',  true,  'bureau'),
('bureau7@seed.test',    'Girard',   'Sabrina',  'F', '1985-07-28', 'Adulte',       'Ceinture Marron',  'Validé',                    true,  'bureau'),
-- ---- 3 ENSEIGNANTS (admin du site, niveau enseignant) ----
('prof1@seed.test',      'Dubois',   'Herve',    'M', '1965-02-10', 'Adulte',       '4e Dan',           'Validé',                    false, 'enseignant'),
('prof2@seed.test',      'Lemoine',  'Pascal',   'M', '1971-08-17', 'Adulte',       '3e Dan',           'Validé',                    false, 'enseignant'),
('prof3@seed.test',      'Bernard',  'Christine','F', '1974-12-03', 'Adulte',       '2e Dan',           'En attente paiement',       false, 'enseignant'),
-- ---- 10 ADHÉRENTS (rôle adhérent) ----
('ad1@seed.test',        'Martin',   'Lucas',    'M', '2015-05-14', 'Enfant',       'Ceinture Blanche', 'Incomplet',                 false, 'adherent'),
('ad2@seed.test',        'Martin',   'Lea',      'F', '2017-03-22', 'Enfant',       'Ceinture Blanche', 'Incomplet',                 false, 'adherent'),
('ad3@seed.test',        'Durand',   'Hugo',     'M', '2014-10-08', 'Enfant',       'Ceinture Jaune',   'Validé',                    false, 'adherent'),
('ad4@seed.test',        'Simon',    'Chloe',    'F', '2016-01-19', 'Enfant',       'Ceinture Orange',  'En attente justificatifs',  false, 'adherent'),
('ad5@seed.test',        'Laurent',  'Maxime',   'M', '2013-07-30', 'Enfant',       'Ceinture Jaune',   'En attente paiement',       false, 'adherent'),
('ad6@seed.test',        'Michel',   'Ines',     'F', '2009-09-11', 'Self-Defense', 'Ceinture Blanche', 'Validé',                    false, 'adherent'),
('ad7@seed.test',        'Robert',   'Camille',  'F', '1995-04-25', 'Self-Defense', 'Ceinture Jaune',   'En attente justificatifs',  false, 'adherent'),
('ad8@seed.test',        'Richard',  'Antoine',  'M', '1990-06-07', 'Adulte',       'Ceinture Verte',   'Incomplet',                 false, 'adherent'),
('ad9@seed.test',        'Gauthier', 'Julien',   'M', '2000-02-28', 'Adulte',       'Ceinture Bleue',   'Validé',                    false, 'adherent'),
('ad10@seed.test',       'Mercier',  'Manon',    'F', '2006-11-16', 'Adulte',       'Ceinture Orange',  'En attente paiement',       false, 'adherent');

-- 2) Comptes Auth (le trigger on_auth_user_created crée le profil 'adherent').
insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
)
select
    '00000000-0000-0000-0000-000000000000', s.uid, 'authenticated', 'authenticated', s.email,
    '', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nom_referent', s.prenom || ' ' || s.nom)
from _seed s;

-- 3) Familles (1 compte = 1 référent = 1 famille). Migration 0018 : email inclus.
insert into public.familles (referent_user_id, nom_referent, email, telephone_urgence, adresse, code_postal, ville)
select
    s.uid,
    s.prenom || ' ' || s.nom,
    s.email,
    '06' || lpad((floor(random() * 100000000))::bigint::text, 8, '0'),
    (floor(random() * 98) + 1)::int::text || ' rue du Dojo',
    '91220', 'Brétigny-sur-Orge'
from _seed s;

-- 4) Adhérents. `documents` rempli (pièces complètes) quand le statut visé
--    suppose la justif OK ; sinon checklist vide.
insert into public.adherents
    (famille_id, nom, prenom, date_naissance, genre, email, cours_type, membre_bureau, grade_actuel, statut_dossier, documents)
select
    f.id, s.nom, s.prenom, s.naissance, s.genre, s.email, s.cours, s.membre_bureau, s.grade, s.statut,
    case when s.statut in ('Validé', 'En attente paiement')
         then '{"photo":true,"certificat_medical":true,"autorisation_parentale":true,"reglement_interieur":true}'::jsonb
         else '{}'::jsonb end
from _seed s
join public.familles f on f.referent_user_id = s.uid;

-- 5) Rôles d'accès au site (profils déjà créés en 'adherent' par le trigger).
update public.profiles p
set role = s.role
from _seed s
where p.user_id = s.uid and s.role <> 'adherent';

-- 5b) Backfill prenom/nom/telephone dans profiles (migration 0017).
update public.profiles p
set prenom    = s.prenom,
    nom       = s.nom,
    telephone = f.telephone_urgence
from _seed s
join public.familles f on f.referent_user_id = s.uid
where p.user_id = s.uid;

-- 6) Dossiers (panier par famille). Tarif : 37 € pour un membre du bureau,
--    sinon selon le cours. Statut = vocabulaire unifié (migration 0010).
insert into public.dossiers (famille_id, saison, montant_total, mode_paiement, statut)
select
    f.id, '2026-2027',
    case
        when s.membre_bureau then 3700
        when s.cours = 'Adulte' then 21000
        when s.cours = 'Enfant' then 18000
        else 13000
    end,
    'au_club',
    s.statut
from _seed s
join public.familles f on f.referent_user_id = s.uid;

-- 7) Encaissements : un chèque encaissé du total pour les dossiers réglés
--    (statut « Validé » = pièces+paiement, ou « En attente justificatifs » = payé
--    mais pièces manquantes). Alimente la carte « Encaissé / attendu ».
insert into public.paiements (dossier_id, montant, mode, encaisse, date_encaissement)
select d.id, d.montant_total, 'cheque', true, current_date
from public.dossiers d
join public.familles f on f.id = d.famille_id
join _seed s on s.uid = f.referent_user_id
where s.statut in ('Validé', 'En attente justificatifs');

commit;

-- =============================================================
-- NETTOYAGE (à exécuter pour tout supprimer — cascade complète) :
--
--   delete from auth.users where email like '%@seed.test';
--
-- =============================================================

-- #############################################################################
-- ##  FIN — base reconstruite + comptes de test prets.  #######################
-- #############################################################################
