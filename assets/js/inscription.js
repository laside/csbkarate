// =============================================================
// INSCRIPTION EN LIGNE — inscription.js
// =============================================================
// Parcours multi-étapes (famille → adhérents → autorisations → récap) qui,
// à la validation, crée le compte référent (Supabase Auth) puis insère la
// famille, les adhérents (+ photos dans le bucket privé) et le dossier en
// statut « attente paiement ». Paiement « au club » (pas de paiement en ligne).
//
// PATTERN : le module gestion N'utilise PAS store.js (CRUD relationnel avec
// auth, différent du CMS). Il parle directement à window.sb sous la session
// du référent ; la RLS (migration 0005) restreint chaque écriture à sa famille.
//
// ⚠️ Les paiements ne sont PAS créés ici : seul le bureau encaisse (RLS).
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // --- Constantes métier ---
    const SAISON = '2026-2027';
    const ANNEE_RENTREE = 2026;          // âge évalué au 1er sept. de cette année
    const AGE_MIN_SELF = 13;             // self-défense : ≥ 13 ans au 1er sept.
    const AGE_MAJORITE = 18;             // < 18 → autorisation parentale requise
    const MAX_ADHERENTS = 5;

    // --- Échappement HTML (mêmes raisons que news.js / grades.js) ---
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // --- Raccourcis DOM ---
    const $ = (sel, root = document) => root.querySelector(sel);
    const form = $('#form-inscription');
    const container = $('#adherents-container');
    const template = $('#adherent-template');
    const btnAdd = $('#btn-add-adherent');
    const btnPrev = $('#btn-prev');
    const btnNext = $('#btn-next');
    const btnSubmit = $('#btn-submit');
    const navButtons = $('#nav-buttons');
    const statusBox = $('#submit-status');

    // --- État ---
    let currentStep = 1;
    let config = CSBTarifs.DEFAULT_CONFIG; // remplacé par la ligne `tarifs` si dispo

    // =========================================================
    // Chargement de la config tarifaire (lecture publique via RLS)
    // =========================================================
    sb.from('tarifs').select('*').eq('saison', SAISON).maybeSingle()
        .then(({ data, error }) => {
            if (!error && data) config = data;
            recompute();
        })
        .catch(() => recompute()); // en cas d'échec : on garde DEFAULT_CONFIG

    // =========================================================
    // Cartes adhérents
    // =========================================================
    function countCards() { return container.querySelectorAll('.adherent-card').length; }

    function addAdherent() {
        if (countCards() >= MAX_ADHERENTS) return;
        const card = template.content.firstElementChild.cloneNode(true);

        // Retirer cette carte
        $('[data-role="remove"]', card).addEventListener('click', () => {
            card.remove();
            refreshCards();
            recompute();
        });

        // Pass'Sport : afficher le champ « code » quand coché
        const passChk = $('[data-field="passSport"]', card);
        const passCode = $('[data-role="passsport-code"]', card);
        passChk.addEventListener('change', () => {
            passCode.classList.toggle('hidden', !passChk.checked);
            recompute();
        });

        // Recalcul + indices d'âge à chaque saisie pertinente
        card.addEventListener('input', recompute);
        card.addEventListener('change', recompute);
        $('[data-field="dateNaissance"]', card).addEventListener('change', () => updateHint(card));
        $('[data-field="coursType"]', card).addEventListener('change', () => updateHint(card));

        container.appendChild(card);
        refreshCards();
        recompute();
    }

    // Renumérote, gère l'affichage des boutons « Retirer » et de « Ajouter ».
    function refreshCards() {
        const cards = container.querySelectorAll('.adherent-card');
        cards.forEach((card, i) => {
            $('[data-role="num"]', card).textContent = i + 1;
            // On ne peut pas retirer s'il ne reste qu'un seul adhérent.
            $('[data-role="remove"]', card).classList.toggle('hidden', cards.length === 1);
        });
        const full = cards.length >= MAX_ADHERENTS;
        btnAdd.disabled = full;
        btnAdd.classList.toggle('opacity-40', full);
        btnAdd.classList.toggle('cursor-not-allowed', full);
    }

    // Âge atteint au 1er septembre de l'année de rentrée.
    function ageAuPremierSeptembre(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d)) return null;
        const ref = new Date(ANNEE_RENTREE, 8, 1); // mois 8 = septembre
        let age = ref.getFullYear() - d.getFullYear();
        const m = ref.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
        return age;
    }

    // Message d'aide sous une carte (éligibilité self-défense, minorité).
    function updateHint(card) {
        const hint = $('[data-role="hint"]', card);
        const age = ageAuPremierSeptembre($('[data-field="dateNaissance"]', card).value);
        const cours = $('[data-field="coursType"]', card).value;
        const msgs = [];
        let isError = false;

        if (age !== null && cours === 'Self-Defense' && age < AGE_MIN_SELF) {
            msgs.push(`La self-défense est réservée aux ${AGE_MIN_SELF} ans et plus (au 1er septembre).`);
            isError = true;
        }
        if (age !== null && age < AGE_MAJORITE) {
            msgs.push('Mineur : une autorisation parentale sera demandée à l\'étape 3.');
        }

        if (!msgs.length) { hint.classList.add('hidden'); return; }
        hint.className = 'mt-3 text-sm rounded-lg px-3 py-2 ' +
            (isError ? 'bg-red-50 text-csb-corail' : 'bg-blue-50 text-csb-dojo');
        hint.textContent = msgs.join(' ');
    }

    // Lit une carte adhérent → objet complet.
    function readCard(card) {
        const v = (f) => { const el = $(`[data-field="${f}"]`, card); return el ? el.value.trim() : ''; };
        const checked = (f) => { const el = $(`[data-field="${f}"]`, card); return !!(el && el.checked); };
        const fileEl = $('[data-field="photo"]', card);
        return {
            prenom: v('prenom'),
            nom: v('nom'),
            dateNaissance: v('dateNaissance'),
            genre: v('genre'),
            coursType: v('coursType'),
            grade: v('grade') || 'Ceinture Blanche',
            numeroPasseport: v('numeroPasseport'),
            membreBureau: checked('membreBureau'),
            droitImage: checked('droitImage'),
            passSport: checked('passSport'),
            passSportCode: v('passSportCode'),
            photoFile: fileEl && fileEl.files ? fileEl.files[0] : null
        };
    }

    function readAllAdherents() {
        return Array.from(container.querySelectorAll('.adherent-card')).map(readCard);
    }

    // =========================================================
    // Tarif (récap live)
    // =========================================================
    function recompute() {
        const detail = CSBTarifs.computeTarif(readAllAdherents(), config);
        $('#recap-aside').innerHTML = buildRecap(detail, {
            muted: 'text-white/60', divider: 'border-white/15', discount: 'text-emerald-300'
        });
        const full = $('#recap-full');
        if (full) full.innerHTML = '<div class="rounded-xl border border-csb-tatami p-5">' +
            buildRecap(detail, { muted: 'text-gray-500', divider: 'border-csb-tatami', discount: 'text-green-600' }) +
            '</div>';
    }

    function buildRecap(detail, p) {
        const f = CSBTarifs.formatEuros;
        if (!detail.lignes.length) {
            return `<p class="${p.muted}">Ajoutez un adhérent pour voir le tarif.</p>`;
        }
        let html = '<ul class="space-y-2">';
        detail.lignes.forEach((l) => {
            html += `<li class="flex flex-col mb-2">
                        <div class="flex justify-between gap-3">
                            <span>${esc(l.nom)} <span class="${p.muted}">· ${esc(l.label)}</span></span>
                            <span class="whitespace-nowrap">${f(l.montant)}</span>
                        </div>`;
            if (l.partClub > 0) {
                html += `<div class="flex justify-between pl-4 mt-0.5 text-xs ${p.muted}">
                            <span>↳ Licence & assurance</span>
                            <span>${f(l.partLicence)}</span>
                         </div>
                         <div class="flex justify-between pl-4 text-xs ${p.muted}">
                            <span>↳ Forfait club</span>
                            <span>${f(l.partClub)}</span>
                         </div>`;
            } else {
                html += `<div class="flex justify-between pl-4 mt-0.5 text-xs ${p.muted}">
                            <span>↳ Licence & assurance uniquement</span>
                            <span>${f(l.partLicence)}</span>
                         </div>`;
            }
            html += `</li>`;
        });
        html += '</ul>';
        html += `<div class="flex justify-between mt-3 pt-3 border-t ${p.divider}">
                    <span class="${p.muted}">Sous-total</span><span>${f(detail.sousTotal)}</span>
                 </div>`;
        if (detail.remiseFamille > 0) {
            html += `<div class="flex justify-between mt-1 ${p.discount}">
                        <span>Remise famille (${detail.nbInscrits} inscrits)</span>
                        <span>− ${f(detail.remiseFamille)}</span>
                     </div>`;
        }
        if (detail.remisePassSport > 0) {
            html += `<div class="flex justify-between mt-1 ${p.discount}">
                        <span>Pass'Sport (× ${detail.nbPassSport})</span>
                        <span>− ${f(detail.remisePassSport)}</span>
                     </div>`;
        }
        html += `<div class="flex justify-between items-center mt-3 pt-3 border-t ${p.divider} text-lg font-bold">
                    <span>Total</span><span>${f(detail.total)}</span>
                 </div>`;
        return html;
    }

    // =========================================================
    // Navigation entre étapes
    // =========================================================
    function showStep(n) {
        currentStep = n;
        form.querySelectorAll('[data-step]').forEach((sec) => {
            sec.classList.toggle('hidden', Number(sec.dataset.step) !== n);
        });
        // Pastilles d'étape
        document.querySelectorAll('[data-step-indicator]').forEach((li) => {
            const s = Number(li.dataset.stepIndicator);
            li.classList.toggle('is-active', s === n);
            li.classList.toggle('is-done', s < n);
        });
        // Boutons
        btnPrev.classList.toggle('invisible', n === 1);
        btnNext.classList.toggle('hidden', n === 4);

        if (n === 3) renderParental();
        if (n === 4) recompute();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Autorisations parentales : une case par adhérent mineur.
    function renderParental() {
        const wrap = $('#parental-container');
        const adherents = readAllAdherents();
        const mineurs = adherents.filter((a) => {
            const age = ageAuPremierSeptembre(a.dateNaissance);
            return age !== null && age < AGE_MAJORITE;
        });
        if (!mineurs.length) { wrap.innerHTML = ''; return; }
        let html = '<div class="bg-blue-50 rounded-xl p-4 space-y-3">' +
            '<p class="font-condensed uppercase tracking-wider text-csb-dojo text-sm">Autorisations parentales</p>';
        mineurs.forEach((a, i) => {
            const nom = `${a.prenom} ${a.nom}`.trim() || `Adhérent mineur ${i + 1}`;
            html += `<label class="consent">
                        <input type="checkbox" class="chk parental-chk" required>
                        <span>J'autorise mon enfant mineur <strong>${esc(nom)}</strong> à pratiquer
                              au sein du CSB Karaté et atteste être titulaire de l'autorité parentale.</span>
                     </label>`;
        });
        html += '</div>';
        wrap.innerHTML = html;
    }

    // =========================================================
    // Validation par étape
    // =========================================================
    function setStatus(type, msg) {
        statusBox.classList.remove('hidden', 'bg-red-50', 'text-csb-corail', 'bg-blue-50', 'text-csb-dojo');
        if (type === 'error') statusBox.classList.add('bg-red-50', 'text-csb-corail');
        else statusBox.classList.add('bg-blue-50', 'text-csb-dojo');
        statusBox.textContent = msg;
    }

    function validateStep(n) {
        if (n === 1) {
            const get = (f) => $(`[data-field="${f}"]`).value.trim();
            if (!get('nomReferent')) return 'Indiquez le nom du référent.';
            const email = get('email');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email invalide.';
            if (get('password').length < 6) return 'Le mot de passe doit faire au moins 6 caractères.';
            if (get('password') !== get('password2')) return 'Les deux mots de passe ne correspondent pas.';
            if (!get('telephone')) return 'Indiquez un téléphone d\'urgence.';
            return null;
        }
        if (n === 2) {
            const cards = container.querySelectorAll('.adherent-card');
            if (!cards.length) return 'Ajoutez au moins un adhérent.';
            for (let i = 0; i < cards.length; i++) {
                const a = readCard(cards[i]);
                const label = a.prenom || `l'adhérent ${i + 1}`;
                if (!a.prenom || !a.nom) return `Nom et prénom requis pour ${label}.`;
                if (!a.dateNaissance) return `Date de naissance requise pour ${label}.`;
                if (!a.genre) return `Genre requis pour ${label}.`;
                if (!a.coursType) return `Type de cours requis pour ${label}.`;
                const age = ageAuPremierSeptembre(a.dateNaissance);
                if (a.coursType === 'Self-Defense' && age !== null && age < AGE_MIN_SELF) {
                    return `${label} : la self-défense est réservée aux ${AGE_MIN_SELF} ans et plus.`;
                }
            }
            return null;
        }
        if (n === 3) {
            if (!$('#consent-reglement').checked) return 'Acceptez le règlement intérieur.';
            if (!$('#consent-medical').checked) return 'Confirmez l\'engagement de certificat médical.';
            if (!$('#consent-urgence').checked) return 'Confirmez l\'autorisation d\'intervention d\'urgence.';
            const parentaux = document.querySelectorAll('.parental-chk');
            for (const chk of parentaux) {
                if (!chk.checked) return 'Cochez toutes les autorisations parentales.';
            }
            return null;
        }
        return null;
    }

    btnNext.addEventListener('click', () => {
        const err = validateStep(currentStep);
        if (err) { alert(err); return; }
        showStep(Math.min(currentStep + 1, 4));
    });
    btnPrev.addEventListener('click', () => showStep(Math.max(currentStep - 1, 1)));
    btnAdd.addEventListener('click', addAdherent);

    // =========================================================
    // Soumission finale
    // =========================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Re-valider les étapes 1→3 ; sauter à la première en erreur.
        for (let n = 1; n <= 3; n++) {
            const err = validateStep(n);
            if (err) { showStep(n); alert(err); return; }
        }

        btnSubmit.disabled = true;
        const labelInitial = btnSubmit.textContent;
        btnSubmit.textContent = 'Enregistrement…';
        setStatus('info', 'Création de votre compte et de votre dossier…');

        try {
            const famille = {
                nomReferent: $('[data-field="nomReferent"]').value.trim(),
                email: $('[data-field="email"]').value.trim(),
                password: $('[data-field="password"]').value,
                telephone: $('[data-field="telephone"]').value.trim(),
                adresse: $('[data-field="adresse"]').value.trim(),
                codePostal: $('[data-field="codePostal"]').value.trim(),
                ville: $('[data-field="ville"]').value.trim()
            };
            const adherents = readAllAdherents();
            const detail = CSBTarifs.computeTarif(adherents, config);

            // 1) Compte référent (Auth). « Confirm email » désactivé => session directe.
            const { data: signup, error: authErr } = await sb.auth.signUp({
                email: famille.email,
                password: famille.password,
                options: { data: { nom_referent: famille.nomReferent } }
            });
            if (authErr) throw new Error(traduireAuthErreur(authErr.message));
            if (!signup.session) {
                throw new Error('Compte créé : confirmez votre email puis revenez finaliser l\'inscription.');
            }
            const uid = signup.user.id;

            // 2) Famille (upsert : ré-essai possible sans doublon).
            const { data: famRow, error: famErr } = await sb.from('familles')
                .upsert({
                    referent_user_id: uid,
                    nom_referent: famille.nomReferent,
                    telephone_urgence: famille.telephone,
                    adresse: famille.adresse,
                    code_postal: famille.codePostal,
                    ville: famille.ville
                }, { onConflict: 'referent_user_id' })
                .select('id').single();
            if (famErr) throw famErr;
            const familleId = famRow.id;

            // 3) Photos (bucket privé) puis adhérents.
            const rows = [];
            for (let i = 0; i < adherents.length; i++) {
                const a = adherents[i];
                let photoPath = '';
                if (a.photoFile) {
                    const ext = (a.photoFile.name.split('.').pop() || 'jpg').toLowerCase();
                    const path = `${uid}/${Date.now()}-${i}.${ext}`;
                    const { error: upErr } = await sb.storage.from('dossiers')
                        .upload(path, a.photoFile, { upsert: true });
                    if (upErr) console.warn('Photo non envoyée :', upErr.message);
                    else photoPath = path;
                }
                rows.push({
                    famille_id: familleId,
                    nom: a.nom,
                    prenom: a.prenom,
                    date_naissance: a.dateNaissance || null,
                    genre: a.genre || null,
                    email: famille.email,
                    cours_type: a.coursType || null,
                    membre_bureau: a.membreBureau,
                    passeport_sportif: !!a.numeroPasseport,
                    numero_passeport: a.numeroPasseport,
                    pass_sport: a.passSport,
                    pass_sport_code: a.passSportCode,
                    droit_image: a.droitImage,
                    photo_path: photoPath,
                    grade_actuel: a.grade,
                    statut_dossier: 'Incomplet' // statut combiné dérivé ensuite par le bureau (pièces × règlement)
                });
            }
            const { error: adhErr } = await sb.from('adherents').insert(rows);
            if (adhErr) throw adhErr;

            // 4) Dossier (le « panier ») en attente de paiement. Pas de `paiements` ici.
            const splitWish = Number($('#paiement-split').value) || 1;
            const { error: dosErr } = await sb.from('dossiers').insert({
                famille_id: familleId,
                saison: SAISON,
                montant_total: detail.total,
                detail_calcul: { ...detail, souhaitReglement: splitWish, modePaiement: 'au_club' },
                mode_paiement: 'au_club',
                statut: 'Incomplet'
            });
            if (dosErr) throw dosErr;

            // 5) Succès.
            form.querySelectorAll('[data-step]').forEach((s) => s.classList.add('hidden'));
            navButtons.classList.add('hidden');
            $('#stepper').classList.add('opacity-40');
            $('#success-panel').classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            console.error(err);
            setStatus('error', (err && err.message) ? err.message
                : 'Une erreur est survenue. Si un compte a été créé, contactez le club avant de resoumettre.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = labelInitial;
        }
    });

    // Messages d'erreur Auth plus clairs en français.
    function traduireAuthErreur(msg) {
        if (/already registered|already been registered|exists/i.test(msg)) {
            return 'Un compte existe déjà avec cet email. Connectez-vous depuis votre espace pour ajouter des adhérents.';
        }
        if (/password/i.test(msg)) return 'Mot de passe trop faible (6 caractères minimum).';
        return msg;
    }

    // --- Initialisation ---
    addAdherent();   // une première carte
    showStep(1);
});
