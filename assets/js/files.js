// =============================================================
// FICHIERS — files.js  (script classique, window.CSBFiles)
// =============================================================
// Utilitaires PURS de gestion des pièces jointes (photos / PDF), partagés par
// inscription.js et adherent.js. Objectif : tenir dans le plan GRATUIT Supabase
// (Storage ~1 Go) en validant et en COMPRESSANT les fichiers avant l'upload.
//
//   • validate(file)      → lève une Error (message FR) si type/taille invalides.
//   • compressImage(file) → redimensionne + réencode en WebP (images seulement).
//   • prepare(file)       → validate puis compressImage (le tout-en-un à appeler).
//   • extOf(file)         → extension cohérente avec le type MIME final.
//   • pathsOf(adherent)   → chemins Storage (photo + pièces) pour le nettoyage.
//
// ⚠️ La validation JS n'est qu'un confort UX : le VRAI garde-fou est la config
// du bucket `dossiers` (file_size_limit + allowed_mime_types), à poser côté
// Supabase (l'UI se contourne, pas le bucket). cf. CLAUDE.md (TODO stockage).
// =============================================================

(function (global) {
    'use strict';

    const MB = 1024 * 1024;
    const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const IMAGE_EXT   = ['jpg', 'jpeg', 'png', 'webp'];
    const DOC_TYPES   = ['application/pdf'];
    const DOC_EXT     = ['pdf'];

    const MAX_IMAGE_RAW = 15 * MB; // image AVANT compression (photos smartphone)
    const MAX_DOC       = 5 * MB;  // PDF (non compressé)
    const MAX_FINAL     = 5 * MB;  // filet de sécurité après compression

    function extName(name) {
        const m = /\.([^.]+)$/.exec(name || '');
        return m ? m[1].toLowerCase() : '';
    }
    function isImage(file) {
        return IMAGE_TYPES.includes(file.type) || IMAGE_EXT.includes(extName(file.name));
    }
    function isPdf(file) {
        return DOC_TYPES.includes(file.type) || DOC_EXT.includes(extName(file.name));
    }
    function humanMB(bytes) {
        return (bytes / MB).toFixed(1).replace('.', ',') + ' Mo';
    }

    // Valide type + taille brute. Lève une Error (message FR) si invalide.
    function validate(file) {
        if (!file) throw new Error('Aucun fichier sélectionné.');
        if (!isImage(file) && !isPdf(file)) {
            throw new Error('Format non accepté. Formats autorisés : JPG, PNG, WebP ou PDF.');
        }
        if (isImage(file)) {
            if (file.size > MAX_IMAGE_RAW) {
                throw new Error(`Image trop lourde (${humanMB(file.size)}). Maximum ${humanMB(MAX_IMAGE_RAW)}.`);
            }
        } else if (file.size > MAX_DOC) {
            throw new Error(`PDF trop lourd (${humanMB(file.size)}). Maximum ${humanMB(MAX_DOC)}.`);
        }
        return true;
    }

    // Redimensionne (côté le plus long <= maxDim) et réencode en WebP.
    // Renvoie l'ORIGINAL si ce n'est pas une image, si le décodage échoue, ou si
    // la compression n'apporte aucun gain (fichier déjà plus petit).
    async function compressImage(file, opts) {
        const { maxDim = 1200, quality = 0.8 } = opts || {};
        if (!isImage(file) || typeof createImageBitmap !== 'function') return file;
        try {
            const bitmap = await createImageBitmap(file);
            let { width, height } = bitmap;
            const longest = Math.max(width, height);
            if (longest > maxDim) {
                const s = maxDim / longest;
                width = Math.round(width * s);
                height = Math.round(height * s);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
            if (bitmap.close) bitmap.close();
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
            if (!blob || blob.size >= file.size) return file; // aucun gain -> on garde l'original
            const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
            return new File([blob], base + '.webp', { type: 'image/webp' });
        } catch (_) {
            return file; // décodage impossible (HEIC exotique…) -> original, déjà validé en taille
        }
    }

    // Valide puis compresse. Vérifie le poids final. À appeler avant tout upload.
    async function prepare(file, opts) {
        validate(file);
        const out = await compressImage(file, opts);
        if (out.size > MAX_FINAL) {
            throw new Error(`Fichier trop lourd (${humanMB(out.size)}) même après optimisation. Maximum ${humanMB(MAX_FINAL)}.`);
        }
        return out;
    }

    // Extension cohérente avec le type MIME du fichier (préparé) à uploader.
    function extOf(file) {
        if (file.type === 'image/webp') return 'webp';
        if (file.type === 'image/jpeg') return 'jpg';
        if (file.type === 'image/png') return 'png';
        if (file.type === 'application/pdf') return 'pdf';
        return extName(file.name) || 'dat';
    }

    // Chemins Storage d'un adhérent (photo d'identité + pièces jointes), pour le
    // nettoyage à la suppression (la cascade SQL ne supprime PAS les objets Storage).
    function pathsOf(adherent) {
        if (!adherent) return [];
        const paths = [];
        if (adherent.photo_path) paths.push(adherent.photo_path);
        const files = adherent.documents_files;
        if (files && typeof files === 'object') {
            Object.values(files).forEach((v) => { if (v) paths.push(v); });
        }
        return paths;
    }

    global.CSBFiles = { validate, compressImage, prepare, extOf, pathsOf, MAX_FINAL };
})(window);
