// =============================================================
// PAGE CLUB — club.js   [hero dynamique, LECTURE SEULE]
// =============================================================
// Remplace les valeurs en dur du hero (libellé de saison + nombre de licenciés)
// par les données de la SAISON ACTIVE (tables `saisons` + `cours`, migration
// 0016, via le loader partagé window.CSBSaisons).
//
// PROGRESSIVE ENHANCEMENT : si Supabase est indisponible, le HTML statique
// (valeurs en dur) reste affiché. Le nombre de licenciés est saisi par le
// bureau dans l'onglet « Saisons & Cours » (la table `adherents` n'est pas
// lisible en anonyme — RGPD/RLS).
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    if (!window.CSBSaisons) return; // saisons.js absent : fallback statique

    CSBSaisons.loadActive()
        .then(res => {
            if (!res || !res.saison) return;
            const s = res.saison;
            const labelEl = document.getElementById('club-saison-label');
            const nbEl = document.getElementById('club-nb-licencies');
            if (labelEl && s.label) labelEl.textContent = `Saison ${s.label}`;
            if (nbEl && Number.isFinite(s.nb_licencies)) {
                nbEl.textContent = `${s.nb_licencies} Licencié${s.nb_licencies > 1 ? 's' : ''}`;
            }
        })
        .catch(err => console.error('Saison club indisponible, fallback statique conservé :', err));
});
