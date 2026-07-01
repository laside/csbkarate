// =============================================================
// ESPACE ADHÉRENT — adherent.js
// =============================================================
// Espace privé du référent (parent / adhérent majeur) : consultation de son
// dossier, des adhérents de sa famille, de l'état du règlement, et
// TÉLÉCHARGEMENT de l'attestation de paiement (conditionné au dossier soldé).
//
// PATTERN : comme inscription.js / membres.js, le module gestion N'utilise PAS
// store.js. On parle directement à window.sb sous la session du membre ; la RLS
// (migrations 0006/0009) ne lui rend QUE sa propre famille — aucune écriture ici
// (l'attestation est générée côté client, la facture reste réservée au bureau).
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const fmt = (c) => CSBTarifs.formatEuros(c);
    const COURS_LABEL = { 'Baby': 'Baby Karaté', 'Enfant': 'Enfant', 'Adulte': 'Adulte', 'Self-Defense': 'Self-défense' };

    // Catalogue des pièces justificatives téléversables par la famille.
    // `field: 'photo'` → stocké dans adherents.photo_path (compat bureau) ;
    // sinon → adherents.documents_files[key]. `minorOnly` = mineurs uniquement.
    // La VALIDATION (coche) reste au bureau (jsonb adherents.documents, 0009).
    const PIECES = [
        { key: 'photo',                  label: "Photo d'identité",                          field: 'photo' },
        { key: 'certificat_medical',     label: 'Certificat médical / questionnaire santé' },
        { key: 'autorisation_parentale', label: 'Autorisation parentale', minorOnly: true },
        { key: 'reglement_interieur',    label: 'Règlement intérieur signé' }
    ];

    // Badge de validation bureau (axe explicite, distinct du statut règlement/pièces).
    const VALIDATION_BADGE = {
        accepte:    ['✅ Accepté',   'bg-green-50 text-green-700 border-green-300'],
        refuse:     ['⛔ Refusé',    'bg-red-50 text-red-700 border-red-300'],
        en_attente: ['⏳ En attente', 'bg-amber-50 text-amber-700 border-amber-300']
    };

    // Notification email non bloquante (Edge Function `notify`). Un échec
    // (fonction non déployée, quota…) ne doit JAMAIS casser le parcours famille.
    async function notify(body) {
        try { await sb.functions.invoke('notify', { body }); }
        catch (err) { console.warn('[notify] non envoyé :', err && err.message); }
    }

    // Config tarifaire de la saison active (mêmes prix que l'inscription en ligne).
    let tarifConfig = null;
    async function loadTarifConfig() {
        if (tarifConfig) return tarifConfig;
        try {
            const res = await CSBSaisons.loadActive();
            const dyn = res && res.saison ? CSBTarifs.configFromCours(res.cours, res.saison.tarif_licence) : null;
            tarifConfig = dyn ? Object.assign({}, CSBTarifs.DEFAULT_CONFIG, dyn) : CSBTarifs.DEFAULT_CONFIG;
        } catch (_) {
            tarifConfig = CSBTarifs.DEFAULT_CONFIG;
        }
        return tarifConfig;
    }

    // --- Éléments ---
    const boot = $('#boot');
    const gate = $('#gate');
    const dashboard = $('#dashboard');
    const gateEmail = $('#gate-email');
    const gatePwd = $('#gate-pwd');
    const gateBtn = $('#gate-btn');
    const gateError = $('#gate-error');
    const gateInfo = $('#gate-info');
    const resetPwdSection = $('#reset-pwd-section');
    const resetPwd = $('#reset-pwd');
    const resetPwdConfirm = $('#reset-pwd-confirm');
    const resetPwdBtn = $('#reset-pwd-btn');
    const resetPwdError = $('#reset-pwd-error');
    const resetPwdSuccess = $('#reset-pwd-success');

    // --- État ---
    let famille = null;
    let adherents = [];
    let dossiers = [];
    let paiements = [];
    let factures = [];

    // =========================================================
    // Authentification (n'importe quel compte adhérent)
    // =========================================================
    async function boot_init() {
        // Priorité 1 : flux de réinitialisation de mot de passe
        if (await checkRecoveryFlow()) return;
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session) return showDashboard();
        } catch (err) {
            console.error(err);
        }
        showGate();
    }

    async function checkRecoveryFlow() {
        const hash = window.location.hash;
        if (!hash || !hash.includes('type=recovery')) return false;
        boot.classList.add('hidden');
        gate.classList.add('hidden');
        dashboard.classList.add('hidden');
        resetPwdSection.classList.remove('hidden');
        resetPwd.focus();
        return true;
    }

    function showGate() {
        boot.classList.add('hidden');
        dashboard.classList.add('hidden');
        gate.classList.remove('hidden');
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

    // Mot de passe oublié (même mécanique que admin.js : redirectTo dynamique).
    const gateForgot = $('#gate-forgot');
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
            setTimeout(() => showDashboard(), 1500);
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

    // =========================================================
    // Chargement des données (RLS : uniquement la famille du membre)
    // =========================================================
    async function loadAll() {
        const { data: { user } } = await sb.auth.getUser();
        $('#welcome').textContent = user ? `Connecté en tant que ${user.email}` : '';

        // On scope tout à la famille DONT ce compte est référent : la RLS le
        // garantit déjà pour un adhérent, mais ce filtre explicite évite l'erreur
        // « multiple rows » si un compte bureau (qui voit tout) ouvre cette page.
        const { data: fam } = await sb.from('familles')
            .select('*').eq('referent_user_id', user && user.id).maybeSingle();
        famille = fam || null;

        if (!famille) {
            adherents = []; dossiers = []; paiements = []; factures = [];
            renderFamille(); renderAdherents(); renderDossiers(); renderFamilleTotal();
            return;
        }
        const fid = famille.id;

        const [aRes, dRes, facRes] = await Promise.all([
            sb.from('adherents').select('*').eq('famille_id', fid).order('id', { ascending: true }),
            sb.from('dossiers').select('*').eq('famille_id', fid).order('created_at', { ascending: false }),
            sb.from('factures').select('*').eq('famille_id', fid)
        ]);
        adherents = aRes.data || [];
        dossiers = dRes.data || [];
        factures = facRes.data || [];

        // Paiements rattachés aux dossiers de la famille (lecture RLS autorisée).
        const ids = dossiers.map(d => d.id);
        if (ids.length) {
            const { data: pData } = await sb.from('paiements').select('*').in('dossier_id', ids);
            paiements = pData || [];
        } else {
            paiements = [];
        }

        renderFamille();
        renderAdherents();
        renderDossiers();
        renderFamilleTotal();
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
    // Rendu : coordonnées de la famille (édition inline)
    // =========================================================
    function renderFamille() {
        const card = $('#famille-card');
        if (!famille) {
            card.innerHTML = `
                <div class="text-center py-6">
                    <p class="text-gray-500 mb-2">Aucun dossier famille rattaché à ce compte.</p>
                    <p class="text-xs text-gray-400 mb-5">Votre compte existe mais vous n'avez pas encore créé votre foyer. Vous pouvez le faire ici sans repasser par l'inscription.</p>
                    <button id="btn-create-famille" type="button"
                            class="px-6 py-3 rounded-full font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-corail transition text-sm shadow-lg">
                        + Créer mon dossier famille
                    </button>
                    <p id="create-famille-feedback" class="text-sm mt-3"></p>
                </div>`;
            $('#btn-create-famille').addEventListener('click', createFamille);
            return;
        }
        card.innerHTML = `
            <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                    <p class="font-condensed uppercase tracking-wider text-[11px] text-gray-400 mb-1">Mes informations</p>
                    <p class="text-2xl font-bold text-csb-encre">${esc(famille.nom_referent || '—')}</p>
                </div>
                <button id="btn-edit-profil" type="button"
                        class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-white transition">
                    ✏️ Modifier
                </button>
            </div>
            <div id="profil-view" class="text-sm text-gray-500 space-y-1">
                ${famille.email ? `<p>✉️ ${esc(famille.email)}</p>` : ''}
                ${famille.adresse ? `<p>${esc(famille.adresse)}</p>` : ''}
                ${famille.code_postal || famille.ville ? `<p>${esc([famille.code_postal, famille.ville].filter(Boolean).join(' '))}</p>` : ''}
                ${famille.telephone_urgence ? `<p>Tél. urgence : ${esc(famille.telephone_urgence)}</p>` : ''}
            </div>
            <div id="profil-edit" class="hidden space-y-3 mt-2">
                <p class="text-sm text-gray-400">✉️ L'email de connexion (<strong>${esc(famille.email || '—')}</strong>) ne peut pas être modifié ici. Utilisez « Mot de passe oublié » ou contactez le bureau.</p>
                <div>
                    <label class="lbl" for="edit-nom">Nom du référent</label>
                    <input id="edit-nom" class="inp" value="${esc(famille.nom_referent || '')}">
                </div>
                <div>
                    <label class="lbl" for="edit-adresse">Adresse</label>
                    <input id="edit-adresse" class="inp" value="${esc(famille.adresse || '')}">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="lbl" for="edit-cp">Code postal</label>
                        <input id="edit-cp" class="inp" value="${esc(famille.code_postal || '')}">
                    </div>
                    <div>
                        <label class="lbl" for="edit-ville">Ville</label>
                        <input id="edit-ville" class="inp" value="${esc(famille.ville || '')}">
                    </div>
                </div>
                <div>
                    <label class="lbl" for="edit-tel">Téléphone d'urgence</label>
                    <input id="edit-tel" type="tel" class="inp" value="${esc(famille.telephone_urgence || '')}">
                </div>
                <div class="flex gap-3 pt-1">
                    <button id="btn-save-profil" type="button"
                            class="px-5 py-2 rounded-full font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition text-sm">
                        💾 Enregistrer
                    </button>
                    <button id="btn-cancel-profil" type="button"
                            class="px-5 py-2 rounded-full font-condensed uppercase tracking-wider bg-gray-200 text-csb-encre hover:bg-gray-300 transition text-sm">
                        Annuler
                    </button>
                </div>
                <p id="profil-feedback" class="text-sm"></p>
            </div>`;

        // Bascule vue / édition
        $('#btn-edit-profil').addEventListener('click', () => {
            $('#profil-view').classList.add('hidden');
            $('#profil-edit').classList.remove('hidden');
        });
        $('#btn-cancel-profil').addEventListener('click', () => {
            $('#profil-edit').classList.add('hidden');
            $('#profil-view').classList.remove('hidden');
        });
        $('#btn-save-profil').addEventListener('click', saveProfil);
    }

    async function saveProfil() {
        const btn = $('#btn-save-profil');
        const fb = $('#profil-feedback');
        btn.disabled = true;
        btn.textContent = 'Enregistrement…';
        fb.textContent = '';
        const nom_referent = $('#edit-nom').value.trim();
        const adresse = $('#edit-adresse').value.trim();
        const code_postal = $('#edit-cp').value.trim();
        const ville = $('#edit-ville').value.trim();
        const telephone_urgence = $('#edit-tel').value.trim();

        try {
            const { error } = await sb.from('familles').update({
                nom_referent, adresse, code_postal, ville, telephone_urgence
            }).eq('id', famille.id);
            if (error) throw error;
            // Synchro profiles (migration 0017) pour le nom/téléphone
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
                await sb.from('profiles').update({
                    nom: nom_referent, telephone: telephone_urgence
                }).eq('user_id', user.id);
            }
            famille.nom_referent = nom_referent;
            famille.adresse = adresse;
            famille.code_postal = code_postal;
            famille.ville = ville;
            famille.telephone_urgence = telephone_urgence;
            toast('Profil mis à jour avec succès.');
            renderFamille();
        } catch (err) {
            console.error(err);
            fb.textContent = '⚠ ' + (err.message || 'Échec');
            fb.className = 'text-sm text-csb-corail font-bold';
            toast('Échec : ' + (err.message || 'Erreur inconnue'), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Enregistrer';
        }
    }

    // Création d'un dossier famille pour un compte déjà existant (sans
    // repasser par l'inscription qui tenterait un signUp en doublon).
    async function createFamille() {
        const btn = $('#btn-create-famille');
        const fb = $('#create-famille-feedback');
        if (!btn) return;
        btn.disabled = true;
        btn.textContent = 'Création…';
        fb.textContent = '';
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) throw new Error('Session expirée, reconnectez-vous.');
            // Récupère l'email depuis profiles (table lisible par l'utilisateur lui-même)
            const { data: prof } = await sb.from('profiles')
                .select('email').eq('user_id', user.id).maybeSingle();
            const email = (prof && prof.email) ? prof.email : (user.email || '');
            const { data: famRow, error: famErr } = await sb.from('familles')
                .insert({
                    referent_user_id: user.id,
                    nom_referent: '',
                    email: email,
                    telephone_urgence: '',
                    adresse: '',
                    code_postal: '',
                    ville: ''
                })
                .select('id').single();
            if (famErr) throw famErr;
            famille = { id: famRow.id, nom_referent: '', email, telephone_urgence: '', adresse: '', code_postal: '', ville: '' };
            toast('Dossier famille créé. Vous pouvez maintenant le compléter.');
            renderFamille();
        } catch (err) {
            console.error(err);
            fb.textContent = '⚠ ' + (err.message || 'Échec');
            fb.className = 'text-sm text-csb-corail font-bold';
            btn.disabled = false;
            btn.textContent = '+ Créer mon dossier famille';
        }
    }

    // =========================================================
    // Rendu : adhérents (pratiquants)
    // =========================================================
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

    // Âge au 1er septembre de l'année de rentrée (pour la règle Self-Défense ≥ 13 ans).
    const ANNEE_RENTREE = 2026;
    function ageSept(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d)) return null;
        const ref = new Date(ANNEE_RENTREE, 8, 1); // 1er septembre
        let age = ref.getFullYear() - d.getFullYear();
        if (ref.getMonth() < d.getMonth() || (ref.getMonth() === d.getMonth() && ref.getDate() < d.getDate())) age--;
        return age;
    }

    // Ids des adhérents dont le panneau « pièces jointes » est déplié
    // (mémorisé pour survivre aux re-render après upload/suppression).
    const expandedPieces = new Set();

    function renderAdherents() {
        const grid = $('#adherents-grid');
        const btn = $('#btn-add-adherent');
        if (btn) btn.disabled = !famille;
        if (!adherents.length) {
            grid.innerHTML = '<p class="text-gray-500">Aucun adhérent enregistré pour le moment.</p>';
            return;
        }
        grid.innerHTML = adherents.map(adherentCardHtml).join('');
    }

    // Pièces applicables à un adhérent (les pièces `minorOnly` ne concernent
    // que les mineurs).
    function piecesFor(a) {
        const age = ageOf(a.date_naissance);
        const isMinor = age !== null && age < 18;
        return PIECES.filter(p => !p.minorOnly || isMinor);
    }
    // Chemin Storage du fichier d'une pièce (photo -> photo_path, sinon documents_files).
    function pieceFilePath(a, piece) {
        if (piece.field === 'photo') return a.photo_path || '';
        const files = (a.documents_files && typeof a.documents_files === 'object') ? a.documents_files : {};
        return files[piece.key] || '';
    }
    // Nombre de pièces fournies (fichier présent) / applicables.
    function piecesStats(a) {
        const applicable = piecesFor(a);
        const fournies = applicable.filter(p => pieceFilePath(a, p)).length;
        return { fournies, total: applicable.length };
    }

    function adherentCardHtml(a) {
        const age = ageOf(a.date_naissance);
        const meta = [COURS_LABEL[a.cours_type] || '', age === null ? '' : `${age} ans`].filter(Boolean).join(' · ');
        const [vTxt, vCls] = VALIDATION_BADGE[a.statut_validation] || VALIDATION_BADGE.en_attente;
        const { fournies, total } = piecesStats(a);
        const open = expandedPieces.has(a.id);

        return `
            <div class="bg-white rounded-2xl border border-csb-tatami p-5" data-adherent="${a.id}">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p class="text-lg font-bold text-csb-encre">${esc(a.prenom)} ${esc(a.nom)}</p>
                        <p class="text-sm text-gray-400">${esc(meta)}</p>
                        <span class="inline-block mt-2 text-xs font-condensed uppercase tracking-wider bg-csb-washi border border-csb-tatami rounded-full px-3 py-1 text-csb-dojo">
                            ${esc(a.grade_actuel || 'Ceinture Blanche')}
                        </span>
                    </div>
                    <span class="inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${vCls}">${vTxt}</span>
                </div>

                ${a.statut_validation === 'refuse' && a.validation_note ? `
                    <p class="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Motif du bureau : ${esc(a.validation_note)}</p>` : ''}

                <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-csb-tatami">
                    <button type="button" data-toggle-pieces="${a.id}"
                            class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider bg-csb-dojo text-white hover:bg-csb-corail transition">
                        📎 Pièces (${fournies}/${total})
                    </button>
                    <button type="button" data-edit-adherent="${a.id}"
                            class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-csb-washi transition">
                        ✏️ Modifier
                    </button>
                    <button type="button" data-delete-adherent="${a.id}"
                            class="px-4 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider text-csb-corail hover:underline ml-auto">
                        Retirer
                    </button>
                </div>

                <div data-pieces-panel="${a.id}" class="${open ? '' : 'hidden'} mt-4 pt-4 border-t border-csb-tatami space-y-3">
                    ${piecesPanelHtml(a)}
                </div>
                <div data-edit-panel="${a.id}" class="hidden mt-4 pt-4 border-t border-csb-tatami"></div>
                <p data-adherent-fb="${a.id}" class="text-sm mt-2"></p>
            </div>`;
    }

    function piecesPanelHtml(a) {
        return piecesFor(a).map(p => {
            const path = pieceFilePath(a, p);
            const docs = (a.documents && typeof a.documents === 'object') ? a.documents : {};
            const valide = !!docs[p.key]; // coche posée par le bureau (0009)
            const etat = valide
                ? '<span class="text-xs font-bold text-green-700">✔ Validé par le bureau</span>'
                : (path
                    ? '<span class="text-xs text-amber-700">⏳ En attente de validation</span>'
                    : '<span class="text-xs text-gray-400">À fournir</span>');
            return `
                <div class="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                        <p class="text-sm font-semibold text-csb-encre">${esc(p.label)}</p>
                        ${etat}
                    </div>
                    <div class="flex items-center gap-2">
                        ${path ? `<button type="button" data-view-file="${esc(path)}" class="text-xs text-csb-dojo hover:text-csb-corail underline">Voir</button>` : ''}
                        <label class="px-3 py-1.5 rounded-full text-xs font-condensed uppercase tracking-wider border border-csb-tatami text-csb-encre hover:bg-csb-washi transition cursor-pointer">
                            ${path ? 'Remplacer' : 'Téléverser'}
                            <input type="file" class="hidden" accept="image/*,.pdf" data-upload-piece="${a.id}" data-piece-key="${p.key}">
                        </label>
                        ${path ? `<button type="button" data-remove-piece="${a.id}" data-piece-key="${p.key}" class="text-xs text-csb-corail hover:underline">Retirer</button>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    // =========================================================
    // Récapitulatif tarifaire FAMILLE (calcul dynamique, lecture seule)
    // =========================================================
    // Somme due pour TOUS les adhérents du foyer, calculée en direct avec le
    // MÊME moteur que l'inscription (CSBTarifs) et les prix de la saison active.
    // C'est une estimation d'aide à la décision : le montant qui fait foi reste
    // celui du/des dossier(s) créés par le bureau (bloc « Règlement » ci-dessous).
    async function renderFamilleTotal() {
        const el = $('#famille-total');
        if (!el) return;
        if (!famille || !adherents.length) { el.innerHTML = ''; return; }

        const cfg = await loadTarifConfig();
        const liste = adherents.map(a => ({
            prenom: a.prenom, coursType: a.cours_type,
            membreBureau: a.membre_bureau, passSport: a.pass_sport
        }));
        const d = CSBTarifs.computeTarif(liste, cfg);

        const lignes = d.lignes.map(l => `
            <div class="flex justify-between text-sm py-1">
                <span class="text-gray-600">${esc(l.nom)} <span class="text-gray-400">· ${esc(l.label)}</span></span>
                <span class="text-csb-encre font-medium">${fmt(l.montant)}</span>
            </div>`).join('');

        const remises = [];
        if (d.remiseFamille) remises.push(`<div class="flex justify-between text-sm py-1"><span class="text-green-700">Remise famille (${d.nbInscrits} inscrits)</span><span class="text-green-700 font-medium">− ${fmt(d.remiseFamille)}</span></div>`);
        if (d.remisePassSport) remises.push(`<div class="flex justify-between text-sm py-1"><span class="text-green-700">Pass'Sport (${d.nbPassSport})</span><span class="text-green-700 font-medium">− ${fmt(d.remisePassSport)}</span></div>`);

        el.innerHTML = `
            <div class="bg-white rounded-2xl border border-csb-tatami border-t-4 border-t-csb-dojo p-6">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-condensed text-xl uppercase tracking-wider text-csb-encre">Montant famille (estimation)</h2>
                    <span class="text-2xl font-bold text-csb-encre">${fmt(d.total)}</span>
                </div>
                <div class="border-t border-csb-tatami/60 pt-2">
                    ${lignes}
                    ${remises.join('')}
                </div>
                <p class="text-xs text-gray-400 mt-3">Calcul indicatif pour l'ensemble du foyer (licence FFK incluse). Le montant définitif figure dans « Règlement &amp; documents » une fois le dossier créé par le bureau.</p>
            </div>`;
    }

    // =========================================================
    // Interactions sur les cartes adhérents (délégation)
    // =========================================================
    const adherentsGrid = $('#adherents-grid');
    adherentsGrid && adherentsGrid.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-toggle-pieces]');
        if (toggle) return togglePieces(Number(toggle.dataset.togglePieces));
        const edit = e.target.closest('[data-edit-adherent]');
        if (edit) return openEditAdherent(Number(edit.dataset.editAdherent));
        const del = e.target.closest('[data-delete-adherent]');
        if (del) return deleteAdherent(Number(del.dataset.deleteAdherent));
        const view = e.target.closest('[data-view-file]');
        if (view) return viewFile(view.dataset.viewFile);
        const removePc = e.target.closest('[data-remove-piece]');
        if (removePc) return removePiece(Number(removePc.dataset.removePiece), removePc.dataset.pieceKey);
    });
    adherentsGrid && adherentsGrid.addEventListener('change', (e) => {
        const up = e.target.closest('[data-upload-piece]');
        if (up && up.files && up.files[0]) uploadPiece(Number(up.dataset.uploadPiece), up.dataset.pieceKey, up.files[0]);
    });

    function togglePieces(id) {
        if (expandedPieces.has(id)) expandedPieces.delete(id); else expandedPieces.add(id);
        const panel = adherentsGrid.querySelector(`[data-pieces-panel="${id}"]`);
        if (panel) panel.classList.toggle('hidden', !expandedPieces.has(id));
    }

    function adherentFb(id) { return adherentsGrid.querySelector(`[data-adherent-fb="${id}"]`); }

    async function viewFile(path) {
        try {
            const { data, error } = await sb.storage.from('dossiers').createSignedUrl(path, 3600);
            if (error) throw error;
            window.open(data.signedUrl, '_blank', 'noopener');
        } catch (err) { toast('Impossible d\'ouvrir le fichier : ' + (err.message || ''), 'error'); }
    }

    // --- Téléversement d'une pièce dans le bucket privé `dossiers` ---
    async function uploadPiece(id, key, file) {
        const a = adherents.find(x => x.id === id);
        const piece = PIECES.find(p => p.key === key);
        if (!a || !piece) return;
        const fb = adherentFb(id);
        try {
            // Validation (type/taille) + compression image → tient dans le plan gratuit.
            if (fb) { fb.textContent = 'Vérification du fichier…'; fb.className = 'text-sm mt-2 text-gray-400'; }
            const prepared = await CSBFiles.prepare(file);
            if (fb) fb.textContent = 'Envoi du fichier…';
            const { data: { user } } = await sb.auth.getUser();
            const uid = user ? user.id : 'unknown';
            const ext = CSBFiles.extOf(prepared);
            const path = `${uid}/${id}-${key}-${Date.now()}.${ext}`;
            const { error: upErr } = await sb.storage.from('dossiers').upload(path, prepared, { upsert: true, contentType: prepared.type || undefined });
            if (upErr) throw upErr;

            // Ancien fichier à nettoyer (best-effort, ne bloque pas).
            const old = pieceFilePath(a, piece);

            if (piece.field === 'photo') {
                const { error } = await sb.from('adherents').update({ photo_path: path }).eq('id', id);
                if (error) throw error;
                a.photo_path = path;
            } else {
                const files = Object.assign({}, a.documents_files || {}, { [key]: path });
                const { error } = await sb.from('adherents').update({ documents_files: files }).eq('id', id);
                if (error) throw error;
                a.documents_files = files;
            }
            if (old && old !== path) { sb.storage.from('dossiers').remove([old]).catch(() => {}); }

            if (fb) fb.textContent = '';
            toast('Pièce enregistrée.');
            renderAdherents();
        } catch (err) {
            console.error(err);
            if (fb) { fb.textContent = '⚠ ' + (err.message || 'Échec de l\'envoi'); fb.className = 'text-sm mt-2 text-csb-corail font-bold'; }
        }
    }

    async function removePiece(id, key) {
        const a = adherents.find(x => x.id === id);
        const piece = PIECES.find(p => p.key === key);
        if (!a || !piece) return;
        if (!confirm('Retirer ce fichier ?')) return;
        const old = pieceFilePath(a, piece);
        try {
            if (piece.field === 'photo') {
                const { error } = await sb.from('adherents').update({ photo_path: '' }).eq('id', id);
                if (error) throw error;
                a.photo_path = '';
            } else {
                const files = Object.assign({}, a.documents_files || {});
                delete files[key];
                const { error } = await sb.from('adherents').update({ documents_files: files }).eq('id', id);
                if (error) throw error;
                a.documents_files = files;
            }
            if (old) { sb.storage.from('dossiers').remove([old]).catch(() => {}); }
            toast('Fichier retiré.');
            renderAdherents();
        } catch (err) {
            console.error(err);
            toast('Échec : ' + (err.message || ''), 'error');
        }
    }

    // --- Édition d'un adhérent (panneau inline) ---
    const GRADES_LIST = [
        'Ceinture Blanche', 'Ceinture Jaune', 'Ceinture Orange', 'Ceinture Verte',
        'Ceinture Bleue', 'Ceinture Marron', '1er Dan', '2e Dan', '3e Dan'
    ];
    function openEditAdherent(id) {
        const a = adherents.find(x => x.id === id);
        const panel = adherentsGrid.querySelector(`[data-edit-panel="${id}"]`);
        if (!a || !panel) return;
        if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
        const coursOpts = COURS_OPTIONS.map(o => `<option value="${o.value}" ${o.value === a.cours_type ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
        const gradeOpts = GRADES_LIST.map(g => `<option ${g === a.grade_actuel ? 'selected' : ''}>${esc(g)}</option>`).join('');
        panel.innerHTML = `
            <div class="grid sm:grid-cols-2 gap-3">
                <div><label class="lbl">Prénom</label><input data-e="prenom" class="inp" value="${esc(a.prenom || '')}"></div>
                <div><label class="lbl">Nom</label><input data-e="nom" class="inp" value="${esc(a.nom || '')}"></div>
                <div><label class="lbl">Date de naissance</label><input type="date" data-e="date_naissance" class="inp" value="${esc(a.date_naissance || '')}"></div>
                <div><label class="lbl">Cours</label><select data-e="cours_type" class="inp">${coursOpts}</select></div>
                <div><label class="lbl">Grade</label><select data-e="grade_actuel" class="inp">${gradeOpts}</select></div>
            </div>
            <div class="flex gap-3 mt-4">
                <button type="button" data-save-edit="${id}" class="px-5 py-2 rounded-full font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition text-sm">💾 Enregistrer</button>
                <button type="button" data-cancel-edit="${id}" class="px-5 py-2 rounded-full font-condensed uppercase tracking-wider bg-gray-200 text-csb-encre hover:bg-gray-300 transition text-sm">Annuler</button>
            </div>`;
        panel.classList.remove('hidden');
        panel.querySelector(`[data-save-edit="${id}"]`).addEventListener('click', () => saveEditAdherent(id, panel));
        panel.querySelector(`[data-cancel-edit="${id}"]`).addEventListener('click', () => { panel.classList.add('hidden'); panel.innerHTML = ''; });
    }

    async function saveEditAdherent(id, panel) {
        const a = adherents.find(x => x.id === id);
        if (!a) return;
        const val = (k) => panel.querySelector(`[data-e="${k}"]`).value;
        const coursType = val('cours_type');
        const naissance = val('date_naissance');
        if (coursType === 'Self-Defense') {
            const age = ageSept(naissance);
            if (age !== null && age < 13) { toast('La self-défense est réservée aux 13 ans et plus.', 'error'); return; }
        }
        const patch = {
            prenom: val('prenom').trim(), nom: val('nom').trim(),
            date_naissance: naissance || null, cours_type: coursType || null,
            grade_actuel: val('grade_actuel')
        };
        try {
            const { error } = await sb.from('adherents').update(patch).eq('id', id);
            if (error) throw error;
            Object.assign(a, patch);
            panel.classList.add('hidden'); panel.innerHTML = '';
            toast('Adhérent mis à jour.');
            renderAdherents();
            renderFamilleTotal();
        } catch (err) {
            console.error(err);
            toast('Échec : ' + (err.message || ''), 'error');
        }
    }

    async function deleteAdherent(id) {
        const a = adherents.find(x => x.id === id);
        if (!a) return;
        if (!confirm(`Retirer ${a.prenom} ${a.nom} du dossier famille ?\nSes pièces et son grade seront perdus (le règlement de la famille n'est pas modifié).`)) return;
        try {
            const paths = CSBFiles.pathsOf(a); // photo + pièces à purger du Storage
            const { error } = await sb.from('adherents').delete().eq('id', id);
            if (error) throw error;
            if (paths.length) { sb.storage.from('dossiers').remove(paths).catch(() => {}); } // best-effort
            adherents = adherents.filter(x => x.id !== id);
            expandedPieces.delete(id);
            toast('Adhérent retiré.');
            renderAdherents();
            renderFamilleTotal();
        } catch (err) {
            console.error(err);
            toast('Échec : ' + (err.message || ''), 'error');
        }
    }

    // =========================================================
    // AJOUT D'ADHÉRENT (depuis l'Espace Adhérent, famille existante)
    // =========================================================
    const addFormContainer = $('#add-adherent-form');
    const btnAddAdherent = $('#btn-add-adherent');

    const COURS_OPTIONS = [
        { value: '', label: '— Choisir —' },
        { value: 'Baby', label: 'Baby Karaté' },
        { value: 'Enfant', label: 'Enfant' },
        { value: 'Adulte', label: 'Adulte' },
        { value: 'Self-Defense', label: 'Self-défense' }
    ];

    btnAddAdherent && btnAddAdherent.addEventListener('click', () => {
        if (!famille) return;
        const hidden = addFormContainer.classList.contains('hidden');
        if (hidden) showAddForm();
        else addFormContainer.classList.add('hidden');
    });

    function showAddForm() {
        if (!addFormContainer) return;
        const opts = COURS_OPTIONS.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
        addFormContainer.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-condensed text-lg uppercase tracking-wider text-csb-encre">Nouvel adhérent</h3>
                <button type="button" id="btn-cancel-add" class="text-gray-400 hover:text-csb-corail text-xl leading-none">&times;</button>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
                <div>
                    <label class="lbl" for="add-prenom">Prénom *</label>
                    <input id="add-prenom" class="inp" required>
                </div>
                <div>
                    <label class="lbl" for="add-nom">Nom *</label>
                    <input id="add-nom" class="inp" required>
                </div>
                <div>
                    <label class="lbl" for="add-naissance">Date de naissance *</label>
                    <input id="add-naissance" type="date" class="inp" required>
                </div>
                <div>
                    <label class="lbl" for="add-genre">Genre</label>
                    <select id="add-genre" class="inp">
                        <option value="">—</option>
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                    </select>
                </div>
                <div>
                    <label class="lbl" for="add-cours">Cours *</label>
                    <select id="add-cours" class="inp">${opts}</select>
                </div>
                <div>
                    <label class="lbl" for="add-grade">Grade</label>
                    <select id="add-grade" class="inp">
                        <option>Ceinture Blanche</option><option>Ceinture Jaune</option><option>Ceinture Orange</option>
                        <option>Ceinture Verte</option><option>Ceinture Bleue</option><option>Ceinture Marron</option>
                        <option>1er Dan</option><option>2e Dan</option><option>3e Dan</option>
                    </select>
                </div>
                <div>
                    <label class="lbl" for="add-photo">Photo d'identité</label>
                    <input id="add-photo" type="file" accept="image/*" class="inp">
                </div>
                <div>
                    <label class="lbl" for="add-pass-sport">Code Pass'Sport</label>
                    <input id="add-pass-sport" class="inp" placeholder="(si éligible)">
                </div>
            </div>
            <div class="flex gap-3 mt-5 pt-4 border-t border-csb-tatami">
                <button id="btn-submit-add" type="button"
                        class="px-6 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 transition text-sm shadow">
                    💾 Enregistrer l'adhérent
                </button>
                <button id="btn-cancel-add-2" type="button"
                        class="px-6 py-2.5 rounded-full font-condensed uppercase tracking-wider bg-gray-200 text-csb-encre hover:bg-gray-300 transition text-sm">
                    Annuler
                </button>
            </div>
            <p id="add-feedback" class="text-sm mt-3"></p>`;
        addFormContainer.classList.remove('hidden');
        window.scrollTo({ top: addFormContainer.offsetTop - 120, behavior: 'smooth' });

        $('#btn-cancel-add') && $('#btn-cancel-add').addEventListener('click', () => addFormContainer.classList.add('hidden'));
        $('#btn-cancel-add-2') && $('#btn-cancel-add-2').addEventListener('click', () => addFormContainer.classList.add('hidden'));
        $('#btn-submit-add') && $('#btn-submit-add').addEventListener('click', submitAddAdherent);
    }

    async function submitAddAdherent() {
        const fb = $('#add-feedback');
        const btn = $('#btn-submit-add');
        const prenom = $('#add-prenom').value.trim();
        const nom = $('#add-nom').value.trim();
        const naissance = $('#add-naissance').value;
        const genre = $('#add-genre').value;
        const coursType = $('#add-cours').value;
        const grade = $('#add-grade').value;
        const passSportCode = $('#add-pass-sport').value.trim();
        const photoInput = $('#add-photo');
        const photoFile = photoInput && photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;

        if (!prenom || !nom) { fb.textContent = 'Prénom et nom requis.'; fb.className = 'text-sm text-csb-corail font-bold'; return; }
        if (!naissance) { fb.textContent = 'Date de naissance requise.'; fb.className = 'text-sm text-csb-corail font-bold'; return; }
        if (!coursType) { fb.textContent = 'Choisissez un type de cours.'; fb.className = 'text-sm text-csb-corail font-bold'; return; }

        const age = ageSept(naissance);
        if (coursType === 'Self-Defense' && age !== null && age < 13) {
            fb.textContent = 'La self-défense est réservée aux 13 ans et plus.'; fb.className = 'text-sm text-csb-corail font-bold'; return;
        }

        // Validation + compression de la photo AVANT de désactiver le bouton
        // (message clair si le fichier est trop lourd ou d'un format non accepté).
        let preparedPhoto = null;
        if (photoFile) {
            try { preparedPhoto = await CSBFiles.prepare(photoFile); }
            catch (e) { fb.textContent = e.message; fb.className = 'text-sm text-csb-corail font-bold'; return; }
        }

        btn.disabled = true;
        btn.textContent = 'Enregistrement…';
        fb.textContent = '';
        fb.className = 'text-sm text-gray-400';

        try {
            // Photo (déjà validée + compressée en amont)
            let photoPath = '';
            if (preparedPhoto) {
                const { data: { user } } = await sb.auth.getUser();
                const uid = user ? user.id : 'unknown';
                const ext = CSBFiles.extOf(preparedPhoto);
                const path = `${uid}/${Date.now()}-add.${ext}`;
                const { error: upErr } = await sb.storage.from('dossiers').upload(path, preparedPhoto, { upsert: true, contentType: preparedPhoto.type || undefined });
                if (upErr) console.warn('Photo non envoyée :', upErr.message);
                else photoPath = path;
            }

            // Adhérent — is_new + statut_validation 'en_attente' : le bureau verra
            // le badge « Nouveau » et devra accepter/refuser explicitement.
            const { data: newRow, error: adhErr } = await sb.from('adherents').insert({
                famille_id: famille.id,
                prenom, nom,
                date_naissance: naissance || null,
                genre: genre || null,
                email: famille.email || '',
                cours_type: coursType,
                grade_actuel: grade || 'Ceinture Blanche',
                pass_sport: !!passSportCode,
                pass_sport_code: passSportCode,
                droit_image: true,
                photo_path: photoPath,
                statut_dossier: 'Incomplet',
                statut_validation: 'en_attente',
                is_new: true
            }).select().single();
            if (adhErr) throw adhErr;

            // Recharger les adhérents
            const { data: newAdh } = await sb.from('adherents').select('*').eq('famille_id', famille.id).order('id', { ascending: true });
            adherents = newAdh || [];
            renderAdherents();
            renderFamilleTotal();
            addFormContainer.classList.add('hidden');
            toast('Adhérent ajouté avec succès. Le bureau validera les pièces justificatives.');

            // Notifie le bureau (email) — non bloquant.
            if (newRow && newRow.id) notify({ type: 'new_member', adherent_id: newRow.id });
        } catch (err) {
            console.error(err);
            fb.textContent = '⚠ ' + (err.message || 'Échec');
            fb.className = 'text-sm text-csb-corail font-bold';
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Enregistrer l\'adhérent';
        }
    }

    // =========================================================
    // Rendu : dossiers (règlement + documents téléchargeables)
    // =========================================================
    // « Soldé » = somme encaissée >= montant total. Calculé uniquement à partir
    // des paiements, et délibérément DÉCOUPLÉ de `dossiers.statut` (qui, depuis
    // la migration 0010, est un état combiné pièces × règlement géré par le
    // bureau) : l'attestation de paiement ne concerne que l'argent reçu, pas les
    // pièces justificatives. Exception : 'Annulé' reste un état manuel à
    // respecter tel quel (il n'est jamais dérivé des encaissements).
    function encaisseDe(dossierId) {
        return paiements
            .filter(p => p.dossier_id === dossierId && p.encaisse)
            .reduce((s, p) => s + (p.montant || 0), 0);
    }
    function dernierEncaissement(dossierId) {
        const dates = paiements
            .filter(p => p.dossier_id === dossierId && p.encaisse && p.date_encaissement)
            .map(p => p.date_encaissement).sort();
        return dates.length ? dates[dates.length - 1] : null;
    }
    function estSolde(d) {
        return d.statut !== 'Annulé' && encaisseDe(d.id) >= (d.montant_total || 0);
    }

    function statutPaiement(d) {
        if (d.statut === 'Annulé') return 'annule';
        if (estSolde(d)) return 'solde';
        return encaisseDe(d.id) > 0 ? 'partiel' : 'attente';
    }
    const STATUT_BADGE = {
        solde: ['Soldé', 'bg-green-50 text-green-700 border-green-300'],
        partiel: ['Règlement en cours', 'bg-amber-50 text-amber-700 border-amber-300'],
        attente: ['En attente de règlement', 'bg-gray-50 text-gray-500 border-csb-tatami'],
        annule: ['Annulé', 'bg-gray-100 text-gray-400 border-csb-tatami']
    };

    function renderDossiers() {
        const wrap = $('#dossiers-list');
        if (!dossiers.length) {
            wrap.innerHTML = '<p class="text-gray-500">Aucun dossier d\'inscription pour le moment.</p>';
            return;
        }
        wrap.innerHTML = dossiers.map(dossierHtml).join('');
    }

    function dossierHtml(d) {
        const encaisse = encaisseDe(d.id);
        const reste = Math.max(0, (d.montant_total || 0) - encaisse);
        const solde = estSolde(d);
        const pct = d.montant_total ? Math.min(100, Math.round((encaisse / d.montant_total) * 100)) : 0;
        const [badgeTxt, badgeCls] = STATUT_BADGE[statutPaiement(d)];
        const facture = factures.find(f => f.dossier_id === d.id);

        // Actions documents : attestation (gated soldé) + facture (si émise).
        const attBtn = solde
            ? `<button type="button" data-att="${d.id}"
                    class="inline-flex items-center gap-2 bg-csb-dojo text-white px-5 py-2.5 rounded-full font-condensed uppercase tracking-wider hover:bg-csb-corail transition text-sm">
                    ⬇ Attestation de paiement
               </button>`
            : `<span class="text-sm text-gray-400 italic">L'attestation sera disponible une fois le règlement complet.</span>`;
        const facBtn = facture
            ? `<button type="button" data-fac="${d.id}"
                    class="inline-flex items-center gap-2 border border-csb-dojo text-csb-dojo px-5 py-2.5 rounded-full font-condensed uppercase tracking-wider hover:bg-csb-dojo hover:text-white transition text-sm">
                    ⬇ Facture N° ${esc(facture.numero)}
               </button>`
            : '';

        return `
            <div class="bg-white rounded-2xl border border-csb-tatami p-6">
                <div class="flex flex-wrap justify-between items-start gap-3 mb-4">
                    <div>
                        <p class="font-condensed uppercase tracking-wider text-[11px] text-gray-400">Saison ${esc(d.saison || '')}</p>
                        <p class="text-2xl font-bold text-csb-encre">${fmt(d.montant_total)}</p>
                    </div>
                    <span class="inline-block text-xs font-semibold rounded-full px-3 py-1 border ${badgeCls}">${esc(badgeTxt)}</span>
                </div>

                <div class="mb-4">
                    <div class="h-2 rounded-full bg-csb-washi overflow-hidden">
                        <div class="h-full bg-green-500" style="width:${pct}%"></div>
                    </div>
                    <p class="text-sm text-gray-500 mt-2">
                        Réglé : <strong class="text-csb-encre">${fmt(encaisse)}</strong>
                        ${reste > 0 ? ` · Reste : <strong class="text-csb-corail">${fmt(reste)}</strong>` : ''}
                    </p>
                </div>

                <div class="flex flex-wrap gap-3 pt-4 border-t border-csb-tatami">
                    ${attBtn}
                    ${facBtn}
                </div>
            </div>`;
    }

    // =========================================================
    // Téléchargements (PDF généré côté client)
    // =========================================================
    $('#dossiers-list').addEventListener('click', async (e) => {
        const attBtn = e.target.closest('[data-att]');
        const facBtn = e.target.closest('[data-fac]');

        if (attBtn) {
            const d = dossiers.find(x => x.id === Number(attBtn.dataset.att));
            if (!d || !estSolde(d)) return;
            try {
                await CSBPdf.attestation({
                    referent: famille ? famille.nom_referent : '',
                    adresse: famille ? famille.adresse : '',
                    code_postal: famille ? famille.code_postal : '',
                    ville: famille ? famille.ville : '',
                    saison: d.saison,
                    detail: d.detail_calcul,
                    datePaiement: dernierEncaissement(d.id)
                });
            } catch (err) { console.error(err); alert('Génération du PDF impossible : ' + err.message); }
        }

        if (facBtn) {
            const facture = factures.find(f => f.dossier_id === Number(facBtn.dataset.fac));
            if (!facture) return;
            try {
                await CSBPdf.facture(facture);
            } catch (err) { console.error(err); alert('Génération du PDF impossible : ' + err.message); }
        }
    });

    // --- Démarrage ---
    boot_init();
});
