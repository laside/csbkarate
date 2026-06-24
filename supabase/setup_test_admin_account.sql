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
