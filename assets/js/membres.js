// =============================================================
// GESTION DES MEMBRES (Espace Bureau) — membres.js
// =============================================================
// Tableau de bord + liste des adhérents pour le BUREAU (CRM Phase 2).
// Lecture/écriture directe sur `adherents` via window.sb ; la RLS (migration
// 0006) n'autorise tout ceci qu'aux comptes de rôle `bureau`.
//
// PATTERN : comme inscription.js, le module gestion N'utilise PAS store.js
// (CRUD relationnel + auth). On parle à `sb` sous la session du bureau.
//
// Édition INLINE auto-enregistrée : statut/paiement, membre du bureau, grade.
// (L'enregistrement des paiements/chèques — table `paiements` — viendra après.)
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const fmt = (c) => CSBTarifs.formatEuros(c);

    // --- Listes de référence (alignées sur les CHECK de la migration 0006) ---
    const STATUTS = ['Incomplet', 'Attente paiement', 'Validé'];
    const GRADES = [
        'Ceinture Blanche', 'Ceinture Jaune', 'Ceinture Orange', 'Ceinture Verte',
        'Ceinture Bleue', 'Ceinture Marron', '1er Dan', '2e Dan', '3e Dan', '4e Dan', '5e Dan'
    ];
    const COURS_LABEL = { 'Enfant': 'Enfant', 'Adulte': 'Adulte', 'Self-Defense': 'Self-défense' };

    // --- Éléments ---
    const boot = $('#boot');
    const gate = $('#gate');
    const dashboard = $('#dashboard');
    const gateEmail = $('#gate-email');
    const gatePwd = $('#gate-pwd');
    const gateBtn = $('#gate-btn');
    const gateError = $('#gate-error');
    const statsEl = $('#stats');
    const rowsEl = $('#rows');
    const countEl = $('#count');
    const fSearch = $('#f-search');
    const fCours = $('#f-cours');
    const fStatut = $('#f-statut');
    const rolesRowsEl = $('#roles-rows');

    // --- Rôles (alignés sur le CHECK de la migration 0006) ---
    const ROLES = ['bureau', 'enseignant', 'adherent'];
    const ROLE_RANK = { bureau: 0, enseignant: 1, adherent: 2 };

    // --- État ---
    let adherents = [];
    let dossiers = [];
    let paiements = [];
    let profiles = [];
    let currentUserId = null;

    // =========================================================
    // Authentification (gate bureau)
    // =========================================================
    async function isBureau() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return false;
        currentUserId = user.id; // mémorisé pour marquer « vous » + garde anti-blocage
        const { data, error } = await sb.from('profiles')
            .select('role').eq('user_id', user.id).maybeSingle();
        return !error && data && data.role === 'bureau';
    }

    async function boot_init() {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session && await isBureau()) return showDashboard();
        } catch (err) {
            console.error(err);
        }
        showGate();
    }

    function showGate() {
        boot.classList.add('hidden');
        dashboard.classList.add('hidden');
        gate.classList.remove('hidden');
        // Pré-remplissage de confort (compte bureau historique), modifiable.
        if (!gateEmail.value && window.CSB_ADMIN_EMAIL) gateEmail.value = window.CSB_ADMIN_EMAIL;
        gatePwd.focus();
    }

    async function showDashboard() {
        boot.classList.add('hidden');
        gate.classList.add('hidden');
        dashboard.classList.remove('hidden');
        await loadAll();
    }

    async function login() {
        gateError.classList.add('hidden');
        gateBtn.disabled = true;
        try {
            const { error } = await sb.auth.signInWithPassword({
                email: gateEmail.value.trim(),
                password: gatePwd.value
            });
            if (error) throw error;
            if (!await isBureau()) {
                await sb.auth.signOut();
                throw new Error("Ce compte n'a pas les droits « bureau ».");
            }
            gatePwd.value = '';
            await showDashboard();
        } catch (err) {
            console.error(err);
            gateError.textContent = /Invalid login/i.test(err.message || '')
                ? 'Email ou mot de passe incorrect.'
                : (err.message || 'Connexion impossible.');
            gateError.classList.remove('hidden');
        } finally {
            gateBtn.disabled = false;
        }
    }

    gateBtn.addEventListener('click', login);
    gatePwd.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

    $('#btn-logout').addEventListener('click', async () => {
        await sb.auth.signOut();
        location.reload();
    });
    $('#btn-refresh').addEventListener('click', loadAll);

    // =========================================================
    // Chargement des données (le bureau voit tout via RLS)
    // =========================================================
    async function loadAll() {
        rowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-10 text-center text-gray-400">Chargement…</td></tr>';
        const [aRes, dRes, pRes, prRes] = await Promise.all([
            sb.from('adherents')
                .select('id, prenom, nom, date_naissance, genre, cours_type, grade_actuel, statut_dossier, membre_bureau, famille_id, familles(nom_referent, ville)')
                .order('nom', { ascending: true }),
            sb.from('dossiers').select('montant_total, statut'),
            sb.from('paiements').select('montant, encaisse'),
            sb.from('profiles').select('user_id, email, role')
        ]);

        if (aRes.error) {
            console.error(aRes.error);
            rowsEl.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-csb-corail">Erreur de chargement : ${esc(aRes.error.message)}</td></tr>`;
            return;
        }
        adherents = aRes.data || [];
        dossiers = dRes.data || [];
        paiements = pRes.data || [];
        profiles = prRes.data || [];
        renderStats();
        renderRows();
        renderProfiles();
    }

    // =========================================================
    // Statistiques
    // =========================================================
    function renderStats() {
        const total = adherents.length;
        const byCours = (c) => adherents.filter(a => a.cours_type === c).length;
        const byStatut = (s) => adherents.filter(a => a.statut_dossier === s).length;
        const nbBureau = adherents.filter(a => a.membre_bureau).length;
        const totalDu = dossiers.reduce((s, d) => s + (d.montant_total || 0), 0);
        const encaisse = paiements.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);

        statsEl.innerHTML = [
            statCard('Adhérents', total,
                `${byCours('Enfant')} enfants · ${byCours('Adulte')} adultes · ${byCours('Self-Defense')} self`, 'encre'),
            statCard('Dossiers validés', byStatut('Validé'),
                `${byStatut('Attente paiement')} en attente · ${byStatut('Incomplet')} incomplets`, 'green'),
            statCard('Membres du bureau', nbBureau, 'tarif réduit (37 €)', 'corail'),
            statCard('Encaissé', fmt(encaisse), `sur ${fmt(totalDu)} attendus`, 'dojo')
        ].join('');
    }

    // Carte stat « bento ». accent : encre | green | corail | dojo
    function statCard(title, value, sub, accent) {
        const border = {
            encre: 'border-t-csb-encre', green: 'border-t-green-600',
            corail: 'border-t-csb-corail', dojo: 'border-t-csb-dojo'
        }[accent] || 'border-t-csb-encre';
        return `
            <div class="bg-white rounded-2xl border border-csb-tatami border-t-4 ${border} p-5 shadow-sm">
                <p class="font-condensed uppercase tracking-wider text-[11px] text-gray-400 mb-1">${esc(title)}</p>
                <p class="text-3xl font-bold text-csb-encre leading-none">${esc(value)}</p>
                <p class="text-xs text-gray-500 mt-2">${esc(sub)}</p>
            </div>`;
    }

    // =========================================================
    // Liste (filtres + rendu)
    // =========================================================
    [fSearch, fCours, fStatut].forEach(el => el.addEventListener('input', renderRows));

    function filtered() {
        const q = fSearch.value.trim().toLowerCase();
        const c = fCours.value;
        const s = fStatut.value;
        return adherents.filter(a => {
            if (c && a.cours_type !== c) return false;
            if (s && a.statut_dossier !== s) return false;
            if (q) {
                const hay = `${a.prenom} ${a.nom} ${a.familles?.nom_referent || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function ageOf(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d)) return null;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        return age;
    }

    // Couleur du select statut selon sa valeur.
    function statutClass(v) {
        if (v === 'Validé') return 'bg-green-50 text-green-700 border-green-300';
        if (v === 'Attente paiement') return 'bg-amber-50 text-amber-700 border-amber-300';
        return 'bg-gray-50 text-gray-500 border-csb-tatami'; // Incomplet
    }
    const STATUT_SELECT_BASE = 'text-sm rounded-lg border px-2 py-1.5 font-semibold cursor-pointer ';

    function renderRows() {
        const list = filtered();
        countEl.textContent = `${list.length} membre${list.length > 1 ? 's' : ''}`;
        if (!list.length) {
            rowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-10 text-center text-gray-400">Aucun membre ne correspond.</td></tr>';
            return;
        }
        rowsEl.innerHTML = list.map(rowHtml).join('');
    }

    function rowHtml(a) {
        const age = ageOf(a.date_naissance);
        const ageTxt = age === null ? '' : `${age} ans`;
        const genre = a.genre === 'M' ? 'H' : (a.genre === 'F' ? 'F' : '');
        const meta = [ageTxt, genre].filter(Boolean).join(' · ');
        const ref = a.familles?.nom_referent || '—';
        const ville = a.familles?.ville || '';

        const gradeOpts = GRADES.map(g => `<option ${g === a.grade_actuel ? 'selected' : ''}>${esc(g)}</option>`).join('');
        const statutOpts = STATUTS.map(s => `<option ${s === a.statut_dossier ? 'selected' : ''}>${esc(s)}</option>`).join('');

        return `
            <tr data-id="${a.id}" class="border-t border-csb-tatami/60 hover:bg-csb-washi/40 transition">
                <td class="px-4 py-3">
                    <div class="font-semibold text-csb-encre">${esc(a.prenom)} ${esc(a.nom)}</div>
                    <div class="text-xs text-gray-400">${esc(meta)}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="text-csb-encre">${esc(ref)}</div>
                    <div class="text-xs text-gray-400">${esc(ville)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">${esc(COURS_LABEL[a.cours_type] || '—')}</td>
                <td class="px-4 py-3">
                    <select data-field="grade_actuel" class="text-sm rounded-lg border border-csb-tatami px-2 py-1.5 bg-white cursor-pointer">${gradeOpts}</select>
                </td>
                <td class="px-4 py-3">
                    <select data-field="statut_dossier" class="${STATUT_SELECT_BASE}${statutClass(a.statut_dossier)}">${statutOpts}</select>
                </td>
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" data-field="membre_bureau" class="chk mx-auto" ${a.membre_bureau ? 'checked' : ''}>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <span data-role="feedback" class="text-xs"></span>
                </td>
            </tr>`;
    }

    // =========================================================
    // Édition inline (auto-enregistrement sur changement)
    // =========================================================
    rowsEl.addEventListener('change', async (e) => {
        const ctrl = e.target.closest('[data-field]');
        if (!ctrl) return;
        const tr = ctrl.closest('tr');
        const id = Number(tr.dataset.id);
        const field = ctrl.dataset.field;
        const value = ctrl.type === 'checkbox' ? ctrl.checked : ctrl.value;

        const ok = await saveField(tr, id, field, value);
        if (ok && field === 'statut_dossier') {
            ctrl.className = STATUT_SELECT_BASE + statutClass(value);
        }
    });

    async function saveField(tr, id, field, value) {
        const fb = tr.querySelector('[data-role="feedback"]');
        fb.textContent = 'Enregistrement…';
        fb.className = 'text-xs text-gray-400';

        const { error } = await sb.from('adherents').update({ [field]: value }).eq('id', id);
        if (error) {
            console.error(error);
            fb.textContent = '⚠ échec';
            fb.className = 'text-xs text-csb-corail font-bold';
            return false;
        }

        // Cache local + stats à jour (statut/bureau modifient les compteurs).
        const a = adherents.find(x => x.id === id);
        if (a) a[field] = value;
        renderStats();

        fb.textContent = '✓ enregistré';
        fb.className = 'text-xs text-green-600 font-bold';
        setTimeout(() => { if (fb.textContent === '✓ enregistré') fb.textContent = ''; }, 2000);
        return true;
    }

    // =========================================================
    // Comptes & rôles
    // =========================================================
    function renderProfiles() {
        if (!rolesRowsEl) return;
        const list = profiles.slice().sort((a, b) => {
            const r = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
            return r !== 0 ? r : (a.email || '').localeCompare(b.email || '');
        });
        if (!list.length) {
            rolesRowsEl.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400">Aucun compte.</td></tr>';
            return;
        }
        rolesRowsEl.innerHTML = list.map(p => {
            const isMe = p.user_id === currentUserId;
            const opts = ROLES.map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('');
            return `
                <tr data-uid="${esc(p.user_id)}" class="border-t border-csb-tatami/60 hover:bg-csb-washi/40 transition">
                    <td class="px-4 py-3">
                        <span class="text-csb-encre">${esc(p.email || '(email inconnu)')}</span>
                        ${isMe ? '<span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-csb-corail bg-red-50 px-2 py-0.5 rounded">vous</span>' : ''}
                    </td>
                    <td class="px-4 py-3">
                        <select data-role-select class="text-sm rounded-lg border border-csb-tatami px-2 py-1.5 bg-white cursor-pointer">${opts}</select>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap"><span data-role="feedback" class="text-xs"></span></td>
                </tr>`;
        }).join('');
    }

    function roleLabel(r) {
        return { bureau: 'Bureau', enseignant: 'Enseignant', adherent: 'Adhérent' }[r] || r;
    }

    rolesRowsEl && rolesRowsEl.addEventListener('change', async (e) => {
        const sel = e.target.closest('[data-role-select]');
        if (!sel) return;
        const tr = sel.closest('tr');
        const uid = tr.dataset.uid;
        const newRole = sel.value;
        const prof = profiles.find(p => p.user_id === uid);
        const oldRole = prof ? prof.role : 'adherent';
        if (newRole === oldRole) return;

        // Garde anti-blocage : ne pas retirer le DERNIER accès bureau,
        // ni son PROPRE accès bureau (lockout de la session en cours).
        if (oldRole === 'bureau' && newRole !== 'bureau') {
            if (uid === currentUserId) {
                alert('Vous ne pouvez pas retirer votre propre accès bureau (risque de blocage). Demandez à un autre membre du bureau de le faire.');
                sel.value = oldRole;
                return;
            }
            const nbBureau = profiles.filter(p => p.role === 'bureau').length;
            if (nbBureau <= 1) {
                alert('Impossible : il doit rester au moins un compte « bureau ».');
                sel.value = oldRole;
                return;
            }
        }

        const fb = tr.querySelector('[data-role="feedback"]');
        fb.textContent = 'Enregistrement…';
        fb.className = 'text-xs text-gray-400';

        const { error } = await sb.from('profiles').update({ role: newRole }).eq('user_id', uid);
        if (error) {
            console.error(error);
            fb.textContent = '⚠ échec';
            fb.className = 'text-xs text-csb-corail font-bold';
            sel.value = oldRole;
            return;
        }
        if (prof) prof.role = newRole;
        fb.textContent = '✓ enregistré';
        fb.className = 'text-xs text-green-600 font-bold';
        setTimeout(() => { if (fb.textContent === '✓ enregistré') fb.textContent = ''; }, 2000);
    });

    // --- Démarrage ---
    boot_init();
});
