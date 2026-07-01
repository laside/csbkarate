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
// DEUX FORMATS DE CONFIG ACCEPTÉS :
//   • « dynamique » (depuis saison admin) : { cotisations: { Baby:18300, ... }, tarif_licence:3700, ... }
//   • « legacy » (table `tarifs` Supabase) : { cotisation_adulte:21000, ..., tarif_bureau:3700, ... }
// Le format dynamique est prioritaire quand `config.cotisations` existe.
// =============================================================

(function (global) {
    'use strict';

    // Config de secours (valeurs du tableau tarifaire saison 2026-2027).
    // Format « dynamique » par défaut — backward compat legacy préservée
    // dans normalizeConfig().
    const DEFAULT_CONFIG = {
        // Tarifs cours HORS licence (centimes), indexés par coursType du formulaire.
        cotisations: {
            'Baby':          18300,
            'Enfant':        20300,
            'Adulte':        23300,
            'Self-Defense':  13300
        },
        // Licence FFK : montant ajouté à chaque adhérent.
        tarif_licence:     3700,
        // Remise Pass'Sport par adhérent éligible.
        remise_passsport:  5000,
        // Remise famille (clé = nb d'inscrits, « 5 » = 5 et +).
        remises_famille:   { '2': 1000, '3': 3000, '4': 5000, '5': 7000 },
        // Legacy (backward compat membres.js / table tarifs).
        cotisation_adulte: 21000,
        cotisation_enfant: 18000,
        cotisation_self:   13000,
        tarif_bureau:      3700
    };

    // Libellés lisibles par coursType.
    const LABELS = {
        'Baby':          'Baby Karaté',
        'Enfant':        'Enfants',
        'Adulte':        'Ado / Adulte',
        'Self-Defense':  'Self-Défense Fém.'
    };

    // Cotisation d'un adhérent. Le « membre du bureau » est un tarif fixe
    // (37 €, licence seule) qui REMPLACE le tarif de cours, quel que soit le
    // format de config — d'où sa PRIORITÉ ABSOLUE, avant les deux chemins de
    // calcul. (Sinon la map `cotisations` du format dynamique masquerait cette
    // règle et facturerait le plein tarif à un membre du bureau.)
    function cotisationBase(adherent, config) {
        const coursType = adherent.coursType;

        // --- Priorité : membre du bureau (tarif fixe) ---
        if (adherent.membreBureau) {
            const m = config.tarif_bureau || 0;
            return { montant: m, partCours: 0, partLicence: m, label: 'Membre du bureau' };
        }

        // --- Format dynamique (saison admin) : cotisations map + licence en sus ---
        if (config.cotisations && config.cotisations[coursType] !== undefined) {
            const partCours  = config.cotisations[coursType];
            const partLicence = config.tarif_licence || 0;
            return {
                montant: partCours + partLicence,
                partCours,
                partLicence,
                label: LABELS[coursType] || coursType || 'Cotisation'
            };
        }

        // --- Format legacy (table `tarifs`) ---
        const montant = {
            'Adulte':       config.cotisation_adulte,
            'Enfant':       config.cotisation_enfant,
            'Self-Defense': config.cotisation_self
        }[coursType] || 0;
        const partLicence = config.tarif_licence || config.tarif_bureau || 0;
        return {
            montant,
            partCours: Math.max(0, montant - partLicence),
            partLicence,
            label: LABELS[coursType] || 'Cotisation'
        };
    }

    // Remise famille selon le NOMBRE d'inscrits dans le panier (paliers).
    // « 5 » du barème = 5 inscrits ET PLUS. 0 ou 1 inscrit : pas de remise.
    function remiseFamille(nbInscrits, config) {
        if (nbInscrits <= 1) return 0;
        const table = config.remises_famille || {};
        const palier = nbInscrits >= 5 ? '5' : String(nbInscrits);
        return Number(table[palier] || 0);
    }

    // Fusionne la config reçue avec les valeurs par défaut.
    function normalizeConfig(config) {
        const c = Object.assign({}, DEFAULT_CONFIG, config || {});
        if (!c.remises_famille || typeof c.remises_famille !== 'object') {
            c.remises_famille = DEFAULT_CONFIG.remises_famille;
        }
        // Garantir la map cotisations si elle a été fournie.
        if (config && config.cotisations && typeof config.cotisations === 'object') {
            c.cotisations = config.cotisations;
        }
        return c;
    }

    // ---- Calcul complet --------------------------------------------------
    // adherents : [{ prenom?, coursType, membreBureau?, passSport? }]
    // Retourne un objet de détail (stockable tel quel dans dossiers.detail_calcul).
    function computeTarif(adherents, config) {
        const c = normalizeConfig(config);
        const liste = Array.isArray(adherents) ? adherents : [];

        // 1) Cotisations, ligne par ligne — cours + licence.
        const lignes = liste.map((a, i) => {
            const base = cotisationBase(a, c);
            return {
                index: i,
                nom: a.prenom || `Adhérent ${i + 1}`,
                label: base.label,
                montant: base.montant,
                partCours: base.partCours,
                partLicence: base.partLicence
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

    // ---- Utilitaire : parse « 183 € » -> 18300 (centimes) ---------------
    // Utilisé par inscription.js pour convertir les prix textuels de la saison.
    function parsePrixText(str) {
        const n = parseFloat(String(str || '').replace(/[^\d.,]/g, '').replace(',', '.'));
        return isFinite(n) ? Math.round(n * 100) : 0;
    }

    // ---- Config dynamique depuis un document `saison` (JSONB) ------------
    // LEGACY (ancien modèle JSONB singleton, migration 0005). Conservé pour
    // compatibilité ; le site utilise désormais configFromCours (modèle
    // relationnel 0016). Construit { cotisations, tarif_licence } à partir des
    // lignes tarifs portant un `coursType`. Renvoie null si rien n'est mappé.
    function configFromSaison(saison) {
        if (!saison || typeof saison !== 'object') return null;
        const cotisations = {};
        (saison.tarifs || []).forEach(t => {
            if (t && t.coursType && t.prix) {
                cotisations[t.coursType] = parsePrixText(t.prix);
            }
        });
        if (!Object.keys(cotisations).length) return null;
        return {
            cotisations,
            tarif_licence: saison.tarifLicence || DEFAULT_CONFIG.tarif_licence
        };
    }

    // ---- Config dynamique depuis le modèle relationnel (tables saisons + cours) ----
    // Construit { cotisations, tarif_licence } à partir des lignes `cours` de la
    // saison active (chacune porte un `cours_type` et un `prix` DÉJÀ en centimes).
    // Si plusieurs cours partagent un type, on garde le 1er prix rencontré (ordre
    // d'affichage). Renvoie null si aucun cours n'est typé (le caller garde alors
    // sa config DEFAULT/legacy). Factorise la logique partagée entre inscription.js
    // (public) et membres.js (bureau) → MÊME total des deux côtés.
    function configFromCours(coursRows, tarifLicenceCents) {
        const cotisations = {};
        (coursRows || []).forEach(c => {
            if (c && c.cours_type && c.prix != null && cotisations[c.cours_type] === undefined) {
                cotisations[c.cours_type] = c.prix;
            }
        });
        if (!Object.keys(cotisations).length) return null;
        return {
            cotisations,
            tarif_licence: tarifLicenceCents || DEFAULT_CONFIG.tarif_licence
        };
    }

    global.CSBTarifs = {
        DEFAULT_CONFIG,
        computeTarif,
        formatEuros,
        parsePrixText,
        configFromSaison,
        configFromCours,
        // exposés pour tests unitaires éventuels
        cotisationBase,
        remiseFamille
    };
})(window);
