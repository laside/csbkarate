// =============================================================
// SAISONS & COURS — saisons.js  (script classique, window.CSBSaisons)
// =============================================================
// Couche d'accès LECTURE aux saisons & cours (modèle relationnel, migration
// 0016), partagée par les pages publiques (accueil, club) et le module gestion
// (inscription, espace bureau). Évite de dupliquer la requête « saison active
// + ses cours » sur chaque page.
//
// RLS : lecture ouverte à anon (ce sont des horaires/prix publics) ; l'écriture
// (CRUD) reste réservée au bureau et vit dans membres.js. Ce module ne fait que
// lire — il n'écrit jamais.
//
// window.sb est garanti prêt dans tout handler DOMContentLoaded (module ESM +
// scripts defer s'exécutent avant), donc loadActive() y est appelable sans délai.
//
// Chargé en vanilla JS via <script defer> : expose un objet global `CSBSaisons`.
// =============================================================

(function (global) {
    'use strict';

    // Saison active + ses cours (triés par position). Renvoie :
    //   { saison: {...}, cours: [...] }  si une saison est active,
    //   null                              sinon (aucune active / erreur / hors-ligne).
    // Les appelants publics gardent alors leur fallback statique (HTML en dur).
    async function loadActive() {
        const sb = global.sb;
        if (!sb) return null;
        const { data: saison, error } = await sb
            .from('saisons').select('*').eq('active', true).maybeSingle();
        if (error || !saison) return null;
        const { data: cours } = await sb
            .from('cours').select('*').eq('saison_id', saison.id)
            .order('position', { ascending: true });
        return { saison, cours: cours || [] };
    }

    global.CSBSaisons = { loadActive };

})(window);
