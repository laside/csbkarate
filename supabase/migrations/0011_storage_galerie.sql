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
create policy "galerie_select_public"
on storage.objects for select
to public
using ( bucket_id = 'galerie' );

-- 2. Insertion (seuls les connectés)
create policy "galerie_insert_auth"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'galerie' );

-- 3. Mise à jour (seuls les connectés)
create policy "galerie_update_auth"
on storage.objects for update
to authenticated
using ( bucket_id = 'galerie' );

-- 4. Suppression (seuls les connectés)
create policy "galerie_delete_auth"
on storage.objects for delete
to authenticated
using ( bucket_id = 'galerie' );
