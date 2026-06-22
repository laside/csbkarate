// =============================================================
// COUCHE D'ACCÈS AUX DONNÉES — store.js
// =============================================================
// Centralise lecture/écriture des données pour DÉCOUPLER les pages de la
// SOURCE. Une page demande une « collection » par son nom, sans savoir d'où
// viennent les données :
//
//   Store.loadCollection(name)        -> Promise<données>
//   Store.saveCollection(name, data)  -> Promise<void>
//
// BASCULE EN COURS (Supabase) : la migration se fait collection par
// collection. `SUPABASE_COLLECTIONS` liste celles déjà branchées sur la base ;
// les autres conservent l'ancien comportement « Git-based » (fetch JSON +
// export par téléchargement). Aucune page (news.js, galerie.js, grades.js,
// competitions.html, carrousel index.html) n'a à changer : seul ce fichier sait.
//
// Le client Supabase est fourni par supabase.js (window.sb), chargé en
// <script type="module"> sur les pages concernées.
//
// Chargé en vanilla JS via <script defer> : expose un objet global `Store`.
// =============================================================

(function (global) {
    'use strict';

    // Dossier des fichiers JSON (collections pas encore migrées).
    const DATA_DIR = './data';
    // Indentation de l'export JSON, alignée sur l'historique Git (4 espaces).
    const JSON_INDENT = 4;

    // Collections déjà migrées vers Supabase. On y ajoutera 'competitions',
    // 'galerie' et 'grades' au fil de la bascule.
    const SUPABASE_COLLECTIONS = new Set(['news']);

    // Récupère le client Supabase ou échoue clairement s'il manque.
    function sb() {
        if (!global.sb) {
            throw new Error('Client Supabase non initialisé : supabase.js (type="module") est-il chargé sur cette page ?');
        }
        return global.sb;
    }

    // =========================================================
    // SOURCE SUPABASE (collections migrées)
    // =========================================================
    async function loadFromSupabase(name) {
        if (name === 'news') {
            // Tri par id décroissant : les nouvelles actus (id = Date.now())
            // remontent en tête, comme le faisait l'unshift de news.js.
            const { data, error } = await sb()
                .from('news')
                .select('id, date, category, title, excerpt, image')
                .order('id', { ascending: false });
            if (error) throw error;
            return data || [];
        }
        throw new Error(`Collection Supabase inconnue : ${name}`);
    }

    async function saveToSupabase(name, data) {
        if (name === 'news') {
            const rows = (data || []).map(n => ({
                id: n.id,
                date: n.date ?? '',
                category: n.category ?? '',
                title: n.title ?? '',
                excerpt: n.excerpt ?? '',
                image: n.image ?? ''
            }));

            // 1) Insère/met à jour les éléments présents (clé = id).
            if (rows.length) {
                const { error } = await sb().from('news').upsert(rows);
                if (error) throw error;
            }

            // 2) Supprime les lignes retirées côté admin (absentes du tableau).
            const ids = rows.map(r => r.id);
            const del = sb().from('news').delete();
            const query = ids.length
                ? del.not('id', 'in', `(${ids.join(',')})`) // tout sauf les ids conservés
                : del.not('id', 'is', null);                  // tableau vide -> on vide la table
            const { error } = await query;
            if (error) throw error;
            return;
        }
        throw new Error(`Collection Supabase inconnue : ${name}`);
    }

    // =========================================================
    // SOURCE JSON (collections pas encore migrées)
    // =========================================================
    async function loadFromJson(name) {
        const response = await fetch(`${DATA_DIR}/${name}.json`);
        if (!response.ok) {
            throw new Error(`Impossible de charger ${name}.json (HTTP ${response.status})`);
        }
        return response.json();
    }

    function saveToJson(name, data, options = {}) {
        const filename = options.filename || `${name}.json`;
        const notify = options.notify !== false;

        const json = JSON.stringify(data, null, JSON_INDENT);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (notify) {
            alert(`Fichier ${filename} téléchargé !\nRemplacez l'ancien fichier dans data/ sur votre dépôt GitHub.`);
        }
        return Promise.resolve();
    }

    // =========================================================
    // API PUBLIQUE (routage selon la collection)
    // =========================================================
    async function loadCollection(name) {
        return SUPABASE_COLLECTIONS.has(name)
            ? loadFromSupabase(name)
            : loadFromJson(name);
    }

    async function saveCollection(name, data, options = {}) {
        if (SUPABASE_COLLECTIONS.has(name)) {
            // L'appelant (ex. news.js) ne gère pas le retour : on assure
            // ici le retour utilisateur (succès / échec) sans toucher aux pages.
            try {
                await saveToSupabase(name, data);
                if (options.notify !== false) alert('Modifications enregistrées en ligne ✅');
            } catch (err) {
                console.error(err);
                alert('Échec de l\'enregistrement en ligne.\n' + (err.message || err) +
                    '\n\nÊtes-vous bien connecté en mode admin ?');
            }
            return;
        }
        return saveToJson(name, data, options);
    }

    // Exposition globale (pas de bundler : on attache l'API à window).
    global.Store = { loadCollection, saveCollection };

})(window);
