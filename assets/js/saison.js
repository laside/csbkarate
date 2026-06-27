// =============================================================
// SAISON (Horaires & Tarifs) — saison.js   [page d'accueil]
// =============================================================
// Rend éditable par l'admin la section « Informations Pratiques » de
// index.html (libellé de saison, plage de dates, horaires, tarifs, notes).
//
// SOURCE : collection `saison` (document JSONB singleton, cf. store.js).
// PROGRESSIVE ENHANCEMENT : le HTML statique d'index.html sert de FALLBACK.
// Si le chargement réussit, on remplace le contenu par les données en base ;
// s'il échoue (Supabase en pause, hors-ligne…), la page garde son contenu
// statique. Aucune régression visuelle possible.
//
// Login + modales factorisés dans admin.js ; accès données dans store.js.
// =============================================================

document.addEventListener('DOMContentLoaded', () => {

    // Modèle vide (sécurité).
    let data = { label: '', debut: '', fin: '', horaires: [], tarifs: [], tarifsNote: '', licenceNote: '', tarifLicence: 3700 };

    // Échappe le HTML pour injecter du contenu admin en toute sécurité.
    const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Classe commune des champs de formulaire admin.
    const FIELD = 'w-full border border-csb-tatami rounded p-2 text-sm';

    // Affecte un texte à un élément s'il existe.
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    // Date ISO (yyyy-mm-dd) -> « 1 septembre 2026 » (vide si invalide).
    function frDate(iso) {
        if (!iso) return '';
        const d = new Date(iso + 'T00:00:00');
        return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // La saison est-elle encore en cours ? On la considère « active » tant
    // qu'elle n'est pas terminée (today <= fin) : ainsi, pendant l'été (avant
    // le début officiel), l'accueil n'affiche pas un statut « fermé » alors
    // que c'est justement la période des inscriptions. (Pas de fin : active.)
    function isActive() {
        if (!data.fin) return true;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return today <= new Date(data.fin + 'T00:00:00');
    }

    // ============================================================
    // CHARGEMENT (remplace le fallback statique si succès)
    // ============================================================
    Store.loadCollection('saison')
        .then(loaded => {
            if (loaded && typeof loaded === 'object') {
                data = Object.assign(data, loaded);
                data.horaires = loaded.horaires || [];
                data.tarifs = loaded.tarifs || [];
            }
            renderPublic();
        })
        .catch(err => console.error('Saison indisponible, fallback statique conservé :', err));

    // ============================================================
    // RENDU PUBLIC
    // ============================================================
    function renderPublic() {
        // Libellés de saison (hero, titres, sous-titre infos).
        if (data.label) {
            setText('saison-badge', `Saison ${data.label}`);
            setText('horaires-label', data.label);
            setText('tarifs-label', data.label);
            setText('saison-infos-label', data.label);
        }

        // Plage de dates + statut.
        setText('saison-plage', (data.debut && data.fin) ? `Du ${frDate(data.debut)} au ${frDate(data.fin)}` : '');
        const statut = document.getElementById('saison-statut');
        if (statut) {
            const active = isActive();
            statut.textContent = active ? 'Saison active' : 'Saison terminée';
            statut.className = active
                ? 'px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase font-sans'
                : 'px-3 py-1 bg-gray-200 text-gray-500 rounded-full text-xs font-bold uppercase font-sans';
        }

        // Horaires.
        const horaires = document.getElementById('horaires-list');
        if (horaires && data.horaires.length) {
            horaires.innerHTML = data.horaires.map(h => {
                const corail = h.accent === 'corail';
                return `
                    <div class="flex flex-col md:flex-row justify-between border-b border-csb-tatami pb-3 last:border-b-0 last:pb-0">
                        <div>
                            <span class="font-bold block ${corail ? 'text-csb-corail' : 'text-csb-dojo'}">${esc(h.groupe)}</span>
                            <span class="text-gray-500 text-xs">${esc(h.lieu)}</span>
                        </div>
                        <div class="text-left md:text-right mt-1 md:mt-0">
                            <span class="block text-gray-600">${esc(h.jours)}</span>
                            <span class="font-semibold ${corail ? 'text-csb-corail' : 'text-csb-encre'}">${esc(h.heures)}</span>
                        </div>
                    </div>`;
            }).join('');
        }

        // Tarifs.
        const tarifs = document.getElementById('tarifs-list');
        if (tarifs && data.tarifs.length) {
            tarifs.innerHTML = data.tarifs.map(t =>
                `<li class="flex justify-between"><span>${esc(t.label)}</span> <strong>${esc(t.prix)}</strong></li>`
            ).join('');
        }
        if (data.tarifsNote) setText('tarifs-note', data.tarifsNote);
        if (data.licenceNote) setText('tarifs-licence', data.licenceNote);
    }

    // ============================================================
    // ADMIN — éléments
    // ============================================================
    const inLabel = document.getElementById('saison-input-label');
    const inDebut = document.getElementById('saison-input-debut');
    const inFin = document.getElementById('saison-input-fin');
    const inTarifsNote = document.getElementById('saison-input-tarifs-note');
    const inLicenceNote = document.getElementById('saison-input-licence-note');
    const inLicenceTarif = document.getElementById('saison-input-licence-tarif');
    const horairesList = document.getElementById('admin-horaires-list');
    const tarifsList = document.getElementById('admin-tarifs-list');
    const btnAddHoraire = document.getElementById('btn-add-horaire');
    const btnAddTarif = document.getElementById('btn-add-tarif');
    const btnExport = document.getElementById('btn-export');

    // ============================================================
    // ADMIN — gabarits de ligne
    // ============================================================
    function horaireRow(h = {}) {
        return `
            <div data-row class="bg-white p-4 rounded-xl border border-csb-tatami grid md:grid-cols-2 gap-3">
                <input data-k="groupe" value="${esc(h.groupe)}" placeholder="Groupe / catégorie" class="${FIELD}">
                <input data-k="lieu" value="${esc(h.lieu)}" placeholder="Lieu" class="${FIELD}">
                <input data-k="jours" value="${esc(h.jours)}" placeholder="Jours (ex : Mardi et Jeudi)" class="${FIELD}">
                <input data-k="heures" value="${esc(h.heures)}" placeholder="Horaire (ex : 18h30 - 19h30)" class="${FIELD}">
                <select data-k="accent" class="${FIELD}">
                    <option value="dojo" ${h.accent === 'corail' ? '' : 'selected'}>Couleur standard</option>
                    <option value="corail" ${h.accent === 'corail' ? 'selected' : ''}>Accent corail (mis en avant)</option>
                </select>
                <button type="button" data-del class="text-csb-corail text-sm font-bold hover:underline justify-self-start md:justify-self-end">Supprimer ce créneau</button>
            </div>`;
    }

    // Types de cours correspondant au formulaire d'inscription.
    const COURS_TYPES = [
        { value: '',              label: '— (affichage seul)' },
        { value: 'Baby',          label: 'Baby Karaté' },
        { value: 'Enfant',        label: 'Enfants' },
        { value: 'Adulte',        label: 'Ado / Adulte' },
        { value: 'Self-Defense',  label: 'Self-Défense Fém.' }
    ];

    function tarifRow(t = {}) {
        const opts = COURS_TYPES.map(ct =>
            `<option value="${esc(ct.value)}" ${t.coursType === ct.value ? 'selected' : ''}>${esc(ct.label)}</option>`
        ).join('');
        return `
            <div data-row class="flex flex-wrap gap-3 items-center">
                <select data-k="coursType" class="${FIELD} w-44" title="Type de cours (pour le calcul d'inscription)">${opts}</select>
                <input data-k="label" value="${esc(t.label)}" placeholder="Catégorie (ex : Enfants)" class="${FIELD} flex-grow">
                <input data-k="prix" value="${esc(t.prix)}" placeholder="183 €" class="${FIELD} w-28">
                <button type="button" data-del class="text-csb-corail font-bold px-2 hover:scale-110 transition" title="Supprimer">✕</button>
            </div>`;
    }

    // ============================================================
    // ADMIN — synchronisation DOM -> data (avant tout re-render / save)
    // ============================================================
    function syncFromDom() {
        if (inLabel) data.label = inLabel.value.trim();
        if (inDebut) data.debut = inDebut.value;
        if (inFin) data.fin = inFin.value;
        if (inTarifsNote) data.tarifsNote = inTarifsNote.value.trim();
        if (inLicenceNote) data.licenceNote = inLicenceNote.value.trim();
        // Tarif licence : stocké en centimes (l'admin saisit en euros).
        if (inLicenceTarif) {
            const v = parseFloat(inLicenceTarif.value);
            data.tarifLicence = isFinite(v) ? Math.round(v * 100) : 3700;
        }

        if (horairesList) {
            data.horaires = [...horairesList.querySelectorAll('[data-row]')].map(row => ({
                groupe: row.querySelector('[data-k="groupe"]').value.trim(),
                lieu: row.querySelector('[data-k="lieu"]').value.trim(),
                jours: row.querySelector('[data-k="jours"]').value.trim(),
                heures: row.querySelector('[data-k="heures"]').value.trim(),
                accent: row.querySelector('[data-k="accent"]').value
            }));
        }
        if (tarifsList) {
            data.tarifs = [...tarifsList.querySelectorAll('[data-row]')].map(row => ({
                coursType: row.querySelector('[data-k="coursType"]').value,
                label: row.querySelector('[data-k="label"]').value.trim(),
                prix: row.querySelector('[data-k="prix"]').value.trim()
            }));
        }
    }

    // ============================================================
    // ADMIN — rendu du formulaire
    // ============================================================
    function renderAdmin() {
        if (inLabel) inLabel.value = data.label || '';
        if (inDebut) inDebut.value = data.debut || '';
        if (inFin) inFin.value = data.fin || '';
        if (inTarifsNote) inTarifsNote.value = data.tarifsNote || '';
        if (inLicenceNote) inLicenceNote.value = data.licenceNote || '';
        // Centimes -> euros pour l'affichage admin.
        if (inLicenceTarif) inLicenceTarif.value = ((data.tarifLicence || 3700) / 100);
        renderAdminLists();
    }

    function renderAdminLists() {
        if (horairesList) {
            horairesList.innerHTML = data.horaires.map(horaireRow).join('') ||
                '<p class="text-sm text-gray-400">Aucun créneau. Ajoutez-en un.</p>';
        }
        if (tarifsList) {
            tarifsList.innerHTML = data.tarifs.map(tarifRow).join('') ||
                '<p class="text-sm text-gray-400">Aucun tarif. Ajoutez-en un.</p>';
        }
    }

    // ============================================================
    // ADMIN — interactions
    // ============================================================
    if (btnAddHoraire) btnAddHoraire.addEventListener('click', () => {
        syncFromDom();
        data.horaires.push({ accent: 'dojo' });
        renderAdminLists();
    });
    if (btnAddTarif) btnAddTarif.addEventListener('click', () => {
        syncFromDom();
        data.tarifs.push({});
        renderAdminLists();
    });

    // Suppression d'une ligne (délégation).
    function wireDelete(container, key) {
        if (!container) return;
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-del]');
            if (!btn) return;
            const rows = [...container.querySelectorAll('[data-row]')];
            const idx = rows.indexOf(btn.closest('[data-row]'));
            syncFromDom();
            data[key].splice(idx, 1);
            renderAdminLists();
        });
    }
    wireDelete(horairesList, 'horaires');
    wireDelete(tarifsList, 'tarifs');

    // Enregistrement en ligne (Supabase via store.js).
    if (btnExport) btnExport.addEventListener('click', async () => {
        syncFromDom();
        await Store.saveCollection('saison', data);
        renderPublic();
    });

    // ============================================================
    // ADMIN — connexion (factorisée dans admin.js)
    // ============================================================
    // La RLS de `saison` ouvre la lecture à l'anon : les données sont déjà
    // chargées, pas besoin de re-fetch après login (contrairement à grades).
    Admin.init({
        onUnlock: renderAdmin,
        onCloseAdmin: renderPublic
    });
});
