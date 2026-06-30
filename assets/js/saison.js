// =============================================================
// SAISON (Horaires & Tarifs) — saison.js   [page d'accueil, LECTURE SEULE]
// =============================================================
// Rend la section « Informations Pratiques » d'index.html à partir de la
// SAISON ACTIVE (modèle relationnel `saisons` + `cours`, migration 0016, via
// le loader partagé window.CSBSaisons).
//
// L'ÉDITION N'EST PLUS ICI : elle a migré vers l'Espace Bureau (membres.html,
// onglet « Saisons & Cours »). index.html n'a plus de mode admin. Ce script ne
// fait que LIRE et afficher.
//
// PROGRESSIVE ENHANCEMENT : le HTML statique d'index.html sert de FALLBACK. Si
// le chargement réussit, on remplace le contenu par les données en base ; s'il
// échoue (Supabase en pause, hors-ligne…), la page garde son contenu statique.
// =============================================================

document.addEventListener('DOMContentLoaded', () => {

    // Échappe le HTML avant injection.
    const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Affecte un texte à un élément s'il existe.
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    // Date ISO (yyyy-mm-dd) -> « 1 septembre 2026 » (vide si invalide).
    function frDate(iso) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Centimes -> « 183 € » (on retire le « ,00 » quand le montant est entier).
    function prixEuros(centimes) {
        const euros = (centimes || 0) / 100;
        const txt = Number.isInteger(euros) ? String(euros) : euros.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
        return `${txt} €`;
    }

    // La saison est-elle encore en cours ? « active » tant qu'elle n'est pas
    // terminée (today <= fin) : pendant l'été (avant le début officiel), on
    // n'affiche pas « terminée » alors que c'est la période d'inscription.
    function isActive(fin) {
        if (!fin) return true;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return today <= new Date(fin + 'T00:00:00');
    }

    // ============================================================
    // CHARGEMENT (remplace le fallback statique si succès)
    // ============================================================
    if (!window.CSBSaisons) return; // saisons.js absent : on garde le HTML statique
    CSBSaisons.loadActive()
        .then(res => { if (res && res.saison) render(res.saison, res.cours); })
        .catch(err => console.error('Saison indisponible, fallback statique conservé :', err));

    // ============================================================
    // RENDU PUBLIC
    // ============================================================
    function render(saison, cours) {
        // Libellés de saison (hero, titres, sous-titre infos).
        if (saison.label) {
            setText('saison-badge', `Saison ${saison.label}`);
            setText('horaires-label', saison.label);
            setText('tarifs-label', saison.label);
            setText('saison-infos-label', saison.label);
        }

        // Plage de dates + statut.
        setText('saison-plage', (saison.date_debut && saison.date_fin)
            ? `Du ${frDate(saison.date_debut)} au ${frDate(saison.date_fin)}` : '');
        const statut = document.getElementById('saison-statut');
        if (statut) {
            const active = isActive(saison.date_fin);
            statut.textContent = active ? 'Saison active' : 'Saison terminée';
            statut.className = active
                ? 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase font-sans'
                : 'px-3 py-1 bg-gray-200 text-gray-500 rounded-full text-xs font-bold uppercase font-sans';
        }

        // Horaires (un bloc par cours).
        const horaires = document.getElementById('horaires-list');
        if (horaires && cours.length) {
            horaires.innerHTML = cours.map(c => {
                const corail = c.accent === 'corail';
                return `
                    <div class="flex flex-col md:flex-row justify-between border-b border-csb-tatami pb-3 last:border-b-0 last:pb-0">
                        <div>
                            <span class="font-bold block ${corail ? 'text-csb-corail' : 'text-csb-dojo'}">${esc(c.libelle)}</span>
                            <span class="text-gray-500 text-xs">${esc(c.lieu)}${c.professeur ? ' · ' + esc(c.professeur) : ''}</span>
                        </div>
                        <div class="text-left md:text-right mt-1 md:mt-0">
                            <span class="block text-gray-600">${esc(c.jours)}</span>
                            <span class="font-semibold ${corail ? 'text-csb-corail' : 'text-csb-encre'}">${esc(c.heures)}</span>
                        </div>
                    </div>`;
            }).join('');
        }

        // Tarifs (un cours = une ligne ; on n'affiche que les cours tarifés).
        const tarifs = document.getElementById('tarifs-list');
        const tarifes = cours.filter(c => c.prix);
        if (tarifs && tarifes.length) {
            tarifs.innerHTML = tarifes.map(c =>
                `<li class="flex justify-between"><span>${esc(c.libelle)}</span> <strong>${prixEuros(c.prix)}</strong></li>`
            ).join('');
        }
        if (saison.tarifs_note) setText('tarifs-note', saison.tarifs_note);
        if (saison.licence_note) setText('tarifs-licence', saison.licence_note);
    }
});
