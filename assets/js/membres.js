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

    // Notification email non bloquante (Edge Function `notify`).
    async function notify(body) {
        try { await sb.functions.invoke('notify', { body }); }
        catch (err) { console.warn('[notify] non envoyé :', err && err.message); }
    }

    // Validation bureau (axe explicite : décision d'acceptation par adhérent,
    // distinct du statut combiné pièces × règlement).
    const VALIDATION_BADGE = {
        accepte:    ['Accepté',    'bg-green-50 text-green-700 border-green-300'],
        refuse:     ['Refusé',     'bg-red-50 text-red-700 border-red-300'],
        en_attente: ['En attente', 'bg-amber-50 text-amber-700 border-amber-300']
    };
    function badgeValidation(v) {
        const [txt, cls] = VALIDATION_BADGE[v] || VALIDATION_BADGE.en_attente;
        return `<span class="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}">${txt}</span>`;
    }

    // --- Listes de référence ---
    // Le statut de dossier (Incomplet / En attente paiement / En attente
    // justificatifs / Validé — migration 0010) n'est PAS une liste éditable :
    // il est CALCULÉ (cf. computeDossierStatus), à partir des pièces (par
    // adhérent) et du règlement (par dossier).
    const GRADES = [
        'Ceinture Blanche', 'Ceinture Jaune', 'Ceinture Orange', 'Ceinture Verte',
        'Ceinture Bleue', 'Ceinture Marron', '1er Dan', '2e Dan', '3e Dan', '4e Dan', '5e Dan'
    ];
    const COURS_LABEL = { 'Baby': 'Baby Karaté', 'Enfant': 'Enfant', 'Adulte': 'Adulte', 'Self-Defense': 'Self-défense' };

    // --- Éléments ---
    const boot = $('#boot');
    const gate = $('#gate');
    const dashboard = $('#dashboard');
    const gateEmail = $('#gate-email');
    const gatePwd = $('#gate-pwd');
    const gateBtn = $('#gate-btn');
    const gateError = $('#gate-error');
    const gateInfo = $('#gate-info');
    const gateForgot = $('#gate-forgot');
    const resetPwdSection = $('#reset-pwd-section');
    const resetPwd = $('#reset-pwd');
    const resetPwdConfirm = $('#reset-pwd-confirm');
    const resetPwdBtn = $('#reset-pwd-btn');
    const resetPwdError = $('#reset-pwd-error');
    const resetPwdSuccess = $('#reset-pwd-success');
    const statsEl = $('#stats');
    const rowsEl = $('#rows');
    const countEl = $('#count');
    const fSearch = $('#f-search');
    const fCours = $('#f-cours');
    const fStatut = $('#f-statut');
    const btnExport = $('#btn-export');
    const btnDeleteSelected = $('#btn-delete-selected');
    const btnDeleteLabel = $('#btn-delete-label');
    const selectAllChk = $('#select-all');
    const rolesRowsEl = $('#roles-rows');

    // --- Rôles (alignés sur le CHECK de la migration 0006) ---
    const ROLE_RANK = { bureau: 0, enseignant: 1, adherent: 2 };

    // --- État ---
    let adherents = [];
    let dossiers = [];
    let paiements = [];
    let profiles = [];
    let currentUserId = null;
    // Agrégats par famille, recalculés à chaque chargement (cf. buildFamilleIndex) :
    let familleAgg = {};        // famille_id -> { du, encaisse } (centimes)
    let familleStatusMap = {};  // famille_id -> statut dossier combiné (dérivé)

    // --- Pagination ---
    let currentPage = 1;
    let rowsPerPage = 50;
    const pageSizeSelect = $('#rows-per-page');
    const pageControls = $('#page-controls');

    // --- Sélection multiple ---
    let selectedIds = new Set();

    // =========================================================
    // Authentification (gate bureau)
    // =========================================================
    async function isBureau() {
        try {
            // Valider/rafraîchir le token avant de requêter profiles
            // (indispensable après une promotion de rôle par un autre admin).
            await sb.auth.getSession();
        } catch (_) { /* session expirée, on continue pour avoir un message clair */ }
        const { data: { user }, error: userErr } = await sb.auth.getUser();
        if (userErr || !user) {
            if (userErr) console.error('[isBureau] getUser error:', userErr);
            return false;
        }
        currentUserId = user.id;
        // Vérification du rôle via la table profiles (source de vérité).
        // Le RLS « profiles_select » autorise la lecture de sa propre ligne
        // (user_id = auth.uid()), donc même un adhérent peut lire son rôle.
        const { data, error } = await sb.from('profiles')
            .select('role').eq('user_id', user.id).maybeSingle();
        if (error) {
            console.error('[isBureau] profiles query error:', error);
            return false;
        }
        if (!data) {
            console.warn('[isBureau] aucun profil trouvé pour user_id=', user.id, '→ tentative création automatique');
            // Le compte Auth existe mais le trigger handle_new_user n'a jamais
            // créé la ligne profiles (migration 0006/0008 installée après coup).
            // On appelle la RPC SECURITY DEFINER ensure_profile() qui crée la
            // ligne avec role='adherent' si elle n'existe pas encore.
            const { data: rpcRole, error: rpcErr } = await sb.rpc('ensure_profile');
            if (rpcErr) {
                console.error('[isBureau] ensure_profile RPC error:', rpcErr);
                return false;
            }
            console.log('[isBureau] profil créé automatiquement, role=', rpcRole);
            return rpcRole === 'bureau';
        }
        console.log('[isBureau] role=', data.role, 'pour', user.email);
        return data.role === 'bureau';
    }

    async function boot_init() {
        // Priorité 1 : flux de réinitialisation de mot de passe
        if (await checkRecoveryFlow()) return;
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
        gateInfo.classList.add('hidden');
        gateBtn.disabled = true;
        gateBtn.textContent = 'Connexion…';
        try {
            const { error } = await sb.auth.signInWithPassword({
                email: gateEmail.value.trim(),
                password: gatePwd.value
            });
            if (error) throw error;
            if (!await isBureau()) {
                await sb.auth.signOut();
                throw new Error("Ce compte n'a pas les droits « Administrateur ». Si votre rôle vient d'être modifié, déconnectez-vous puis reconnectez-vous.");
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
            gateBtn.textContent = 'Se connecter';
        }
    }

    gateBtn.addEventListener('click', login);
    gatePwd.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

    // --- Mot de passe oublié ---
    gateForgot && gateForgot.addEventListener('click', async () => {
        const email = gateEmail.value.trim();
        gateError.classList.add('hidden');
        gateInfo.classList.add('hidden');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            gateError.textContent = "Saisissez d'abord votre email ci-dessus.";
            gateError.classList.remove('hidden');
            return;
        }
        gateForgot.disabled = true;
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });
        gateForgot.disabled = false;
        if (error) {
            gateError.textContent = error.message;
            gateError.classList.remove('hidden');
            return;
        }
        gateInfo.textContent = 'Un email de réinitialisation vous a été envoyé. Vérifiez vos spams.';
        gateInfo.classList.remove('hidden');
    });

    // --- Réinitialisation du mot de passe (après clic lien email) ---
    async function checkRecoveryFlow() {
        const hash = window.location.hash;
        if (!hash || !hash.includes('type=recovery')) return false;
        // Supabase JS a déjà consommé le hash → la session est prête
        boot.classList.add('hidden');
        gate.classList.add('hidden');
        dashboard.classList.add('hidden');
        resetPwdSection.classList.remove('hidden');
        resetPwd.focus();
        return true;
    }

    resetPwdBtn && resetPwdBtn.addEventListener('click', async () => {
        resetPwdError.classList.add('hidden');
        resetPwdSuccess.classList.add('hidden');
        const pwd = resetPwd.value;
        if (pwd.length < 8) {
            resetPwdError.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
            resetPwdError.classList.remove('hidden');
            return;
        }
        if (pwd !== resetPwdConfirm.value) {
            resetPwdError.textContent = 'Les deux mots de passe ne correspondent pas.';
            resetPwdError.classList.remove('hidden');
            return;
        }
        resetPwdBtn.disabled = true;
        resetPwdBtn.textContent = 'Enregistrement…';
        try {
            const { error } = await sb.auth.updateUser({ password: pwd });
            if (error) throw error;
            resetPwdSuccess.textContent = 'Mot de passe modifié avec succès. Redirection…';
            resetPwdSuccess.classList.remove('hidden');
            resetPwdSection.classList.add('hidden');
            window.location.hash = '';
            setTimeout(async () => {
                if (await isBureau()) showDashboard(); else showGate();
            }, 1500);
        } catch (err) {
            console.error(err);
            resetPwdError.textContent = err.message || 'Échec de la mise à jour. Le lien a peut-être expiré.';
            resetPwdError.classList.remove('hidden');
        } finally {
            resetPwdBtn.disabled = false;
            resetPwdBtn.textContent = 'Enregistrer le mot de passe';
        }
    });

    resetPwdConfirm && resetPwdConfirm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') resetPwdBtn.click();
    });

    $('#btn-logout').addEventListener('click', async () => {
        await sb.auth.signOut();
        location.reload();
    });
    $('#btn-refresh').addEventListener('click', loadAll);

    // =========================================================
    // Chargement des données (le bureau voit tout via RLS)
    // =========================================================
    async function loadAll() {
        rowsEl.innerHTML = '<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">Chargement…</td></tr>';
        const [aRes, dRes, pRes, prRes] = await Promise.all([
            sb.from('adherents')
                .select('id, prenom, nom, date_naissance, genre, cours_type, grade_actuel, statut_dossier, statut_validation, is_new, membre_bureau, documents, famille_id, familles(nom_referent, ville, email)')
                .order('nom', { ascending: true }),
            sb.from('dossiers').select('id, famille_id, montant_total, statut'),
            sb.from('paiements').select('dossier_id, montant, encaisse'),
            sb.from('profiles').select('user_id, email, role')
        ]);

        if (aRes.error) {
            console.error(aRes.error);
            rowsEl.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-csb-corail">Erreur de chargement : ${esc(aRes.error.message)}</td></tr>`;
            return;
        }
        adherents = aRes.data || [];
        dossiers = dRes.data || [];
        paiements = pRes.data || [];
        profiles = prRes.data || [];
        buildFamilleIndex();
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
        const nbBureau = adherents.filter(a => a.membre_bureau).length;
        const totalDu = dossiers.reduce((s, d) => s + (d.montant_total || 0), 0);
        const encaisse = paiements.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
        // Statut par dossier (= par famille), pas par adhérent.
        const statuses = Object.values(familleStatusMap);
        const byDossier = (s) => statuses.filter(v => v === s).length;

        statsEl.innerHTML = [
            statCard('Adhérents', total,
                `${byCours('Baby')} baby · ${byCours('Enfant')} enfants · ${byCours('Adulte')} adultes · ${byCours('Self-Defense')} self`, 'encre'),
            statCard('Dossiers validés', byDossier('Validé'),
                `${byDossier('En attente paiement')} att. paiement · ${byDossier('En attente justificatifs')} att. justif · ${byDossier('Incomplet')} incomplets`, 'green'),
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
    [fSearch, fCours, fStatut].forEach(el => el.addEventListener('input', () => { currentPage = 1; renderRows(); }));
    pageSizeSelect && pageSizeSelect.addEventListener('change', () => {
        rowsPerPage = parseInt(pageSizeSelect.value, 10) || 50;
        currentPage = 1;
        renderRows();
    });

    function filtered() {
        const q = fSearch.value.trim().toLowerCase();
        const c = fCours.value;
        const s = fStatut.value;
        return adherents.filter(a => {
            if (c && a.cours_type !== c) return false;
            if (s && statutOf(a) !== s) return false;
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

    btnExport.addEventListener('click', () => {
        const rows = filtered();
        if (!rows.length) { alert('Aucun adhérent à exporter.'); return; }

        const head = ['Nom', 'Prénom', 'Date Naissance', 'Âge', 'Genre', 'Cours', 'Grade', 'Bureau', 'Email Famille', 'Téléphone Urgence', 'Référent', 'Statut Dossier'];
        const csvRows = [head.join(';')];

        for (const a of rows) {
            const row = [
                a.nom,
                a.prenom,
                a.date_naissance ? new Date(a.date_naissance).toLocaleDateString('fr-FR') : '',
                ageOf(a.date_naissance) ?? '',
                a.genre || '',
                a.cours_type || '',
                a.grade_actuel || '',
                a.membre_bureau ? 'Oui' : 'Non',
                a.familles?.email || '',
                a.familles?.telephone_urgence || '',
                a.familles?.nom_referent || '',
                statutOf(a) || ''
            ].map(v => {
                const s = String(v).replace(/"/g, '""');
                return /[;\n"]/.test(s) ? `"${s}"` : s;
            });
            csvRows.push(row.join(';'));
        }

        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM for Excel
        const blob = new Blob([bom, csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `csb-adherents-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });

    // =========================================================
    // Statut de dossier — dérivation (pièces justificatives × règlement)
    // =========================================================
    // Pièces OK pour UN adhérent : toutes les pièces requises validées
    // (les pièces `minorOnly` ne comptent que pour les mineurs).
    function justifComplete(a) {
        const age = ageOf(a.date_naissance);
        const isMinor = age !== null && age < 18;
        const docs = (a && a.documents && typeof a.documents === 'object') ? a.documents : {};
        const applicable = DOCUMENTS.filter(d => !d.minorOnly || isMinor);
        return applicable.length > 0 && applicable.every(d => !!docs[d.key]);
    }

    // Statut combiné à partir des deux axes (cf. migration 0010).
    function computeDossierStatus(justifOk, paiementOk) {
        if (justifOk && paiementOk) return 'Validé';
        if (justifOk && !paiementOk) return 'En attente paiement';
        if (!justifOk && paiementOk) return 'En attente justificatifs';
        return 'Incomplet';
    }

    // Recalcule les agrégats par famille (montant dû / encaissé) + le statut
    // combiné de chaque famille, depuis les données chargées.
    function buildFamilleIndex() {
        familleAgg = {};
        familleStatusMap = {};
        const dossierToFamille = {};
        dossiers.forEach(d => {
            dossierToFamille[d.id] = d.famille_id;
            const agg = familleAgg[d.famille_id] || (familleAgg[d.famille_id] = { du: 0, encaisse: 0 });
            agg.du += d.montant_total || 0;
        });
        paiements.forEach(p => {
            if (!p.encaisse) return;
            const fid = dossierToFamille[p.dossier_id];
            if (fid == null) return;
            const agg = familleAgg[fid] || (familleAgg[fid] = { du: 0, encaisse: 0 });
            agg.encaisse += p.montant || 0;
        });
        const parFamille = {};
        adherents.forEach(a => (parFamille[a.famille_id] = parFamille[a.famille_id] || []).push(a));
        Object.keys(parFamille).forEach(fid => {
            const liste = parFamille[fid];
            const justifOk = liste.length > 0 && liste.every(justifComplete);
            const agg = familleAgg[fid] || { du: 0, encaisse: 0 };
            const paiementOk = agg.du > 0 && agg.encaisse >= agg.du;
            familleStatusMap[fid] = computeDossierStatus(justifOk, paiementOk);
        });
    }

    // Statut dossier d'un adhérent (calculé), avec repli sur la valeur stockée.
    function statutOf(a) {
        return familleStatusMap[a.famille_id] || a.statut_dossier || 'Incomplet';
    }

    // Couleur d'un badge de statut dossier.
    function statutClass(v) {
        if (v === 'Validé') return 'bg-green-50 text-green-700 border-green-300';
        if (v === 'En attente paiement') return 'bg-amber-50 text-amber-700 border-amber-300';
        if (v === 'En attente justificatifs') return 'bg-blue-50 text-blue-700 border-blue-300';
        if (v === 'Annulé') return 'bg-red-50 text-red-700 border-red-300';
        return 'bg-gray-50 text-gray-500 border-csb-tatami'; // Incomplet
    }

    function renderRows() {
        const list = filtered();
        const totalPages = Math.max(1, Math.ceil(list.length / rowsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * rowsPerPage;
        const page = list.slice(start, start + rowsPerPage);
        // IDs visibles sur cette page (pour le select-all)
        const pageIds = new Set(page.map(a => a.id));

        countEl.textContent = `${list.length} membre${list.length > 1 ? 's' : ''}`;
        if (!list.length) {
            rowsEl.innerHTML = '<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">Aucun membre ne correspond.</td></tr>';
        } else {
            rowsEl.innerHTML = page.map(a => rowHtml(a, selectedIds.has(a.id))).join('');
        }
        // Synchro checkbox « tout sélectionner »
        if (selectAllChk) {
            const pageSelected = page.filter(a => selectedIds.has(a.id));
            selectAllChk.checked = page.length > 0 && pageSelected.length === page.length;
            selectAllChk.indeterminate = pageSelected.length > 0 && pageSelected.length < page.length;
        }
        updateDeleteButton();
        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        if (!pageControls) return;
        if (totalPages <= 1) {
            pageControls.innerHTML = '';
            return;
        }
        let html = '';
        // Bouton précédent
        html += `<button type="button" data-page="${currentPage - 1}" class="px-3 py-1.5 rounded-lg text-sm font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-white transition disabled:opacity-30 disabled:cursor-not-allowed" ${currentPage <= 1 ? 'disabled' : ''}>‹ Préc.</button>`;
        // Pages numérotées (fenêtre glissante autour de currentPage)
        const windowSize = 5;
        let winStart = Math.max(1, currentPage - Math.floor(windowSize / 2));
        let winEnd = Math.min(totalPages, winStart + windowSize - 1);
        if (winEnd - winStart + 1 < windowSize) winStart = Math.max(1, winEnd - windowSize + 1);
        if (winStart > 1) html += `<span class="px-2 text-gray-400">…</span>`;
        for (let p = winStart; p <= winEnd; p++) {
            const active = p === currentPage;
            html += `<button type="button" data-page="${p}" class="px-3 py-1.5 rounded-lg text-sm font-condensed font-bold uppercase tracking-wider transition ${active ? 'bg-csb-corail text-white' : 'border border-csb-tatami text-csb-encre hover:bg-white'}">${p}</button>`;
        }
        if (winEnd < totalPages) html += `<span class="px-2 text-gray-400">…</span>`;
        // Bouton suivant
        html += `<button type="button" data-page="${currentPage + 1}" class="px-3 py-1.5 rounded-lg text-sm font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-white transition disabled:opacity-30 disabled:cursor-not-allowed" ${currentPage >= totalPages ? 'disabled' : ''}>Suiv. ›</button>`;
        pageControls.innerHTML = html;
    }

    // Délégation clics pagination
    pageControls && pageControls.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page]');
        if (!btn || btn.disabled) return;
        const target = parseInt(btn.dataset.page, 10);
        if (!isNaN(target) && target >= 1 && target <= Math.ceil(filtered().length / rowsPerPage)) {
            currentPage = target;
            renderRows();
        }
    });

    // =========================================================
    // Sélection multiple (checkboxes)
    // =========================================================
    // Clic sur une checkbox de ligne
    rowsEl.addEventListener('click', (e) => {
        const chk = e.target.closest('[data-select-row]');
        if (!chk) return;
        const tr = chk.closest('tr');
        if (!tr) return;
        const id = Number(tr.dataset.id);
        if (chk.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        // Re-sync select-all sans re-render complet
        const page = rowsEl.querySelectorAll('tr[data-id]');
        const pageSelected = [...page].filter(r => selectedIds.has(Number(r.dataset.id)));
        if (selectAllChk) {
            selectAllChk.checked = page.length > 0 && pageSelected.length === page.length;
            selectAllChk.indeterminate = pageSelected.length > 0 && pageSelected.length < page.length;
        }
        // Highlight visuel
        tr.classList.toggle('bg-csb-washi/60', chk.checked);
        updateDeleteButton();
    });

    // « Tout sélectionner » (page courante uniquement)
    selectAllChk && selectAllChk.addEventListener('change', () => {
        const page = rowsEl.querySelectorAll('tr[data-id]');
        page.forEach(tr => {
            const id = Number(tr.dataset.id);
            const chk = tr.querySelector('[data-select-row]');
            if (chk) {
                chk.checked = selectAllChk.checked;
                tr.classList.toggle('bg-csb-washi/60', selectAllChk.checked);
                if (selectAllChk.checked) selectedIds.add(id);
                else selectedIds.delete(id);
            }
        });
        updateDeleteButton();
    });

    function updateDeleteButton() {
        if (!btnDeleteSelected) return;
        const count = selectedIds.size;
        if (count > 0) {
            btnDeleteSelected.classList.remove('hidden');
            btnDeleteLabel.textContent = `Supprimer (${count})`;
        } else {
            btnDeleteSelected.classList.add('hidden');
        }
    }

    // =========================================================
    // Suppression des adhérents sélectionnés
    // =========================================================
    btnDeleteSelected && btnDeleteSelected.addEventListener('click', async () => {
        const count = selectedIds.size;
        if (!count) return;
        if (!confirm(`Supprimer définitivement ${count} adhérent${count > 1 ? 's' : ''} ?\n\n⚠️ Cette action est irréversible. Les données (grade, pièces, photo) seront perdues. Le dossier famille et les règlements ne sont PAS supprimés.`)) return;

        btnDeleteSelected.disabled = true;
        btnDeleteLabel.textContent = 'Suppression…';
        const ids = [...selectedIds];
        let failed = 0;
        try {
            // Récupère les chemins Storage AVANT suppression (photo + pièces) pour
            // purger les fichiers : la cascade SQL supprime les lignes, PAS les
            // objets du bucket → sinon fichiers orphelins (quota plan gratuit).
            const paths = [];
            const { data: rows } = await sb.from('adherents').select('photo_path, documents_files').in('id', ids);
            (rows || []).forEach(r => {
                if (r.photo_path) paths.push(r.photo_path);
                if (r.documents_files && typeof r.documents_files === 'object') {
                    Object.values(r.documents_files).forEach(v => { if (v) paths.push(v); });
                }
            });

            // Supression par lots (Supabase accepte les tableaux avec .in())
            const { error } = await sb.from('adherents').delete().in('id', ids);
            if (error) throw error;
            if (paths.length) { sb.storage.from('dossiers').remove(paths).catch(() => {}); } // best-effort

            // Mise à jour du cache local
            adherents = adherents.filter(a => !selectedIds.has(a.id));
            selectedIds.clear();
            updateDeleteButton();
            buildFamilleIndex();
            renderStats();
            renderRows();
            toast(`${ids.length - failed} adhérent${ids.length - failed > 1 ? 's' : ''} supprimé${ids.length - failed > 1 ? 's' : ''}.`);
        } catch (err) {
            console.error(err);
            toast('Échec de la suppression : ' + (err.message || 'Erreur inconnue'), 'error');
        } finally {
            btnDeleteSelected.disabled = false;
            btnDeleteLabel.textContent = 'Supprimer';
        }
    });

    function rowHtml(a, selected = false) {
        const age = ageOf(a.date_naissance);
        const ageTxt = age === null ? '' : `${age} ans`;
        const genre = a.genre === 'M' ? 'H' : (a.genre === 'F' ? 'F' : '');
        const meta = [ageTxt, genre].filter(Boolean).join(' · ');
        const ref = a.familles?.nom_referent || '—';
        const ville = a.familles?.ville || '';

        const gradeOpts = GRADES.map(g => `<option ${g === a.grade_actuel ? 'selected' : ''}>${esc(g)}</option>`).join('');

        return `
            <tr data-id="${a.id}" class="border-t border-csb-tatami/60 hover:bg-csb-washi/40 transition ${selected ? 'bg-csb-washi/60' : ''}">
                <td class="px-4 py-3">
                    <input type="checkbox" data-select-row class="chk" ${selected ? 'checked' : ''}>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-csb-encre flex items-center gap-2 flex-wrap">
                        ${esc(a.prenom)} ${esc(a.nom)}
                        ${a.is_new ? '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-csb-corail text-white">Nouveau</span>' : ''}
                    </div>
                    <div class="text-xs text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span>${esc(meta)}</span>
                        ${badgeValidation(a.statut_validation)}
                    </div>
                </td>
                <td class="px-4 py-3">
                    <div class="text-csb-encre">${esc(ref)}</div>
                    <div class="text-xs text-gray-400">${esc(ville)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">${esc(COURS_LABEL[a.cours_type] || '—')}</td>
                <td class="px-4 py-3">
                    <select data-field="grade_actuel" class="text-sm rounded-lg border border-csb-tatami px-2 py-1.5 bg-white cursor-pointer">${gradeOpts}</select>
                </td>
                <td class="px-4 py-3">${badgeStatut(statutOf(a))}</td>
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
        // Champs encore éditables en ligne : membre_bureau, grade_actuel.
        // (Le statut dossier n'est plus éditable : il est calculé, cf. modale.)
        await saveField(tr, id, field, value);
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
    // le bureau) + règlement (paiements). Le statut de dossier est CALCULÉ à
    // partir de ces deux axes (cf. computeDossierStatus / refreshStatuts), jamais
    // saisi à la main. Modèle : un dossier par famille et par saison.
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
    const lightbox = $('#lightbox');
    const lightboxClose = $('#lightbox-close');

    if (lightbox) {
        const closeLb = () => {
            lightbox.classList.add('opacity-0');
            setTimeout(() => lightbox.classList.add('hidden'), 300);
        };
        if (lightboxClose) lightboxClose.addEventListener('click', closeLb);
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLb();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLb();
        });
    }

    let detailFamille = null;
    let detailAdherents = [];
    let detailDossiers = [];
    let detailPaiements = [];
    let detailFactures = [];
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
        // Source de vérité : saison ACTIVE (tables `saisons` + `cours`, via le
        // helper partagé avec l'inscription en ligne → mêmes prix des deux côtés).
        // Fallback : table `tarifs` legacy, puis DEFAULT_CONFIG.
        const res = await CSBSaisons.loadActive();
        const dyn = res && res.saison ? CSBTarifs.configFromCours(res.cours, res.saison.tarif_licence) : null;
        if (dyn) {
            tarifConfig = Object.assign({}, CSBTarifs.DEFAULT_CONFIG, dyn);
        } else {
            const { data } = await sb.from('tarifs').select('*').eq('saison', SAISON).maybeSingle();
            tarifConfig = data || CSBTarifs.DEFAULT_CONFIG;
        }
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
            const [pRes, facRes] = await Promise.all([
                sb.from('paiements').select('*').in('dossier_id', dossierIds).order('id', { ascending: true }),
                sb.from('factures').select('*').in('dossier_id', dossierIds)
            ]);
            detailPaiements = pRes.error ? [] : (pRes.data || []);
            detailFactures = facRes.error ? [] : (facRes.data || []);
        } else {
            detailPaiements = [];
            detailFactures = [];
        }

        // Pré-chargement des URLs signées (1h) : photo d'identité + pièces
        // téléversées par la famille (documents_files) → liens « Voir » du bureau.
        for (const a of detailAdherents) {
            if (a.photo_path) {
                const { data, error } = await sb.storage.from('dossiers').createSignedUrl(a.photo_path, 3600);
                if (!error && data) a._photo_url = data.signedUrl;
            }
            a._file_urls = {};
            const files = (a.documents_files && typeof a.documents_files === 'object') ? a.documents_files : {};
            for (const key of Object.keys(files)) {
                if (!files[key]) continue;
                const { data, error } = await sb.storage.from('dossiers').createSignedUrl(files[key], 3600);
                if (!error && data) a._file_urls[key] = data.signedUrl;
            }
        }

        // Le dossier est « consulté » → on efface le badge « Nouveau » de ses
        // adhérents (mission : disparition automatique à la 1re ouverture bureau).
        await clearIsNew(familleId);

        renderDetail();
    }

    // Passe is_new à false pour les adhérents de la famille + met à jour la liste.
    async function clearIsNew(familleId) {
        const news = detailAdherents.filter(a => a.is_new);
        if (!news.length) return;
        const { error } = await sb.from('adherents')
            .update({ is_new: false }).eq('famille_id', familleId).eq('is_new', true);
        if (error) { console.warn('[clearIsNew]', error.message); return; }
        news.forEach(a => {
            a.is_new = false;
            const cached = adherents.find(x => x.id === a.id);
            if (cached) cached.is_new = false;
        });
        detailDirty = true; // rafraîchit le tableau (badge retiré) à la fermeture
    }

    // =========================================================
    // Rendu de la modale
    // =========================================================
    function renderDetail() {
        const f = detailFamille;
        detailTitle.textContent = `Famille ${f.nom_referent || '—'}`;
        const adr = [f.adresse, [f.code_postal, f.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        detailSub.textContent = [adr, f.telephone_urgence].filter(Boolean).join(' · ');
        detailBody.innerHTML = sectionSummary() + sectionAdherents() + sectionReglement();
    }

    function badgeStatut(v) {
        return `<span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statutClass(v)}">${esc(v)}</span>`;
    }

    // Résumé : statut combiné + les deux axes (pièces justif. × règlement),
    // pour bien distinguer les deux notions.
    function sectionSummary() {
        const nbJustifOk = detailAdherents.filter(justifComplete).length;
        const justifOk = detailAdherents.length > 0 && nbJustifOk === detailAdherents.length;
        const totalDu = detailDossiers.reduce((s, d) => s + (d.montant_total || 0), 0);
        const totalEnc = detailPaiements.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
        const paiementOk = totalDu > 0 && totalEnc >= totalDu;
        const status = computeDossierStatus(justifOk, paiementOk);
        const axis = (ok, txtOk, txtKo) => `<span class="font-semibold ${ok ? 'text-green-700' : 'text-amber-700'}">${ok ? '✔ ' + txtOk : '✘ ' + txtKo}</span>`;
        return `
            <section class="bg-white rounded-xl border border-csb-tatami p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="font-condensed uppercase tracking-wider text-xs text-gray-400">Statut du dossier</span>
                    ${badgeStatut(status)}
                </div>
                <div class="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
                    <div>Pièces justificatives : ${axis(justifOk, `complètes (${nbJustifOk}/${detailAdherents.length})`, `${nbJustifOk}/${detailAdherents.length} adhérent(s)`)}</div>
                    <div>Règlement : ${axis(paiementOk, `réglé (${fmt(totalEnc)})`, `${fmt(totalEnc)} / ${fmt(totalDu)}`)}</div>
                </div>
            </section>`;
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
        const pieceOk = applicable.length > 0 && nbOk === applicable.length;
        const pieceBadge = `<span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${pieceOk ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-500 border-csb-tatami'}">${pieceOk ? 'Pièces OK' : 'Pièces incomplètes'}</span>`;

        // URL signée du fichier fourni par la famille (photo -> _photo_url ;
        // autres pièces -> _file_urls[key]), pré-calculée dans openDetail.
        const fileUrlFor = (key) => key === 'photo' ? a._photo_url : (a._file_urls && a._file_urls[key]);
        const checks = applicable.map(d => {
            const url = fileUrlFor(d.key);
            return `
            <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" class="chk" data-doc-key="${d.key}" data-adherent-id="${a.id}" ${docs[d.key] ? 'checked' : ''}>
                <span>${esc(d.label)}</span>
                ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="text-xs text-csb-dojo hover:text-csb-corail underline shrink-0">voir</a>` : '<span class="text-[11px] text-gray-300 shrink-0">(non fourni)</span>'}
            </label>`;
        }).join('');

        // Consentements / Pass'Sport saisis à l'inscription — lecture seule.
        const infos = [
            a.droit_image ? "Droit à l'image ✔" : "Droit à l'image ✘",
            a.pass_sport ? `Pass'Sport${a.pass_sport_code ? ' (' + esc(a.pass_sport_code) + ')' : ''}` : null,
            a.attestation_caf_ce ? 'Attestation CAF/CE demandée' : null,
            a.numero_passeport ? 'Passeport ' + esc(a.numero_passeport) : null
        ].filter(Boolean);

        const photoContent = a._photo_url
            ? `<div class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-lg overflow-hidden border border-csb-tatami cursor-pointer shadow-sm hover:ring-2 hover:ring-csb-corail transition" data-photo="${esc(a._photo_url)}" title="Agrandir la photo">
                 <img src="${esc(a._photo_url)}" alt="Photo de ${esc(a.prenom)}" class="w-full h-full object-cover">
               </div>`
            : `<div class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-lg border-2 border-dashed border-csb-tatami bg-gray-50 flex flex-col items-center justify-center text-gray-400" title="Pas de photo">
                 <span class="text-xl font-bold">✕</span>
                 <span class="text-[9px] uppercase mt-1">Aucune</span>
               </div>`;

        return `
            <div class="bg-white rounded-xl border border-csb-tatami p-4 flex flex-col sm:flex-row gap-4">
                ${photoContent}
                <div class="flex-grow">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                            <span class="font-semibold text-csb-encre text-lg">${esc(a.prenom)} ${esc(a.nom)}</span>
                            <span class="text-xs text-gray-400 ml-2">${esc(COURS_LABEL[a.cours_type] || '—')}${age !== null ? ' · ' + age + ' ans' : ''}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap justify-end">
                            ${a.is_new ? '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-csb-corail text-white">Nouveau</span>' : ''}
                            ${badgeValidation(a.statut_validation)}
                            ${pieceBadge}
                        </div>
                    </div>
                    <div class="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-3">${checks}</div>
                    <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-csb-tatami/60">
                        <span class="text-xs text-gray-500" data-docs-summary="${a.id}">${nbOk}/${applicable.length} pièce${applicable.length > 1 ? 's' : ''} validée${nbOk > 1 ? 's' : ''}</span>
                        <div class="flex gap-2">
                            <button type="button" data-validate="${a.id}" data-decision="accepte"
                                    class="px-3 py-1 rounded-full text-xs font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition ${a.statut_validation === 'accepte' ? 'opacity-50' : ''}">Accepter</button>
                            <button type="button" data-validate="${a.id}" data-decision="refuse"
                                    class="px-3 py-1 rounded-full text-xs font-condensed uppercase tracking-wider bg-csb-corail text-white hover:bg-red-700 transition ${a.statut_validation === 'refuse' ? 'opacity-50' : ''}">Refuser</button>
                        </div>
                    </div>
                    ${infos.length ? `<p class="text-[11px] text-gray-400 mt-2">${infos.join(' · ')}</p>` : ''}
                </div>
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

        // Facture : gate volontairement sur le règlement seul (fullyPaid), pas sur le
        // statut combiné pièces×règlement — même logique que l'attestation adhérent.
        const fac = detailFactures.find(f => f.dossier_id === d.id);
        const banner = !fullyPaid
            ? `<div class="rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm px-3 py-2 mt-3">⚠ Attestation CE/CAF et facture bloquées tant que le règlement n'est pas complet (reste ${fmt(reste)}).</div>`
            : `<div class="rounded-lg bg-green-50 border border-green-300 text-green-800 text-sm px-3 py-2 mt-3 flex flex-wrap items-center justify-between gap-2">
                   <span>✔ Dossier réglé${fac ? ` — facture n° ${esc(fac.numero)} émise le ${new Date(fac.emise_le).toLocaleDateString('fr-FR')}.` : ' — attestation CE/CAF déblocable.'}</span>
                   <button type="button" data-facture-btn data-dossier-id="${d.id}"
                           class="px-4 py-1.5 rounded-full font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-encre transition text-xs whitespace-nowrap">
                       ${fac ? '⬇ Télécharger la facture' : '⬇ Éditer la facture'}
                   </button>
               </div>`;

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
        const facBtn = e.target.closest('[data-facture-btn]');
        if (facBtn) return factureAction(facBtn);
        const valBtn = e.target.closest('[data-validate]');
        if (valBtn) return setValidation(valBtn);
    });

    // --- Acceptation / refus d'un adhérent par le bureau (axe validation) ---
    // Met à jour statut_validation puis prévient la famille par email (notify).
    async function setValidation(btn) {
        const id = Number(btn.dataset.validate);
        const decision = btn.dataset.decision; // 'accepte' | 'refuse'
        const a = detailAdherents.find(x => x.id === id);
        if (!a || a.statut_validation === decision) return;

        let note = a.validation_note || '';
        if (decision === 'refuse') {
            const saisie = prompt('Motif du refus (optionnel, communiqué à la famille) :', note);
            if (saisie === null) return; // annulé
            note = saisie.trim();
        } else {
            note = ''; // on nettoie tout ancien motif à l'acceptation
        }

        btn.disabled = true;
        const { error } = await sb.from('adherents')
            .update({ statut_validation: decision, validation_note: note }).eq('id', id);
        btn.disabled = false;
        if (error) { console.error(error); alert('Échec : ' + error.message); return; }

        a.statut_validation = decision;
        a.validation_note = note;
        const cached = adherents.find(x => x.id === id); // garde le tableau principal cohérent
        if (cached) { cached.statut_validation = decision; }
        detailDirty = true;
        renderDetail();
        toast(decision === 'accepte' ? 'Adhérent accepté.' : 'Adhérent refusé.');

        // Email à la famille (non bloquant).
        notify({ type: 'validation', adherent_id: id });
    }

    // --- Facture (document fiscal numéroté) : émission OU téléchargement si déjà émise ---
    // L'émission passe par la RPC `emettre_facture` (SECURITY DEFINER, bureau-only,
    // migration 0013) : numérotation atomique côté base, jamais côté client.
    async function factureAction(btn) {
        const dossierId = Number(btn.dataset.dossierId);
        const existing = detailFactures.find(f => f.dossier_id === dossierId);
        if (existing) return CSBPdf.facture(existing);

        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Émission…';
        try {
            const { data, error } = await sb.rpc('emettre_facture', { p_dossier_id: dossierId });
            if (error) throw error;
            const fac = Array.isArray(data) ? data[0] : data;
            detailFactures.push(fac);
            detailDirty = true;
            await CSBPdf.facture(fac);
            renderDetail();
        } catch (err) {
            console.error(err);
            alert('Facture impossible : ' + (err.message || err));
            btn.disabled = false;
            btn.textContent = original;
        }
    }

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
        // Les pièces influent sur le statut combiné → on recalcule et on re-rend.
        await refreshStatuts();
        renderDetail();
    }

    // --- Photo : Ouverture de la version grand format dans la lightbox ---
    function openPhoto(url) {
        const lb = document.getElementById('lightbox');
        const lbImg = document.getElementById('lightbox-img');
        if (!lb || !lbImg) return;
        lbImg.src = url;
        lb.classList.remove('hidden');
        setTimeout(() => lb.classList.remove('opacity-0'), 10);
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

    // --- Statut combiné dérivé (pièces justificatives × règlement) ---
    // Recalcule le statut de la famille puis le PERSISTE sur ses dossiers et,
    // en miroir, sur chaque adhérent (même statut pour tous les membres — c'est
    // le statut DU DOSSIER). Appelé après tout changement de pièces ou de paiement.
    async function refreshStatuts() {
        const justifOk = detailAdherents.length > 0 && detailAdherents.every(justifComplete);
        const totalDu = detailDossiers.reduce((s, d) => s + (d.montant_total || 0), 0);
        const totalEnc = detailPaiements.filter(p => p.encaisse).reduce((s, p) => s + (p.montant || 0), 0);
        const paiementOk = totalDu > 0 && totalEnc >= totalDu;
        const status = computeDossierStatus(justifOk, paiementOk);

        for (const d of detailDossiers) {
            if (d.statut !== status) {
                const { error } = await sb.from('dossiers').update({ statut: status }).eq('id', d.id);
                if (!error) d.statut = status;
            }
        }
        for (const a of detailAdherents) {
            if (a.statut_dossier === status) continue;
            const { error } = await sb.from('adherents').update({ statut_dossier: status }).eq('id', a.id);
            if (!error) {
                a.statut_dossier = status;
                const cached = adherents.find(x => x.id === a.id); // garde la liste principale cohérente
                if (cached) cached.statut_dossier = status;
            }
        }
        detailDirty = true;
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
            statut: 'Incomplet'
        }).select().single();
        btn.disabled = false;
        if (error) { console.error(error); alert('Échec : ' + error.message); return; }
        detailDossiers.push(data);
        detailDirty = true;
        await refreshStatuts();
        renderDetail();
    }

    // =========================================================
    // ONGLETS (Adhérents / Saisons & Cours)
    // =========================================================
    const tabButtons = document.querySelectorAll('[data-tab]');
    const panels = { adherents: $('#panel-adherents'), administration: $('#panel-administration'), saisons: $('#panel-saisons'), profil: $('#panel-profil') };
    tabButtons.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

    function activateTab(name) {
        Object.entries(panels).forEach(([k, el]) => el && el.classList.toggle('hidden', k !== name));
        tabButtons.forEach(b => {
            const on = b.dataset.tab === name;
            b.classList.toggle('text-csb-corail', on);
            b.classList.toggle('border-csb-corail', on);
            b.classList.toggle('text-gray-400', !on);
            b.classList.toggle('border-transparent', !on);
        });
        if (name === 'saisons' && !saisonsLoaded) loadSaisons();
        if (name === 'profil') renderProfil();
    }

    // =========================================================
    // TOAST — notification temporaire (succès / erreur)
    // =========================================================
    function toast(message, type = 'success') {
        const container = $('#toast-container');
        if (!container) return;
        const bg = type === 'error' ? 'bg-csb-corail' : 'bg-green-600';
        const el = document.createElement('div');
        el.className = `${bg} text-white text-sm px-5 py-3 rounded-xl shadow-lg font-medium transition-all duration-300 opacity-0 translate-y-2`;
        el.textContent = message;
        container.appendChild(el);
        requestAnimationFrame(() => { el.classList.remove('opacity-0', 'translate-y-2'); });
        setTimeout(() => {
            el.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => el.remove(), 300);
        }, 4000);
    }

    // =========================================================
    // PROFIL (onglet « Mon Profil »)
    // =========================================================
    const profilCard = $('#profil-card');
    let profilData = null;

    async function loadProfil() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;
        const { data, error } = await sb.from('profiles')
            .select('prenom, nom, telephone, email').eq('user_id', user.id).maybeSingle();
        if (error || !data) return { prenom: '', nom: '', telephone: '', email: user.email || '' };
        return { prenom: data.prenom || '', nom: data.nom || '', telephone: data.telephone || '', email: data.email || user.email || '' };
    }

    async function renderProfil() {
        if (!profilCard) return;
        profilCard.innerHTML = '<p class="text-gray-400 text-sm py-4">Chargement…</p>';
        profilData = await loadProfil();
        if (!profilData) {
            profilCard.innerHTML = '<p class="text-csb-corail text-sm py-4">Impossible de charger votre profil.</p>';
            return;
        }
        profilCard.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="lbl" for="profil-email">Email (identifiant de connexion)</label>
                    <input id="profil-email" class="inp bg-gray-50 text-gray-500 cursor-not-allowed" value="${esc(profilData.email)}" disabled>
                    <p class="text-[11px] text-gray-400 mt-1">L'email ne peut pas être modifié ici. Contactez le bureau pour un changement.</p>
                </div>
                <div class="grid sm:grid-cols-2 gap-4">
                    <div>
                        <label class="lbl" for="profil-prenom">Prénom</label>
                        <input id="profil-prenom" class="inp" value="${esc(profilData.prenom)}">
                    </div>
                    <div>
                        <label class="lbl" for="profil-nom">Nom</label>
                        <input id="profil-nom" class="inp" value="${esc(profilData.nom)}">
                    </div>
                </div>
                <div>
                    <label class="lbl" for="profil-tel">Téléphone</label>
                    <input id="profil-tel" type="tel" class="inp" value="${esc(profilData.telephone)}">
                </div>
                <div class="pt-3">
                    <button id="profil-save-btn" type="button"
                            class="px-6 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition text-sm shadow-lg">
                        💾 Enregistrer
                    </button>
                    <span id="profil-feedback" class="ml-3 text-sm"></span>
                </div>
            </div>`;

        $('#profil-save-btn').addEventListener('click', saveProfil);
    }

    async function saveProfil() {
        const btn = $('#profil-save-btn');
        const fb = $('#profil-feedback');
        if (!btn) return;
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { toast('Session expirée.', 'error'); return; }
        const prenom = $('#profil-prenom').value.trim();
        const nom = $('#profil-nom').value.trim();
        const telephone = $('#profil-tel').value.trim();
        btn.disabled = true;
        btn.textContent = 'Enregistrement…';
        fb.textContent = '';
        try {
            const { error } = await sb.from('profiles').update({ prenom, nom, telephone }).eq('user_id', user.id);
            if (error) throw error;
            profilData = { ...profilData, prenom, nom, telephone };
            fb.textContent = '✓ Profil enregistré';
            fb.className = 'ml-3 text-sm text-green-600 font-bold';
            toast('Profil mis à jour avec succès.');
            setTimeout(() => { fb.textContent = ''; }, 3000);
        } catch (err) {
            console.error(err);
            fb.textContent = '⚠ ' + (err.message || 'Échec');
            fb.className = 'ml-3 text-sm text-csb-corail font-bold';
            toast('Échec de la mise à jour : ' + (err.message || 'Erreur inconnue'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Enregistrer';
        }
    }

    // =========================================================
    // GESTION DES SAISONS & COURS (onglet bureau) — CRUD complet
    // =========================================================
    // Modèle relationnel `saisons` + `cours` (migration 0016). Lecture publique,
    // écriture bureau (RLS). Remplace l'ancien mode admin unique d'index.html.
    const COURS_TYPE_OPTIONS = [
        { value: '',             label: '— (affichage seul)' },
        { value: 'Baby',         label: 'Baby Karaté' },
        { value: 'Enfant',       label: 'Enfant' },
        { value: 'Adulte',       label: 'Adulte' },
        { value: 'Self-Defense', label: 'Self-défense' }
    ];
    const ACCENT_OPTIONS = [
        { value: 'dojo',   label: 'Couleur standard' },
        { value: 'corail', label: 'Accent corail (mis en avant)' }
    ];

    const saisonsListEl = $('#saisons-list');
    const saisonModal = $('#saison-modal');
    const saisonModalBody = $('#saison-modal-body');
    const saisonModalTitle = $('#saison-modal-title');

    let saisons = [];
    let saisonsLoaded = false;
    let editingSaison = null;   // null = nouvelle saison non encore enregistrée
    let editingCours = [];      // cours en mémoire (source de vérité pendant l'édition)

    function frDateShort(iso) {
        if (!iso) return '…';
        const d = new Date(iso + 'T00:00:00');
        return isNaN(d) ? '…' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Capacité : champ libre -> entier >= 0, ou null (= illimité).
    function parseCapacite(v) {
        const s = String(v ?? '').trim();
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    // --- Chargement de la liste des saisons (+ compte des cours) ---
    async function loadSaisons() {
        if (!saisonsListEl) return;
        saisonsListEl.innerHTML = '<p class="text-gray-400 text-sm col-span-full py-8 text-center">Chargement…</p>';
        const [sRes, cRes] = await Promise.all([
            sb.from('saisons').select('*').order('date_debut', { ascending: false }),
            sb.from('cours').select('saison_id')
        ]);
        if (sRes.error) {
            console.error(sRes.error);
            saisonsListEl.innerHTML = `<p class="text-csb-corail text-sm col-span-full py-8 text-center">Erreur de chargement : ${esc(sRes.error.message)}</p>`;
            return;
        }
        const counts = {};
        (cRes.data || []).forEach(c => { counts[c.saison_id] = (counts[c.saison_id] || 0) + 1; });
        saisons = (sRes.data || []).map(s => Object.assign({}, s, { _nbCours: counts[s.id] || 0 }));
        saisonsLoaded = true;
        renderSaisonsList();
    }

    function renderSaisonsList() {
        if (!saisons.length) {
            saisonsListEl.innerHTML = '<p class="text-gray-400 text-sm col-span-full py-8 text-center">Aucune saison. Créez-en une avec « + Nouvelle saison ».</p>';
            return;
        }
        saisonsListEl.innerHTML = saisons.map(saisonCard).join('');
    }

    function saisonCard(s) {
        const dates = (s.date_debut || s.date_fin) ? `${frDateShort(s.date_debut)} → ${frDateShort(s.date_fin)}` : 'Dates non renseignées';
        const badge = s.active
            ? '<span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-300">Active</span>'
            : '<span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-gray-50 text-gray-500 border-csb-tatami">Archivée</span>';
        return `
            <div class="bg-white rounded-2xl border border-csb-tatami border-t-4 ${s.active ? 'border-t-green-600' : 'border-t-csb-tatami'} p-5 shadow-sm" data-saison-id="${s.id}">
                <div class="flex items-start justify-between gap-2 mb-2">
                    <div>
                        <h3 class="font-condensed text-xl uppercase tracking-wider text-csb-encre">${esc(s.label)}</h3>
                        <p class="text-xs text-gray-400">${esc(dates)}</p>
                    </div>
                    ${badge}
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-4">
                    <span>🥋 ${s._nbCours} cours</span>
                    <span>👥 ${s.nb_licencies || 0} licenciés</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" data-edit-saison class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-corail transition">Éditer / Cours</button>
                    ${s.active ? '' : '<button type="button" data-activate-saison class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-csb-washi transition">Activer</button>'}
                    <button type="button" data-delete-saison class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider text-csb-corail hover:underline ml-auto">Supprimer</button>
                </div>
            </div>`;
    }

    // --- Actions sur la liste (délégation) ---
    const btnNewSaison = $('#btn-new-saison');
    btnNewSaison && btnNewSaison.addEventListener('click', () => openSaisonEditor(null));

    saisonsListEl && saisonsListEl.addEventListener('click', (e) => {
        const card = e.target.closest('[data-saison-id]');
        if (!card) return;
        const id = Number(card.dataset.saisonId);
        if (e.target.closest('[data-edit-saison]')) return openSaisonEditor(id);
        if (e.target.closest('[data-activate-saison]')) return activateSaison(id);
        if (e.target.closest('[data-delete-saison]')) return deleteSaisonById(id);
    });

    async function activateSaison(id) {
        try {
            // Au plus une active (index partiel unique) : on désactive l'ancienne d'abord.
            await sb.from('saisons').update({ active: false }).eq('active', true).neq('id', id);
            const { error } = await sb.from('saisons').update({ active: true }).eq('id', id);
            if (error) throw error;
            tarifConfig = null; // les prix de la saison active ont changé
            await loadSaisons();
        } catch (err) {
            console.error(err);
            alert('Échec de l\'activation : ' + (err.message || err));
        }
    }

    async function deleteSaisonById(id) {
        const s = saisons.find(x => x.id === id);
        if (!s) return;
        const msg = s.active
            ? `Supprimer la saison ACTIVE « ${s.label} » et tous ses cours ?\nLe site n'aura plus de saison active tant que vous n'en activerez pas une autre.\n(Les dossiers d'inscription déjà liés à cette saison ne sont PAS supprimés.)`
            : `Supprimer la saison « ${s.label} » et tous ses cours ?`;
        if (!confirm(msg)) return;
        const { error } = await sb.from('saisons').delete().eq('id', id); // cascade -> cours
        if (error) { alert('Échec : ' + error.message); return; }
        await loadSaisons();
    }

    // --- Modale d'édition (saison + cours) ---
    function openSaisonModal() { saisonModal.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); }
    function closeSaisonModal() { saisonModal.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); }

    async function openSaisonEditor(saisonId) {
        if (saisonId) {
            editingSaison = saisons.find(s => s.id === saisonId) || null;
            const { data, error } = await sb.from('cours').select('*').eq('saison_id', saisonId).order('position', { ascending: true });
            editingCours = error ? [] : (data || []).map(cloneCours);
        } else {
            editingSaison = null;
            editingCours = [];
        }
        saisonModalTitle.textContent = editingSaison ? `Saison ${editingSaison.label}` : 'Nouvelle saison';
        openSaisonModal();
        renderSaisonEditor();
    }

    function cloneCours(c) {
        return {
            cours_type: c.cours_type || '', libelle: c.libelle || '', professeur: c.professeur || '',
            capacite_max: c.capacite_max, jours: c.jours || '', heures: c.heures || '',
            lieu: c.lieu || '', accent: c.accent || 'dojo', prix: c.prix
        };
    }

    function renderSaisonEditor() {
        const s = editingSaison || { label: '', date_debut: '', date_fin: '', active: false, tarif_licence: 3700, nb_licencies: 0, tarifs_note: '', licence_note: '' };
        const lic = ((s.tarif_licence ?? 3700) / 100);
        saisonModalBody.innerHTML = `
            <section class="bg-white rounded-xl border border-csb-tatami p-4">
                <h3 class="font-condensed text-lg uppercase tracking-wider text-csb-encre mb-3">Informations</h3>
                <div class="grid sm:grid-cols-2 gap-3">
                    <div>
                        <label class="lbl" for="s-label">Libellé *</label>
                        <input id="s-label" class="inp" value="${esc(s.label || '')}" placeholder="2027-2028">
                    </div>
                    <label class="flex items-center gap-2 text-sm sm:pt-6 cursor-pointer">
                        <input type="checkbox" id="s-active" class="chk" ${s.active ? 'checked' : ''}>
                        <span>Saison active (affichée sur le site public)</span>
                    </label>
                    <div>
                        <label class="lbl" for="s-debut">Début</label>
                        <input type="date" id="s-debut" class="inp" value="${s.date_debut || ''}">
                    </div>
                    <div>
                        <label class="lbl" for="s-fin">Fin</label>
                        <input type="date" id="s-fin" class="inp" value="${s.date_fin || ''}">
                    </div>
                    <div>
                        <label class="lbl" for="s-licence">Tarif licence FFK (€)</label>
                        <input id="s-licence" class="inp" inputmode="decimal" value="${lic}">
                    </div>
                    <div>
                        <label class="lbl" for="s-nb">Nombre de licenciés (page club)</label>
                        <input id="s-nb" class="inp" inputmode="numeric" value="${s.nb_licencies ?? 0}">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="lbl" for="s-tnote">Note « remises familles »</label>
                        <textarea id="s-tnote" rows="2" class="inp">${esc(s.tarifs_note || '')}</textarea>
                    </div>
                    <div class="sm:col-span-2">
                        <label class="lbl" for="s-lnote">Note « licence FFK »</label>
                        <input id="s-lnote" class="inp" value="${esc(s.licence_note || '')}">
                    </div>
                </div>
            </section>

            <section>
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-condensed text-lg uppercase tracking-wider text-csb-encre">Cours (<span id="cours-count">${editingCours.length}</span>)</h3>
                    <button type="button" id="btn-add-cours" class="px-4 py-1.5 rounded-full text-sm font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-corail transition">+ Ajouter un cours</button>
                </div>
                <div id="cours-list" class="space-y-3"></div>
            </section>

            <div class="flex flex-wrap justify-end gap-3 pt-2">
                <button type="button" data-saison-close class="px-6 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-gray-200 text-csb-encre hover:bg-gray-300 transition text-sm">Annuler</button>
                <button type="button" id="btn-save-saison" class="px-6 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition text-sm shadow-lg">💾 Enregistrer</button>
            </div>`;
        renderCoursList();
    }

    function renderCoursList() {
        const list = saisonModalBody.querySelector('#cours-list');
        if (!list) return;
        list.innerHTML = editingCours.length
            ? editingCours.map(coursRow).join('')
            : '<p class="text-sm text-gray-400">Aucun cours. Ajoutez-en un avec « + Ajouter un cours ».</p>';
    }

    function updateCoursCount() {
        const c = saisonModalBody.querySelector('#cours-count');
        if (c) c.textContent = editingCours.length;
    }

    function coursRow(c, i) {
        const typeOpts = COURS_TYPE_OPTIONS.map(o => `<option value="${o.value}" ${(c.cours_type || '') === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
        const accentOpts = ACCENT_OPTIONS.map(o => `<option value="${o.value}" ${(c.accent || 'dojo') === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
        const prix = (c.prix != null && c.prix !== '') ? (c.prix / 100) : '';
        const cap = (c.capacite_max != null && c.capacite_max !== '') ? c.capacite_max : '';
        return `
            <div data-cours-row data-i="${i}" class="bg-white rounded-xl border border-csb-tatami p-4 grid sm:grid-cols-2 gap-3">
                <div>
                    <label class="lbl">Type (calcul d'inscription)</label>
                    <select data-k="cours_type" class="inp">${typeOpts}</select>
                </div>
                <div>
                    <label class="lbl">Libellé</label>
                    <input data-k="libelle" class="inp" value="${esc(c.libelle || '')}" placeholder="ex : Baby Karaté">
                </div>
                <div>
                    <label class="lbl">Professeur</label>
                    <input data-k="professeur" class="inp" value="${esc(c.professeur || '')}" placeholder="ex : Denis Didier">
                </div>
                <div>
                    <label class="lbl">Capacité max</label>
                    <input data-k="capacite_max" class="inp" inputmode="numeric" value="${cap}" placeholder="vide = illimité">
                </div>
                <div>
                    <label class="lbl">Jours</label>
                    <input data-k="jours" class="inp" value="${esc(c.jours || '')}" placeholder="ex : Mardi et Jeudi">
                </div>
                <div>
                    <label class="lbl">Horaire</label>
                    <input data-k="heures" class="inp" value="${esc(c.heures || '')}" placeholder="ex : 18h30 - 19h30">
                </div>
                <div>
                    <label class="lbl">Lieu</label>
                    <input data-k="lieu" class="inp" value="${esc(c.lieu || '')}" placeholder="ex : Gymnase Auguste Delaune">
                </div>
                <div>
                    <label class="lbl">Tarif cours (€, hors licence)</label>
                    <input data-k="prix" class="inp" inputmode="decimal" value="${prix}" placeholder="ex : 183">
                </div>
                <div>
                    <label class="lbl">Mise en avant</label>
                    <select data-k="accent" class="inp">${accentOpts}</select>
                </div>
                <div class="flex items-end justify-end">
                    <button type="button" data-del-cours class="text-csb-corail text-sm font-bold hover:underline">Supprimer ce cours</button>
                </div>
            </div>`;
    }

    // Lit les champs des cours dans le DOM -> editingCours (avant tout re-render / save).
    function syncCoursFromDom() {
        const list = saisonModalBody.querySelector('#cours-list');
        if (!list) return;
        editingCours = [...list.querySelectorAll('[data-cours-row]')].map(row => ({
            cours_type: row.querySelector('[data-k="cours_type"]').value || '',
            libelle: row.querySelector('[data-k="libelle"]').value.trim(),
            professeur: row.querySelector('[data-k="professeur"]').value.trim(),
            capacite_max: parseCapacite(row.querySelector('[data-k="capacite_max"]').value),
            jours: row.querySelector('[data-k="jours"]').value.trim(),
            heures: row.querySelector('[data-k="heures"]').value.trim(),
            lieu: row.querySelector('[data-k="lieu"]').value.trim(),
            accent: row.querySelector('[data-k="accent"]').value,
            prix: eurosToCents(row.querySelector('[data-k="prix"]').value) || 0
        }));
    }

    // Délégation des clics dans la modale (fermeture, +/− cours, enregistrement).
    saisonModal && saisonModal.addEventListener('click', (e) => {
        if (e.target.closest('[data-saison-close]')) return closeSaisonModal();
        if (e.target.closest('#btn-add-cours')) {
            syncCoursFromDom(); editingCours.push({ accent: 'dojo' }); renderCoursList(); updateCoursCount(); return;
        }
        const del = e.target.closest('[data-del-cours]');
        if (del) {
            syncCoursFromDom();
            editingCours.splice(Number(del.closest('[data-cours-row]').dataset.i), 1);
            renderCoursList(); updateCoursCount(); return;
        }
        if (e.target.closest('#btn-save-saison')) return saveSaison();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && saisonModal && !saisonModal.classList.contains('hidden')) closeSaisonModal();
    });

    async function saveSaison() {
        syncCoursFromDom();
        const q = (sel) => saisonModalBody.querySelector(sel);
        const label = q('#s-label').value.trim();
        if (!label) { alert('Le libellé de la saison est obligatoire.'); return; }

        const payload = {
            label,
            date_debut: q('#s-debut').value || null,
            date_fin: q('#s-fin').value || null,
            tarif_licence: eurosToCents(q('#s-licence').value) ?? 3700,
            nb_licencies: parseInt(q('#s-nb').value, 10) || 0,
            tarifs_note: q('#s-tnote').value.trim(),
            licence_note: q('#s-lnote').value.trim()
        };
        const makeActive = q('#s-active').checked;

        const btn = q('#btn-save-saison');
        if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
        try {
            // 1) Insert ou update de la saison (sans toucher `active` ici : géré en 2).
            let saisonId = editingSaison ? editingSaison.id : null;
            if (saisonId) {
                const { error } = await sb.from('saisons').update(payload).eq('id', saisonId);
                if (error) throw error;
            } else {
                const { data, error } = await sb.from('saisons').insert(payload).select().single();
                if (error) throw error;
                saisonId = data.id;
            }

            // 2) Flag actif (index partiel unique : au plus une active).
            if (makeActive) {
                await sb.from('saisons').update({ active: false }).eq('active', true).neq('id', saisonId);
                const { error } = await sb.from('saisons').update({ active: true }).eq('id', saisonId);
                if (error) throw error;
            } else {
                await sb.from('saisons').update({ active: false }).eq('id', saisonId);
            }

            // 3) Cours : remplacement intégral (delete + reinsert). Sûr car aucun FK
            //    externe ne pointe cours.id (les adhérents référencent cours_type texte).
            const { error: delErr } = await sb.from('cours').delete().eq('saison_id', saisonId);
            if (delErr) throw delErr;
            const rows = editingCours.map((c, i) => ({
                saison_id: saisonId,
                cours_type: c.cours_type || null,
                libelle: c.libelle || '',
                professeur: c.professeur || '',
                capacite_max: c.capacite_max ?? null,
                jours: c.jours || '',
                heures: c.heures || '',
                lieu: c.lieu || '',
                accent: c.accent || 'dojo',
                prix: c.prix || 0,
                position: i
            }));
            if (rows.length) {
                const { error: insErr } = await sb.from('cours').insert(rows);
                if (insErr) throw insErr;
            }

            tarifConfig = null; // invalide le cache tarifaire (prix éventuellement modifiés)
            closeSaisonModal();
            await loadSaisons();
        } catch (err) {
            console.error(err);
            alert('Échec de l\'enregistrement : ' + (err.message || err));
            if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
        }
    }

    // --- Démarrage ---
    boot_init();
});
