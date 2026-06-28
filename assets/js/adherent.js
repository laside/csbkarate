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
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session) return showDashboard();
        } catch (err) {
            console.error(err);
        }
        showGate();
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
        }
    }

    gateBtn.addEventListener('click', login);
    gatePwd.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

    // Mot de passe oublié (même mécanique que admin.js : redirectTo dynamique).
    $('#gate-forgot').addEventListener('click', async () => {
        const email = gateEmail.value.trim();
        gateError.classList.add('hidden');
        gateInfo.classList.add('hidden');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            gateError.textContent = 'Saisissez d\'abord votre email ci-dessus.';
            gateError.classList.remove('hidden');
            return;
        }
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) {
            gateError.textContent = error.message;
            gateError.classList.remove('hidden');
            return;
        }
        gateInfo.textContent = 'Un email de réinitialisation vous a été envoyé.';
        gateInfo.classList.remove('hidden');
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
    // Rendu : coordonnées de la famille
    // =========================================================
    function renderFamille() {
        const card = $('#famille-card');
        if (!famille) {
            card.innerHTML = `<p class="text-gray-500">Aucun dossier rattaché à ce compte.
                <a href="./inscription.html" class="text-csb-corail font-bold hover:underline">Démarrer une inscription</a>.</p>`;
            return;
        }
        const ligneAdresse = [famille.adresse, [famille.code_postal, famille.ville].filter(Boolean).join(' ')]
            .filter(Boolean).join(' · ');
        card.innerHTML = `
            <p class="font-condensed uppercase tracking-wider text-[11px] text-gray-400 mb-1">Référent du dossier</p>
            <p class="text-2xl font-bold text-csb-encre">${esc(famille.nom_referent || '—')}</p>
            <div class="text-sm text-gray-500 mt-2 space-y-0.5">
                ${ligneAdresse ? `<p>${esc(ligneAdresse)}</p>` : ''}
                ${famille.telephone_urgence ? `<p>Tél. urgence : ${esc(famille.telephone_urgence)}</p>` : ''}
            </div>`;
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
