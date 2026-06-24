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
    const ROLE_RANK = { bureau: 0, enseignant: 1, adherent: 2 };

    // --- État ---
    let adherents = [];
    let dossiers = [];
    let paiements = [];
    let profiles = [];
    let factures = [];
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
                throw new Error("Ce compte n'a pas les droits « administrateur ».");
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
        const [aRes, dRes, pRes, prRes, facRes] = await Promise.all([
            sb.from('adherents')
                .select('id, prenom, nom, date_naissance, genre, cours_type, grade_actuel, statut_dossier, membre_bureau, famille_id, familles(nom_referent, ville)')
                .order('nom', { ascending: true }),
            sb.from('dossiers')
                .select('id, famille_id, saison, montant_total, detail_calcul, statut, created_at, familles(nom_referent, ville)')
                .order('created_at', { ascending: false }),
            sb.from('paiements').select('id, dossier_id, montant, mode, numero_cheque, encaisse, date_encaissement'),
            sb.from('profiles').select('user_id, email, role'),
            sb.from('factures').select('id, dossier_id, numero, montant, emise_le, snapshot')
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
        factures = facRes.data || [];
        renderStats();
        renderRows();
        renderAdmins();
        renderDossiers();
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
            statCard('Bureau du club', nbBureau, 'pratiquants · tarif réduit (37 €)', 'corail'),
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
    // Administrateurs du site (accès gestion) — distinct de membre_bureau
    // =========================================================
    // « Admin du site » = compte de rôle bureau (accès complet) ou enseignant
    // (grades). Les comptes 'adherent' ne sont PAS des admins : on ne les
    // affiche pas ici. Promouvoir/rétrograder = changer profiles.role.
    const ADMIN_ROLES = ['bureau', 'enseignant'];

    function roleLabel(r) {
        return { bureau: 'Administrateur', enseignant: 'Enseignant', adherent: 'Adhérent' }[r] || r;
    }

    function renderAdmins() {
        if (!rolesRowsEl) return;
        const list = profiles.filter(p => ADMIN_ROLES.includes(p.role)).sort((a, b) => {
            const r = (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9);
            return r !== 0 ? r : (a.email || '').localeCompare(b.email || '');
        });
        if (!list.length) {
            rolesRowsEl.innerHTML = '<tr><td colspan="3" class="px-4 py-8 text-center text-gray-400">Aucun administrateur. Ajoutez-en un ci-dessus.</td></tr>';
            return;
        }
        rolesRowsEl.innerHTML = list.map(p => {
            const isMe = p.user_id === currentUserId;
            const opts = ADMIN_ROLES.map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('');
            return `
                <tr data-uid="${esc(p.user_id)}" class="border-t border-csb-tatami/60 hover:bg-csb-washi/40 transition">
                    <td class="px-4 py-3">
                        <span class="text-csb-encre">${esc(p.email || '(email inconnu)')}</span>
                        ${isMe ? '<span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-csb-corail bg-red-50 px-2 py-0.5 rounded">vous</span>' : ''}
                    </td>
                    <td class="px-4 py-3 flex items-center gap-3">
                        <select data-role-select class="text-sm rounded-lg border border-csb-tatami px-2 py-1.5 bg-white cursor-pointer">${opts}</select>
                        <span data-role="feedback" class="text-xs"></span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button type="button" data-remove-access class="text-csb-corail text-sm font-bold hover:underline">Retirer l'accès</button>
                    </td>
                </tr>`;
        }).join('');
    }

    // Compte combien de comptes ont l'accès complet (bureau) — pour les gardes.
    function nbAdminsComplets() {
        return profiles.filter(p => p.role === 'bureau').length;
    }

    // Vérifie qu'on ne retire pas le dernier accès « bureau » ni le sien.
    // Retourne un message d'erreur (string) si interdit, sinon null.
    function blocageRetraitBureau(uid) {
        if (uid === currentUserId) {
            return 'Vous ne pouvez pas retirer votre propre accès administrateur (risque de blocage). Demandez à un autre administrateur.';
        }
        if (nbAdminsComplets() <= 1) {
            return 'Impossible : il doit rester au moins un administrateur (accès complet).';
        }
        return null;
    }

    // Changement de niveau (Administrateur <-> Enseignant).
    rolesRowsEl && rolesRowsEl.addEventListener('change', async (e) => {
        const sel = e.target.closest('[data-role-select]');
        if (!sel) return;
        const tr = sel.closest('tr');
        const uid = tr.dataset.uid;
        const newRole = sel.value;
        const prof = profiles.find(p => p.user_id === uid);
        const oldRole = prof ? prof.role : 'adherent';
        if (newRole === oldRole) return;

        // Rétrograder un « bureau » (vers enseignant) réduit les accès complets.
        if (oldRole === 'bureau' && newRole !== 'bureau') {
            const err = blocageRetraitBureau(uid);
            if (err) { alert(err); sel.value = oldRole; return; }
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

    // Retirer l'accès : le compte redevient un simple adhérent.
    rolesRowsEl && rolesRowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-remove-access]');
        if (!btn) return;
        const tr = btn.closest('tr');
        const uid = tr.dataset.uid;
        const prof = profiles.find(p => p.user_id === uid);
        if (!prof) return;

        if (prof.role === 'bureau') {
            const err = blocageRetraitBureau(uid);
            if (err) { alert(err); return; }
        }
        if (!confirm(`Retirer l'accès de ${prof.email || 'ce compte'} ?\nLe compte redeviendra un simple adhérent (il n'est pas supprimé).`)) return;

        const { error } = await sb.from('profiles').update({ role: 'adherent' }).eq('user_id', uid);
        if (error) { alert('Échec : ' + error.message); return; }
        prof.role = 'adherent';
        renderAdmins();
    });

    // Ajouter un administrateur = promouvoir un compte EXISTANT (par email).
    const adminAddBtn = $('#admin-add-btn');
    adminAddBtn && adminAddBtn.addEventListener('click', async () => {
        const emailEl = $('#admin-email');
        const msg = $('#admin-add-msg');
        const email = emailEl.value.trim();
        const role = $('#admin-role').value;
        const showMsg = (txt, ok) => {
            msg.textContent = txt;
            msg.className = 'text-sm mb-4 ' + (ok ? 'text-green-600' : 'text-csb-corail');
            msg.classList.remove('hidden');
        };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg('Email invalide.', false); return; }

        adminAddBtn.disabled = true;
        try {
            // Recherche du compte (email recopié dans profiles par la migration 0008).
            const { data, error } = await sb.from('profiles')
                .select('user_id, email, role').ilike('email', email).maybeSingle();
            if (error) throw error;
            if (!data) {
                showMsg("Aucun compte avec cet email. La personne doit d'abord créer un compte via l'inscription en ligne.", false);
                return;
            }
            if (ADMIN_ROLES.includes(data.role)) {
                showMsg(`Ce compte est déjà ${roleLabel(data.role)}.`, false);
                return;
            }
            const { error: upErr } = await sb.from('profiles').update({ role }).eq('user_id', data.user_id);
            if (upErr) throw upErr;

            // Cache local + rendu.
            const prof = profiles.find(p => p.user_id === data.user_id);
            if (prof) prof.role = role; else profiles.push({ user_id: data.user_id, email: data.email, role });
            emailEl.value = '';
            renderAdmins();
            showMsg(`${data.email} est maintenant ${roleLabel(role)}.`, true);
        } catch (err) {
            console.error(err);
            showMsg('Erreur : ' + (err.message || err), false);
        } finally {
            adminAddBtn.disabled = false;
        }
    });

    // =========================================================
    // Dossiers & règlements (encaissements + facture)
    // =========================================================
    // Source unique de l'état « soldé » : le dossier (panier famille). La
    // facture (document fiscal numéroté) n'est éditable QUE dossier soldé, et
    // l'émission est faite côté base (RPC bureau-only) — cf. migration 0009.
    const dossiersRowsEl = $('#dossiers-rows');

    // Centimes encaissés (lignes `encaisse = true`) d'un dossier.
    function encaisseDe(dossierId) {
        return paiements
            .filter(p => p.dossier_id === dossierId && p.encaisse)
            .reduce((s, p) => s + (p.montant || 0), 0);
    }
    function estSolde(d) {
        return d.statut === 'valide' || encaisseDe(d.id) >= (d.montant_total || 0);
    }
    // Statut dérivé des encaissements (on ne touche jamais un dossier 'annule').
    function statutDerive(d) {
        if (d.statut === 'annule') return 'annule';
        const enc = encaisseDe(d.id);
        if ((d.montant_total || 0) > 0 && enc >= d.montant_total) return 'valide';
        return enc > 0 ? 'paye_partiel' : 'attente_paiement';
    }
    const DOSSIER_BADGE = {
        valide: ['Soldé', 'bg-green-50 text-green-700 border-green-300'],
        paye_partiel: ['Partiel', 'bg-amber-50 text-amber-700 border-amber-300'],
        attente_paiement: ['En attente', 'bg-gray-50 text-gray-500 border-csb-tatami'],
        annule: ['Annulé', 'bg-gray-100 text-gray-400 border-csb-tatami']
    };
    const PAY_MODE_LABEL = { cheque: 'Chèque', espece: 'Espèces', cb: 'Carte', ancv: 'ANCV', caf: 'CAF' };

    function renderDossiers() {
        if (!dossiersRowsEl) return;
        if (!dossiers.length) {
            dossiersRowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">Aucun dossier d\'inscription.</td></tr>';
            return;
        }
        dossiersRowsEl.innerHTML = dossiers.map(dossierRowHtml).join('');
    }

    function dossierRowHtml(d) {
        const enc = encaisseDe(d.id);
        const reste = Math.max(0, (d.montant_total || 0) - enc);
        const [txt, cls] = DOSSIER_BADGE[statutDerive(d)] || DOSSIER_BADGE.attente_paiement;
        const ref = d.familles?.nom_referent || '—';
        const ville = d.familles?.ville || '';
        const fac = factures.find(f => f.dossier_id === d.id);
        const facTag = fac
            ? `<span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-csb-dojo bg-csb-washi border border-csb-tatami px-2 py-0.5 rounded">Facture ${esc(fac.numero)}</span>`
            : '';
        return `
            <tr data-dossier="${d.id}" class="border-t border-csb-tatami/60 hover:bg-csb-washi/40 transition">
                <td class="px-4 py-3">
                    <div class="font-semibold text-csb-encre">${esc(ref)}</div>
                    <div class="text-xs text-gray-400">${esc(ville)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">${esc(d.saison || '')}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">${fmt(d.montant_total)}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap text-green-700">${fmt(enc)}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap ${reste > 0 ? 'text-csb-corail font-semibold' : 'text-gray-400'}">${fmt(reste)}</td>
                <td class="px-4 py-3"><span class="inline-block text-xs font-semibold rounded-full px-3 py-1 border ${cls}">${esc(txt)}</span>${facTag}</td>
                <td class="px-4 py-3 text-right">
                    <button type="button" data-pay="${d.id}"
                            class="px-4 py-1.5 rounded-full font-condensed uppercase tracking-wider border border-csb-dojo text-csb-dojo hover:bg-csb-dojo hover:text-white transition text-xs">
                        Gérer
                    </button>
                </td>
            </tr>`;
    }

    // --- Modale d'encaissement ---
    const payModal = $('#pay-modal');
    const payTitle = $('#pay-title');
    const paySummary = $('#pay-summary');
    const payList = $('#pay-list');
    const payMsg = $('#pay-msg');
    const payFactureBtn = $('#pay-facture');
    let modalDossierId = null;

    function openPayModal(id) {
        modalDossierId = id;
        const d = dossiers.find(x => x.id === id);
        if (!d) return;
        payTitle.textContent = (d.familles?.nom_referent || 'Dossier') + ' · ' + (d.saison || '');
        $('#pay-montant').value = '';
        $('#pay-cheque').value = '';
        $('#pay-date').value = new Date().toISOString().slice(0, 10);
        $('#pay-encaisse').checked = true;
        payMsg.classList.add('hidden');
        renderPayBody(d);
        payModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }
    function closePayModal() {
        modalDossierId = null;
        payModal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }

    function renderPayBody(d) {
        const enc = encaisseDe(d.id);
        const reste = Math.max(0, (d.montant_total || 0) - enc);
        const cell = (label, val, color) => `
            <div class="rounded-xl bg-csb-washi/60 border border-csb-tatami p-3">
                <p class="text-[10px] uppercase tracking-wider text-gray-400">${label}</p>
                <p class="text-lg font-bold ${color}">${val}</p>
            </div>`;
        paySummary.innerHTML =
            cell('Total', fmt(d.montant_total), 'text-csb-encre') +
            cell('Encaissé', fmt(enc), 'text-green-700') +
            cell('Reste', fmt(reste), reste > 0 ? 'text-csb-corail' : 'text-gray-400');

        // Pré-remplit le champ montant avec le reste (confort de saisie).
        if (reste > 0) $('#pay-montant').value = (reste / 100).toFixed(2);

        const lignes = paiements.filter(p => p.dossier_id === d.id);
        payList.innerHTML = lignes.length ? lignes.map(p => `
            <div class="flex items-center justify-between gap-3 text-sm border border-csb-tatami rounded-lg px-3 py-2">
                <span>
                    <strong class="text-csb-encre">${fmt(p.montant)}</strong>
                    <span class="text-gray-400">· ${esc(PAY_MODE_LABEL[p.mode] || p.mode)}${p.numero_cheque ? ' n°' + esc(p.numero_cheque) : ''}</span>
                </span>
                <span class="text-xs font-semibold ${p.encaisse ? 'text-green-600' : 'text-amber-600'}">${p.encaisse ? '✓ encaissé' : 'à encaisser'}</span>
            </div>`).join('')
            : '<p class="text-sm text-gray-400">Aucun encaissement enregistré.</p>';

        // Bouton facture : actif seulement si soldé.
        const fac = factures.find(f => f.dossier_id === d.id);
        const solde = estSolde(d);
        payFactureBtn.disabled = !solde;
        payFactureBtn.title = solde ? '' : 'Disponible une fois le dossier soldé.';
        payFactureBtn.innerHTML = fac
            ? `⬇ Télécharger la facture N° ${esc(fac.numero)}`
            : '⬇ Éditer la facture';
    }

    dossiersRowsEl && dossiersRowsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pay]');
        if (btn) openPayModal(Number(btn.dataset.pay));
    });
    $('#pay-close').addEventListener('click', closePayModal);
    payModal.addEventListener('click', (e) => { if (e.target === payModal) closePayModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !payModal.classList.contains('hidden')) closePayModal(); });

    // Enregistrer un encaissement (écriture `paiements` : RLS = bureau only).
    $('#pay-add').addEventListener('click', async () => {
        const d = dossiers.find(x => x.id === modalDossierId);
        if (!d) return;
        const euros = parseFloat($('#pay-montant').value);
        if (!(euros > 0)) { showPayMsg('Montant invalide.', false); return; }
        const row = {
            dossier_id: d.id,
            montant: Math.round(euros * 100),       // centimes
            mode: $('#pay-mode').value,
            numero_cheque: $('#pay-cheque').value.trim(),
            encaisse: $('#pay-encaisse').checked,
            date_encaissement: $('#pay-date').value || null
        };
        const addBtn = $('#pay-add');
        addBtn.disabled = true;
        try {
            const { data, error } = await sb.from('paiements').insert(row).select().single();
            if (error) throw error;
            paiements.push(data);
            await syncStatutDossier(d);       // bascule le statut si soldé/partiel
            renderPayBody(d);
            renderDossiers();
            renderStats();
            $('#pay-montant').value = '';
            $('#pay-cheque').value = '';
            showPayMsg('Encaissement enregistré.', true);
        } catch (err) {
            console.error(err);
            showPayMsg('Échec : ' + (err.message || err), false);
        } finally {
            addBtn.disabled = false;
        }
    });

    // Aligne dossiers.statut sur les encaissements (idempotent).
    async function syncStatutDossier(d) {
        const cible = statutDerive(d);
        if (cible === d.statut) return;
        const { error } = await sb.from('dossiers').update({ statut: cible }).eq('id', d.id);
        if (!error) d.statut = cible;
        else console.error(error);
    }

    function showPayMsg(txt, ok) {
        payMsg.textContent = txt;
        payMsg.className = 'text-sm mt-3 ' + (ok ? 'text-green-600' : 'text-csb-corail');
        payMsg.classList.remove('hidden');
    }

    // Émission / téléchargement de la facture (RPC atomique, bureau-only).
    payFactureBtn.addEventListener('click', async () => {
        const d = dossiers.find(x => x.id === modalDossierId);
        if (!d) return;
        payFactureBtn.disabled = true;
        try {
            const { data, error } = await sb.rpc('emettre_facture', { p_dossier_id: d.id });
            if (error) throw error;
            // La RPC renvoie la ligne `factures` (créée ou existante).
            const fac = Array.isArray(data) ? data[0] : data;
            if (!factures.some(f => f.id === fac.id)) factures.push(fac);
            await CSBPdf.facture(fac);
            renderPayBody(d);
            renderDossiers();
        } catch (err) {
            console.error(err);
            showPayMsg('Facture impossible : ' + (err.message || err), false);
        } finally {
            payFactureBtn.disabled = false;
        }
    });

    // --- Démarrage ---
    boot_init();
});
