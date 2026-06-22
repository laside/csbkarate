// =============================================================
// COUCHE D'ACCÈS AUX DONNÉES — store.js  (Étape 0 : préparation BDD)
// =============================================================
// Objectif : centraliser la lecture et l'écriture des données pour
// DÉCOUPLER les pages de la SOURCE. Aucune page ne sait plus d'où
// viennent les données : elle demande une « collection » par son nom.
//
//   Store.loadCollection(name)        -> Promise<données>
//   Store.saveCollection(name, data)  -> Promise<void>
//
// AUJOURD'HUI (CMS « Git-based », site 100 % statique) :
//   - load : fetch ./data/<name>.json
//   - save : génère et télécharge <name>.json (l'admin le commit ensuite)
//
// DEMAIN (bascule Supabase, cf. CLAUDE.md) : il suffira de remplacer
// le CORPS de ces deux fonctions par des appels au SDK Supabase.
// Les pages (news.js, galerie.js, grades.js, competitions.html, le
// carrousel de index.html) n'auront, elles, RIEN à changer.
//
// Chargé en vanilla JS via <script defer> : pas de bundler, pas de
// module ES. La fonction expose un objet global `Store`.
// =============================================================

(function (global) {
    'use strict';

    // Dossier des fichiers JSON (= source de données actuelle).
    const DATA_DIR = './data';

    // Indentation de l'export, alignée sur l'historique Git (4 espaces).
    const JSON_INDENT = 4;

    /**
     * Charge une collection de données par son nom.
     * @param {string} name  ex. "news", "competitions", "galerie", "grades"
     * @returns {Promise<any>}  données parsées (tableau OU objet selon la collection)
     * @throws  en cas d'erreur réseau — le code appelant conserve sa gestion de secours
     */
    async function loadCollection(name) {
        const response = await fetch(`${DATA_DIR}/${name}.json`);
        if (!response.ok) {
            throw new Error(`Impossible de charger ${name}.json (HTTP ${response.status})`);
        }
        return response.json();
    }

    /**
     * Enregistre une collection.
     * Aujourd'hui : déclenche le téléchargement de <name>.json (export manuel,
     * que l'admin dépose ensuite sur GitHub).
     * @param {string} name
     * @param {any} data
     * @param {{ filename?: string, notify?: boolean }} [options]
     *        filename : nom de fichier forcé (défaut : <name>.json)
     *        notify   : afficher l'alerte de confirmation (défaut : true)
     * @returns {Promise<void>}
     */
    function saveCollection(name, data, options = {}) {
        const filename = options.filename || `${name}.json`;
        const notify = options.notify !== false; // alerte affichée par défaut

        // Formatage lisible, identique à l'export historique de chaque page.
        const json = JSON.stringify(data, null, JSON_INDENT);

        // Création d'un Blob en mémoire + lien invisible pour forcer le téléchargement.
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

        // Renvoie une promesse pour rester compatible avec la future version async (Supabase).
        return Promise.resolve();
    }

    // Exposition globale (pas de bundler : on attache l'API à window).
    global.Store = { loadCollection, saveCollection };

})(window);
