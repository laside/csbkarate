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
create policy "news_select_public"
on storage.objects for select
to public
using ( bucket_id = 'news' );

-- 2. Insertion (seuls les connectés)
create policy "news_insert_auth"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'news' );

-- 3. Mise à jour (seuls les connectés)
create policy "news_update_auth"
on storage.objects for update
to authenticated
using ( bucket_id = 'news' );

-- 4. Suppression (seuls les connectés)
create policy "news_delete_auth"
on storage.objects for delete
to authenticated
using ( bucket_id = 'news' );
