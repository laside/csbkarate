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

insert into _seed (email, nom, prenom, genre, naissance, cours, grade, statut, membre_bureau, role) values
-- ---- 7 BUREAU (bureau du club + admin du site) ----
('president@seed.test',  'Moreau',   'Sylvie',   'F', '1972-04-12', 'Adulte',       '3e Dan',           'Validé',           true,  'bureau'),
('secretaire@seed.test', 'Lefevre',  'Thomas',   'M', '1980-09-23', 'Adulte',       '2e Dan',           'Validé',           true,  'bureau'),
('tresorier@seed.test',  'Garcia',   'Nadia',    'F', '1975-01-30', 'Adulte',       '1er Dan',          'Validé',           true,  'bureau'),
('bureau4@seed.test',    'Petit',    'Karim',    'M', '1983-06-15', 'Adulte',       'Ceinture Marron',  'Validé',           true,  'bureau'),
('bureau5@seed.test',    'Roux',     'Emilie',   'F', '1978-11-05', 'Self-Defense', 'Ceinture Bleue',   'Validé',           true,  'bureau'),
('bureau6@seed.test',    'Fontaine', 'Olivier',  'M', '1969-03-19', 'Adulte',       '2e Dan',           'Attente paiement', true,  'bureau'),
('bureau7@seed.test',    'Girard',   'Sabrina',  'F', '1985-07-28', 'Adulte',       'Ceinture Marron',  'Validé',           true,  'bureau'),
-- ---- 3 ENSEIGNANTS (admin du site, niveau enseignant) ----
('prof1@seed.test',      'Dubois',   'Herve',    'M', '1965-02-10', 'Adulte',       '4e Dan',           'Validé',           false, 'enseignant'),
('prof2@seed.test',      'Lemoine',  'Pascal',   'M', '1971-08-17', 'Adulte',       '3e Dan',           'Validé',           false, 'enseignant'),
('prof3@seed.test',      'Bernard',  'Christine','F', '1974-12-03', 'Adulte',       '2e Dan',           'Validé',           false, 'enseignant'),
-- ---- 10 ADHÉRENTS (rôle adhérent) ----
('ad1@seed.test',        'Martin',   'Lucas',    'M', '2015-05-14', 'Enfant',       'Ceinture Blanche', 'Attente paiement', false, 'adherent'),
('ad2@seed.test',        'Martin',   'Lea',      'F', '2017-03-22', 'Enfant',       'Ceinture Blanche', 'Incomplet',        false, 'adherent'),
('ad3@seed.test',        'Durand',   'Hugo',     'M', '2014-10-08', 'Enfant',       'Ceinture Jaune',   'Validé',           false, 'adherent'),
('ad4@seed.test',        'Simon',    'Chloe',    'F', '2016-01-19', 'Enfant',       'Ceinture Orange',  'Validé',           false, 'adherent'),
('ad5@seed.test',        'Laurent',  'Maxime',   'M', '2013-07-30', 'Enfant',       'Ceinture Jaune',   'Attente paiement', false, 'adherent'),
('ad6@seed.test',        'Michel',   'Ines',     'F', '2009-09-11', 'Self-Defense', 'Ceinture Blanche', 'Validé',           false, 'adherent'),
('ad7@seed.test',        'Robert',   'Camille',  'F', '1995-04-25', 'Self-Defense', 'Ceinture Jaune',   'Attente paiement', false, 'adherent'),
('ad8@seed.test',        'Richard',  'Antoine',  'M', '1990-06-07', 'Adulte',       'Ceinture Verte',   'Incomplet',        false, 'adherent'),
('ad9@seed.test',        'Gauthier', 'Julien',   'M', '2000-02-28', 'Adulte',       'Ceinture Bleue',   'Validé',           false, 'adherent'),
('ad10@seed.test',       'Mercier',  'Manon',    'F', '2006-11-16', 'Adulte',       'Ceinture Orange',  'Attente paiement', false, 'adherent');

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

-- 3) Familles (1 compte = 1 référent = 1 famille).
insert into public.familles (referent_user_id, nom_referent, telephone_urgence, adresse, code_postal, ville)
select
    s.uid,
    s.prenom || ' ' || s.nom,
    '06' || lpad((floor(random() * 100000000))::bigint::text, 8, '0'),
    (floor(random() * 98) + 1)::int::text || ' rue du Dojo',
    '91220', 'Brétigny-sur-Orge'
from _seed s;

-- 4) Adhérents.
insert into public.adherents
    (famille_id, nom, prenom, date_naissance, genre, email, cours_type, membre_bureau, grade_actuel, statut_dossier)
select
    f.id, s.nom, s.prenom, s.naissance, s.genre, s.email, s.cours, s.membre_bureau, s.grade, s.statut
from _seed s
join public.familles f on f.referent_user_id = s.uid;

-- 5) Rôles d'accès au site (profils déjà créés en 'adherent' par le trigger).
update public.profiles p
set role = s.role
from _seed s
where p.user_id = s.uid and s.role <> 'adherent';

-- 6) Dossiers (panier par famille). Tarif : 37 € pour un membre du bureau,
--    sinon selon le cours. Statut mappé sur celui de l'adhérent.
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
    case s.statut
        when 'Validé' then 'valide'
        else 'attente_paiement'
    end
from _seed s
join public.familles f on f.referent_user_id = s.uid;

-- 7) Encaissements : pour chaque dossier « validé », un chèque encaissé du total.
--    (Alimente la carte « Encaissé / attendu » du dashboard.)
insert into public.paiements (dossier_id, montant, mode, encaisse, date_encaissement)
select d.id, d.montant_total, 'cheque', true, current_date
from public.dossiers d
join public.familles f on f.id = d.famille_id
join _seed s on s.uid = f.referent_user_id
where s.statut = 'Validé';

commit;

-- =============================================================
-- NETTOYAGE (à exécuter pour tout supprimer — cascade complète) :
--
--   delete from auth.users where email like '%@seed.test';
--
-- =============================================================
