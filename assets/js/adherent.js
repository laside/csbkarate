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
            renderFamille(); renderAdherents(); renderDossiers();
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

    function renderAdherents() {
        const grid = $('#adherents-grid');
        if (!adherents.length) {
            grid.innerHTML = '<p class="text-gray-500">Aucun adhérent enregistré.</p>';
            return;
        }
        grid.innerHTML = adherents.map((a) => {
            const age = ageOf(a.date_naissance);
            const meta = [COURS_LABEL[a.cours_type] || '', age === null ? '' : `${age} ans`].filter(Boolean).join(' · ');
            return `
                <div class="bg-white rounded-2xl border border-csb-tatami p-5">
                    <p class="text-lg font-bold text-csb-encre">${esc(a.prenom)} ${esc(a.nom)}</p>
                    <p class="text-sm text-gray-400 mb-3">${esc(meta)}</p>
                    <span class="inline-block text-xs font-condensed uppercase tracking-wider bg-csb-washi border border-csb-tatami rounded-full px-3 py-1 text-csb-dojo">
                        ${esc(a.grade_actuel || 'Ceinture Blanche')}
                    </span>
                </div>`;
        }).join('');
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
