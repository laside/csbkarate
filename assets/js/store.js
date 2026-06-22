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

    // Collections déjà migrées vers Supabase. On y ajoutera 'galerie' et
    // 'grades' au fil de la bascule.
    const SUPABASE_COLLECTIONS = new Set(['news', 'competitions']);

    // Récupère le client Supabase ou échoue clairement s'il manque.
    function sb() {
        if (!global.sb) {
            throw new Error('Client Supabase non initialisé : supabase.js (type="module") est-il chargé sur cette page ?');
        }
        return global.sb;
    }

    // Remplace entièrement le contenu d'une table par `rows` (clé = id) :
    // upsert des lignes présentes, puis suppression de tout le reste.
    // Mutualise le « save = remplace toute la collection » commun aux
    // tableaux plats (news, competitions...). Les collections à structure
    // imbriquée (ex. galerie) ne passeront pas par ce helper.
    async function replaceSupabaseTable(table, rows) {
        if (rows.length) {
            const { error } = await sb().from(table).upsert(rows);
            if (error) throw error;
        }

        const ids = rows.map(r => r.id);
        const del = sb().from(table).delete();
        const query = ids.length
            ? del.not('id', 'in', `(${ids.join(',')})`) // tout sauf les ids conservés
            : del.not('id', 'is', null);                  // tableau vide -> on vide la table
        const { error } = await query;
        if (error) throw error;
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
        if (name === 'competitions') {
            // L'ordre exact n'a pas d'importance : competitions.html re-trie
            // côté client par date réelle (getSortableDate). id desc par défaut.
            const { data, error } = await sb()
                .from('competitions')
                .select('id, date, title, location, image, results')
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
            return replaceSupabaseTable('news', rows);
        }
        if (name === 'competitions') {
            const rows = (data || []).map(c => ({
                id: c.id,
                date: c.date ?? '',
                title: c.title ?? '',
                location: c.location ?? '',
                image: c.image ?? '',
                results: c.results ?? ''
            }));
            return replaceSupabaseTable('competitions', rows);
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
