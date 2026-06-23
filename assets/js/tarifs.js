// =============================================================
// MOTEUR DE TARIF — tarifs.js  (script classique, window.CSBTarifs)
// =============================================================
// Fonction PURE et testable : aucune dépendance au DOM ni à Supabase.
// On lui passe la liste des adhérents + la config tarifaire, elle rend le
// détail du calcul. La page (inscription.js) et l'espace bureau réutilisent
// la même logique → un seul endroit où la règle de prix peut bouger.
//
// ⚠️ TOUT EN CENTIMES (integer). 210 € => 21000. Jamais de flottant en euros
// (erreurs d'arrondi). On ne convertit en « 210,00 € » qu'à l'affichage.
//
// SOURCE DES MONTANTS : dossier d'inscription papier (PAS les chiffres Gemini).
//   Adulte 210 € · Enfant 180 € · Self-défense 130 € · Membre du bureau 37 €.
//   Remise famille (sur N inscrits) : 2→10 € · 3→30 € · 4→50 € · 5+→70 €.
//   Remise Pass'Sport : 50 € par adhérent éligible (valeur configurable).
// =============================================================

(function (global) {
    'use strict';

    // Config de secours si la base n'a pas (encore) répondu. Mêmes valeurs que
    // le seed de la table `tarifs` (migration 0005). Clés en snake_case pour
    // pouvoir passer la ligne Supabase telle quelle, sans remapper.
    const DEFAULT_CONFIG = {
        cotisation_adulte: 21000,
        cotisation_enfant: 18000,
        cotisation_self:   13000,
        tarif_bureau:      3700,
        remise_passsport:  5000,
        remises_famille:   { '2': 1000, '3': 3000, '4': 5000, '5': 7000 }
    };

    // Libellés lisibles par type de cours (pour le détail du calcul).
    const LABELS = {
        'Adulte':       'Cotisation adulte',
        'Enfant':       'Cotisation enfant',
        'Self-Defense': 'Cotisation self-défense'
    };

    // Cotisation de base d'un adhérent. Le « membre du bureau » est un tarif
    // fixe qui REMPLACE le tarif de cours (37 €), quel que soit le cours suivi.
    function cotisationBase(adherent, config) {
        if (adherent.membreBureau) {
            return { montant: config.tarif_bureau, label: 'Membre du bureau' };
        }
        const montant = {
            'Adulte':       config.cotisation_adulte,
            'Enfant':       config.cotisation_enfant,
            'Self-Defense': config.cotisation_self
        }[adherent.coursType] || 0;
        return { montant, label: LABELS[adherent.coursType] || 'Cotisation' };
    }

    // Remise famille selon le NOMBRE d'inscrits dans le panier (paliers).
    // « 5 » du barème = 5 inscrits ET PLUS. 0 ou 1 inscrit : pas de remise.
    function remiseFamille(nbInscrits, config) {
        if (nbInscrits <= 1) return 0;
        const table = config.remises_famille || {};
        const palier = nbInscrits >= 5 ? '5' : String(nbInscrits);
        return Number(table[palier] || 0);
    }

    // Fusionne la config reçue (ligne Supabase, possiblement partielle) avec
    // les valeurs par défaut. Ne touche jamais la config d'origine.
    function normalizeConfig(config) {
        const c = Object.assign({}, DEFAULT_CONFIG, config || {});
        // remises_famille peut arriver en jsonb (clés string) : on garde l'objet.
        if (!c.remises_famille || typeof c.remises_famille !== 'object') {
            c.remises_famille = DEFAULT_CONFIG.remises_famille;
        }
        return c;
    }

    // ---- Calcul complet --------------------------------------------------
    // adherents : [{ prenom?, coursType, membreBureau?, passSport? }]
    // Retourne un objet de détail (stockable tel quel dans dossiers.detail_calcul).
    function computeTarif(adherents, config) {
        const c = normalizeConfig(config);
        const liste = Array.isArray(adherents) ? adherents : [];

        // 1) Cotisations de base, ligne par ligne.
        const lignes = liste.map((a, i) => {
            const base = cotisationBase(a, c);
            return {
                index: i,
                nom: a.prenom || `Adhérent ${i + 1}`,
                label: base.label,
                montant: base.montant
            };
        });
        const sousTotal = lignes.reduce((s, l) => s + l.montant, 0);

        // 2) Remise famille (sur le nombre d'inscrits).
        const nbInscrits = liste.length;
        const rFamille = remiseFamille(nbInscrits, c);

        // 3) Remise Pass'Sport : 50 € par adhérent éligible.
        const nbPassSport = liste.filter(a => a.passSport).length;
        const rPassSport = nbPassSport * c.remise_passsport;

        // 4) Total (plancher à 0, on ne rend jamais d'argent).
        const total = Math.max(0, sousTotal - rFamille - rPassSport);

        return {
            lignes,
            sousTotal,
            nbInscrits,
            remiseFamille: rFamille,
            nbPassSport,
            remisePassSport: rPassSport,
            total
        };
    }

    // ---- Formatage (affichage uniquement) --------------------------------
    // Centimes -> « 210,00 € ». Intl gère l'espace insécable et la virgule.
    function formatEuros(centimes) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format((centimes || 0) / 100);
    }

    global.CSBTarifs = {
        DEFAULT_CONFIG,
        computeTarif,
        formatEuros,
        // exposés pour tests unitaires éventuels
        cotisationBase,
        remiseFamille
    };
})(window);
