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
        renderAdmins();
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
                <td class="px-4 py-3 whitespace-nowrap text-right">
                    <span data-role="feedback" class="text-xs mr-2"></span>
                    <button type="button" data-open-detail class="text-csb-corail text-sm font-bold hover:underline whitespace-nowrap">Dossier ›</button>
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
    // FICHE DOSSIER FAMILLE (modale) — Phase 2
    // =========================================================
    // Vue détaillée par famille : pièces justificatives (checklist validée par
    // le bureau) + règlement (paiements). La bascule de statut est DÉRIVÉE du
    // règlement : dès que l'encaissé couvre le total dû, les adhérents de la
    // famille passent « Validé » (et reviennent « Attente paiement » si on
    // retire un encaissement). Modèle : un dossier par famille et par saison.
    // =========================================================
    const SAISON = '2026-2027'; // saison active (aligné sur inscription.js)

    // Modes de règlement (alignés sur le CHECK de la migration 0006).
    const MODE_LABEL = { cheque: 'Chèque', espece: 'Espèces', cb: 'CB', ancv: 'Coupon ANCV', caf: 'Bon CAF' };

    // Checklist des pièces (jsonb `adherents.documents`). Évolutif : ajouter ou
    // retirer une ligne ici suffit, sans migration. `minorOnly` = mineurs seuls.
    const DOCUMENTS = [
        { key: 'photo',                  label: "Photo d'identité" },
        { key: 'certificat_medical',     label: 'Certificat médical / questionnaire santé' },
        { key: 'autorisation_parentale', label: 'Autorisation parentale', minorOnly: true },
        { key: 'reglement_interieur',    label: 'Règlement intérieur signé' }
    ];

    const modal = $('#detail-modal');
    const detailBody = $('#detail-body');
    const detailTitle = $('#detail-title');
    const detailSub = $('#detail-sub');

    let detailFamille = null;
    let detailAdherents = [];
    let detailDossiers = [];
    let detailPaiements = [];
    let detailDirty = false; // une écriture impactant la liste a eu lieu → recharger à la fermeture
    let tarifConfig = null;  // pour créer un dossier manquant (calcul auto)

    // Saisie en euros (« 70 » / « 70,50 ») -> centimes. null si invalide.
    function eurosToCents(str) {
        const n = parseFloat(String(str).replace(',', '.').replace(/[^\d.]/g, ''));
        if (!isFinite(n) || n < 0) return null;
        return Math.round(n * 100);
    }

    async function loadTarifConfig() {
        if (tarifConfig) return tarifConfig;
        const { data } = await sb.from('tarifs').select('*').eq('saison', SAISON).maybeSingle();
        tarifConfig = data || CSBTarifs.DEFAULT_CONFIG;
        return tarifConfig;
    }

    // --- Ouverture / fermeture ---
    rowsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-open-detail]');
        if (!btn) return;
        const id = Number(btn.closest('tr').dataset.id);
        const a = adherents.find(x => x.id === id);
        if (a) openDetail(a.famille_id);
    });

    function closeDetail() {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        if (detailDirty) { detailDirty = false; loadAll(); } // répercute statuts/encaissements dans la liste + stats
    }
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-detail-close]')) closeDetail(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeDetail();
    });

    async function openDetail(familleId) {
        detailDirty = false;
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        detailTitle.textContent = 'Chargement…';
        detailSub.textContent = '';
        detailBody.innerHTML = '<p class="text-center text-gray-400 py-10">Chargement du dossier…</p>';

        const [fRes, aRes, dRes] = await Promise.all([
            sb.from('familles').select('*').eq('id', familleId).maybeSingle(),
            sb.from('adherents').select('*').eq('famille_id', familleId).order('id', { ascending: true }),
            sb.from('dossiers').select('*').eq('famille_id', familleId).order('id', { ascending: true })
        ]);
        const firstErr = fRes.error || aRes.error || dRes.error;
        if (firstErr) {
            detailBody.innerHTML = `<p class="text-center text-csb-corail py-10">Erreur de chargement : ${esc(firstErr.message)}</p>`;
            return;
        }
        detailFamille = fRes.data || { id: familleId };
        detailAdherents = aRes.data || [];
        detailDossiers = dRes.data || [];

        const dossierIds = detailDossiers.map(d => d.id);
        if (dossierIds.length) {
            const pRes = await sb.from('paiements').select('*').in('dossier_id', dossierIds).order('id', { ascending: true });
            detailPaiements = pRes.error ? [] : (pRes.data || []);
        } else {
            detailPaiements = [];
        }
        renderDetail();
    }

    // =========================================================
    // Rendu de la modale
    // =========================================================
    function renderDetail() {
        const f = detailFamille;
        detailTitle.textContent = `Famille ${f.nom_referent || '—'}`;
        const adr = [f.adresse, [f.code_postal, f.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        detailSub.textContent = [adr, f.telephone_urgence].filter(Boolean).join(' · ');
        detailBody.innerHTML = sectionAdherents() + sectionReglement();
    }

    function badgeStatut(v) {
        return `<span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statutClass(v)}">${esc(v)}</span>`;
    }

    function sectionAdherents() {
        const cards = detailAdherents.map(adherentCard).join('') ||
            '<p class="text-sm text-gray-400">Aucun adhérent rattaché à cette famille.</p>';
        return `
            <section>
                <h3 class="font-condensed text-lg uppercase tracking-wider text-csb-encre mb-3">Adhérents &amp; pièces justificatives</h3>
                <div class="space-y-4">${cards}</div>
            </section>`;
    }

    function adherentCard(a) {
        const age = ageOf(a.date_naissance);
        const isMinor = age !== null && age < 18;
        const docs = (a.documents && typeof a.documents === 'object') ? a.documents : {};
        const applicable = DOCUMENTS.filter(d => !d.minorOnly || isMinor);
        const nbOk = applicable.filter(d => docs[d.key]).length;

        const checks = applicable.map(d => `
            <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" class="chk" data-doc-key="${d.key}" data-adherent-id="${a.id}" ${docs[d.key] ? 'checked' : ''}>
                <span>${esc(d.label)}</span>
            </label>`).join('');

        // Consentements / Pass'Sport saisis à l'inscription — lecture seule.
        const infos = [
            a.droit_image ? "Droit à l'image ✔" : "Droit à l'image ✘",
            a.pass_sport ? `Pass'Sport${a.pass_sport_code ? ' (' + esc(a.pass_sport_code) + ')' : ''}` : null,
            a.attestation_caf_ce ? 'Attestation CAF/CE demandée' : null,
            a.numero_passeport ? 'Passeport ' + esc(a.numero_passeport) : null
        ].filter(Boolean);

        const photoBtn = a.photo_path
            ? `<button type="button" data-photo="${esc(a.photo_path)}" class="text-csb-corail text-xs font-bold hover:underline">Voir la photo</button>`
            : '<span class="text-xs text-gray-400">Pas de photo</span>';

        return `
            <div class="bg-white rounded-xl border border-csb-tatami p-4">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                        <span class="font-semibold text-csb-encre">${esc(a.prenom)} ${esc(a.nom)}</span>
                        <span class="text-xs text-gray-400 ml-2">${esc(COURS_LABEL[a.cours_type] || '—')}${age !== null ? ' · ' + age + ' ans' : ''}</span>
                    </div>
                    ${badgeStatut(a.statut_dossier)}
                </div>
                <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-2">${checks}</div>
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-csb-tatami/60">
                    <span class="text-xs text-gray-500" data-docs-summary="${a.id}">${nbOk}/${applicable.length} pièce${applicable.length > 1 ? 's' : ''} validée${nbOk > 1 ? 's' : ''}</span>
                    ${photoBtn}
                </div>
                ${infos.length ? `<p class="text-[11px] text-gray-400 mt-2">${infos.join(' · ')}</p>` : ''}
            </div>`;
    }

    function sectionReglement() {
        let inner;
        if (!detailDossiers.length) {
            inner = `
                <div class="bg-white rounded-xl border border-csb-tatami p-4 text-sm text-gray-600">
                    Aucun dossier d'inscription pour cette famille.
                    <button type="button" data-create-dossier class="ml-2 text-csb-corail font-bold hover:underline">Créer le dossier (tarif auto)</button>
                </div>`;
        } else {
            inner = detailDossiers.map(dossierBlock).join('');
        }
        return `
            <section>
                <h3 class="font-condensed text-lg uppercase tracking-wider text-csb-encre mb-3">Règlement</h3>
                ${inner}
            </section>`;
    }

    function dossierBlock(d) {
        const pays = detailPaiements.filter(p => p.dossier_id === d.id);
        const enc = pays.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
        const du = d.montant_total || 0;
        const reste = Math.max(0, du - enc);
        const pct = du > 0 ? Math.min(100, Math.round(enc / du * 100)) : 0;
        const fullyPaid = du > 0 && enc >= du;

        const rows = pays.length ? pays.map(paymentRow).join('') :
            '<tr><td colspan="5" class="px-3 py-4 text-center text-gray-400 text-sm">Aucun règlement enregistré.</td></tr>';
        const modeOpts = Object.keys(MODE_LABEL).map(k => `<option value="${k}">${MODE_LABEL[k]}</option>`).join('');

        const banner = fullyPaid
            ? `<div class="rounded-lg bg-green-50 border border-green-300 text-green-800 text-sm px-3 py-2 mt-3">✔ Dossier réglé — attestation CE/CAF déblocable (génération PDF en Phase 4).</div>`
            : `<div class="rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm px-3 py-2 mt-3">⚠ Attestation CE/CAF bloquée tant que le règlement n'est pas complet (reste ${fmt(reste)}).</div>`;

        return `
            <div class="bg-white rounded-xl border border-csb-tatami p-4">
                <div class="flex flex-wrap items-end justify-between gap-2 mb-1">
                    <div>
                        <span class="font-condensed uppercase tracking-wider text-xs text-gray-400">Saison ${esc(d.saison || '—')}</span>
                        <p class="text-csb-encre"><span class="font-bold text-lg">${fmt(enc)}</span> encaissé sur <span class="font-bold">${fmt(du)}</span></p>
                    </div>
                    <span class="text-sm font-semibold ${fullyPaid ? 'text-green-700' : 'text-amber-700'}">${fullyPaid ? 'Réglé' : 'Reste ' + fmt(reste)}</span>
                </div>
                <div class="h-2 rounded-full bg-csb-tatami overflow-hidden mb-4">
                    <div class="h-full ${fullyPaid ? 'bg-green-500' : 'bg-csb-corail'}" style="width:${pct}%"></div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-csb-tatami">
                                <th class="px-3 py-2 font-semibold">Montant</th>
                                <th class="px-3 py-2 font-semibold">Mode</th>
                                <th class="px-3 py-2 font-semibold text-center">Encaissé</th>
                                <th class="px-3 py-2 font-semibold">Date</th>
                                <th class="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>

                <!-- Ajout d'un règlement -->
                <div data-add-form class="flex flex-wrap items-end gap-2 mt-4 pt-4 border-t border-csb-tatami/60">
                    <div>
                        <label class="lbl">Montant (€)</label>
                        <input type="text" inputmode="decimal" data-pay-montant placeholder="${esc((du / 100).toString().replace('.', ','))}" class="inp w-28">
                    </div>
                    <div>
                        <label class="lbl">Mode</label>
                        <select data-pay-mode class="inp">${modeOpts}</select>
                    </div>
                    <div>
                        <label class="lbl">N° chèque</label>
                        <input type="text" data-pay-cheque placeholder="(si chèque)" class="inp w-32">
                    </div>
                    <label class="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                        <input type="checkbox" data-pay-encaisse class="chk" checked>
                        <span>Encaissé</span>
                    </label>
                    <button type="button" data-pay-add data-dossier-id="${d.id}"
                            class="px-5 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-corail transition text-sm">
                        + Ajouter
                    </button>
                </div>
                <p class="text-[11px] text-gray-400 mt-2">Chèques à l'ordre de <strong>CSB Karaté</strong> · 3× max · encaissement mensuel.</p>
                ${banner}
            </div>`;
    }

    function paymentRow(p) {
        const num = p.mode === 'cheque' && p.numero_cheque ? ` <span class="text-gray-400">n°${esc(p.numero_cheque)}</span>` : '';
        const date = p.date_encaissement ? new Date(p.date_encaissement).toLocaleDateString('fr-FR') : '—';
        return `
            <tr data-pay-id="${p.id}" class="border-b border-csb-tatami/40">
                <td class="px-3 py-2 font-semibold text-csb-encre whitespace-nowrap">${fmt(p.montant)}</td>
                <td class="px-3 py-2 whitespace-nowrap">${esc(MODE_LABEL[p.mode] || p.mode)}${num}</td>
                <td class="px-3 py-2 text-center"><input type="checkbox" data-pay-toggle class="chk mx-auto" ${p.encaisse ? 'checked' : ''}></td>
                <td class="px-3 py-2 whitespace-nowrap text-gray-500">${esc(date)}</td>
                <td class="px-3 py-2 text-right"><button type="button" data-pay-delete class="text-csb-corail font-bold hover:underline">Suppr.</button></td>
            </tr>`;
    }

    // =========================================================
    // Interactions de la modale (délégation)
    // =========================================================
    detailBody.addEventListener('change', (e) => {
        const docChk = e.target.closest('[data-doc-key]');
        if (docChk) return toggleDocument(docChk);
        const payToggle = e.target.closest('[data-pay-toggle]');
        if (payToggle) return togglePaymentEncaisse(payToggle);
    });

    detailBody.addEventListener('click', (e) => {
        const photoBtn = e.target.closest('[data-photo]');
        if (photoBtn) return openPhoto(photoBtn.dataset.photo);
        const addBtn = e.target.closest('[data-pay-add]');
        if (addBtn) return addPayment(addBtn);
        const delBtn = e.target.closest('[data-pay-delete]');
        if (delBtn) return deletePayment(delBtn);
        const createBtn = e.target.closest('[data-create-dossier]');
        if (createBtn) return createDossier(createBtn);
    });

    // --- Validation manuelle d'une pièce (jsonb, sans re-render : garde le scroll) ---
    async function toggleDocument(chk) {
        const id = Number(chk.dataset.adherentId);
        const key = chk.dataset.docKey;
        const a = detailAdherents.find(x => x.id === id);
        if (!a) return;
        const documents = Object.assign({}, a.documents || {}, { [key]: chk.checked });
        chk.disabled = true;
        const { error } = await sb.from('adherents').update({ documents }).eq('id', id);
        chk.disabled = false;
        if (error) {
            console.error(error);
            chk.checked = !chk.checked;
            alert("Échec de l'enregistrement : " + error.message);
            return;
        }
        a.documents = documents;
        const age = ageOf(a.date_naissance);
        const applicable = DOCUMENTS.filter(d => !d.minorOnly || (age !== null && age < 18));
        const nbOk = applicable.filter(d => documents[d.key]).length;
        const sum = detailBody.querySelector(`[data-docs-summary="${id}"]`);
        if (sum) sum.textContent = `${nbOk}/${applicable.length} pièce${applicable.length > 1 ? 's' : ''} validée${nbOk > 1 ? 's' : ''}`;
    }

    // --- Photo (bucket privé) : URL signée à la demande ---
    async function openPhoto(path) {
        const { data, error } = await sb.storage.from('dossiers').createSignedUrl(path, 120);
        if (error || !data) { alert('Photo introuvable : ' + (error ? error.message : 'lien indisponible')); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
    }

    // --- Paiements : ajout / encaissement / suppression (bureau uniquement, RLS) ---
    async function addPayment(btn) {
        const dossierId = Number(btn.dataset.dossierId);
        const form = btn.closest('[data-add-form]');
        const montant = eurosToCents(form.querySelector('[data-pay-montant]').value);
        const mode = form.querySelector('[data-pay-mode]').value;
        const numero = form.querySelector('[data-pay-cheque]').value.trim();
        const encaisse = form.querySelector('[data-pay-encaisse]').checked;
        if (montant === null || montant === 0) { alert('Saisissez un montant valide (en euros).'); return; }

        btn.disabled = true;
        const { data, error } = await sb.from('paiements').insert({
            dossier_id: dossierId,
            montant,
            mode,
            numero_cheque: mode === 'cheque' ? numero : '',
            encaisse,
            date_encaissement: encaisse ? todayISO() : null
        }).select().single();
        btn.disabled = false;
        if (error) { console.error(error); alert('Échec : ' + error.message); return; }
        detailPaiements.push(data);
        detailDirty = true;
        await refreshStatuts();
        renderDetail();
    }

    async function togglePaymentEncaisse(chk) {
        const id = Number(chk.closest('[data-pay-id]').dataset.payId);
        const p = detailPaiements.find(x => x.id === id);
        if (!p) return;
        const encaisse = chk.checked;
        const date_encaissement = encaisse ? (p.date_encaissement || todayISO()) : null;
        chk.disabled = true;
        const { error } = await sb.from('paiements').update({ encaisse, date_encaissement }).eq('id', id);
        chk.disabled = false;
        if (error) { console.error(error); chk.checked = !encaisse; alert('Échec : ' + error.message); return; }
        p.encaisse = encaisse;
        p.date_encaissement = date_encaissement;
        detailDirty = true;
        await refreshStatuts();
        renderDetail();
    }

    async function deletePayment(btn) {
        const id = Number(btn.closest('[data-pay-id]').dataset.payId);
        const p = detailPaiements.find(x => x.id === id);
        if (!p) return;
        if (!confirm(`Supprimer ce règlement de ${fmt(p.montant)} ?`)) return;
        const { error } = await sb.from('paiements').delete().eq('id', id);
        if (error) { alert('Échec : ' + error.message); return; }
        detailPaiements = detailPaiements.filter(x => x.id !== id);
        detailDirty = true;
        await refreshStatuts();
        renderDetail();
    }

    function todayISO() { return new Date().toISOString().slice(0, 10); }

    // --- Bascule de statut dérivée du règlement ---
    // Dossier : attente_paiement / paye_partiel / valide (selon l'encaissé).
    // Adhérents : « Validé » dès que la famille a tout réglé ; sinon retour à
    // « Attente paiement » s'ils étaient validés (les « Incomplet » ne sont pas
    // touchés, sauf passage à « Validé » quand tout est réglé).
    async function refreshStatuts() {
        for (const d of detailDossiers) {
            const enc = detailPaiements.filter(p => p.dossier_id === d.id && p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
            const st = enc <= 0 ? 'attente_paiement' : (d.montant_total > 0 && enc >= d.montant_total ? 'valide' : 'paye_partiel');
            if (st !== d.statut) {
                const { error } = await sb.from('dossiers').update({ statut: st }).eq('id', d.id);
                if (!error) d.statut = st;
            }
        }
        const totalDu = detailDossiers.reduce((s, d) => s + (d.montant_total || 0), 0);
        const totalEnc = detailPaiements.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
        const paid = totalDu > 0 && totalEnc >= totalDu;
        for (const a of detailAdherents) {
            let next = null;
            if (paid && a.statut_dossier !== 'Validé') next = 'Validé';
            else if (!paid && a.statut_dossier === 'Validé') next = 'Attente paiement';
            if (!next) continue;
            const { error } = await sb.from('adherents').update({ statut_dossier: next }).eq('id', a.id);
            if (!error) {
                a.statut_dossier = next;
                const cached = adherents.find(x => x.id === a.id); // garde la liste principale cohérente
                if (cached) cached.statut_dossier = next;
            }
        }
    }

    // --- Création d'un dossier manquant (ex. adhérent ajouté à la main) ---
    async function createDossier(btn) {
        if (!detailAdherents.length) { alert('Aucun adhérent : impossible de créer un dossier.'); return; }
        const cfg = await loadTarifConfig();
        const liste = detailAdherents.map(a => ({
            prenom: a.prenom,
            coursType: a.cours_type,
            membreBureau: a.membre_bureau,
            passSport: a.pass_sport
        }));
        const detail = CSBTarifs.computeTarif(liste, cfg);
        if (!confirm(`Créer le dossier ${SAISON} pour cette famille ?\nTotal calculé : ${fmt(detail.total)}`)) return;
        btn.disabled = true;
        const { data, error } = await sb.from('dossiers').insert({
            famille_id: detailFamille.id,
            saison: SAISON,
            montant_total: detail.total,
            detail_calcul: Object.assign({}, detail, { modePaiement: 'au_club', source: 'bureau' }),
            mode_paiement: 'au_club',
            statut: 'attente_paiement'
        }).select().single();
        btn.disabled = false;
        if (error) { console.error(error); alert('Échec : ' + error.message); return; }
        detailDossiers.push(data);
        detailDirty = true;
        renderDetail();
    }

    // --- Démarrage ---
    boot_init();
});
