// =============================================================
// MODE ADMINISTRATEUR — admin.js  (factorisation login + modales)
// =============================================================
// Centralise la logique du « mode admin » commune aux pages CMS
// (news, competitions, galerie, grades, et la saison sur index.html) :
// ouverture/fermeture de la modale de connexion, AUTHENTIFICATION,
// bascule vers le dashboard, fermeture du dashboard (avec déconnexion).
//
//   Admin.init({ onUnlock, onCloseAdmin })
//
// AUTHENTIFICATION : vraie Auth Supabase (signInWithPassword). Le compte
// admin est unique : l'email est constant (window.CSB_ADMIN_EMAIL, défini
// dans supabase.js) et l'admin ne saisit que son mot de passe. C'est la
// session Auth qui autorise ensuite les écritures en base (RLS).
// Le client Supabase est fourni par supabase.js (window.sb).
//
// Les pages partagent EXACTEMENT les mêmes IDs (#btn-open-login,
// #modal-login, #btn-login, #admin-password, #login-error,
// #modal-admin, #btn-close-admin), donc le helper les récupère
// lui-même. Chaque page ne fournit que 2 callbacks :
//   - onUnlock     : après connexion réussie (peupler la liste,
//                    réinitialiser le formulaire…). Le dashboard est
//                    déjà ouvert quand il est appelé.
//   - onCloseAdmin : à la fermeture du dashboard (rafraîchir le public).
//
// RÉCUPÉRATION DE MOT DE PASSE : enregistrée plus bas, indépendamment de
// init() — actif sur toute page chargeant ce script, même sans modales.
//
// Chargé en vanilla JS via <script defer> : expose un objet global `Admin`.
// =============================================================

(function (global) {
    'use strict';

    // IDs partagés par les pages CMS.
    const IDS = {
        openLogin: 'btn-open-login',
        modalLogin: 'modal-login',
        closeLogin: 'btn-close-login',
        login: 'btn-login',
        password: 'admin-password',
        loginError: 'login-error',
        forgotPassword: 'btn-forgot-password',
        modalAdmin: 'modal-admin',
        closeAdmin: 'btn-close-admin'
    };

    // Affiche une modale en fondu (retire 'hidden' puis 'opacity-0' au prochain paint).
    function show(modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    // Masque une modale en fondu (ajoute 'opacity-0' puis 'hidden' après l'animation).
    function hide(modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    /**
     * Initialise le mode administrateur de la page courante.
     * @param {{ onUnlock?: Function, onCloseAdmin?: Function }} [hooks]
     */
    function init(hooks = {}) {
        const el = {};
        for (const key in IDS) el[key] = document.getElementById(IDS[key]);

        // Page sans modales admin : on ne fait rien.
        if (!el.modalLogin || !el.modalAdmin) return;

        // Ouvrir la connexion.
        if (el.openLogin) {
            el.openLogin.addEventListener('click', () => show(el.modalLogin));
        }

        // Fermer la connexion.
        if (el.closeLogin) {
            el.closeLogin.addEventListener('click', () => hide(el.modalLogin));
        }

        // Tenter la connexion (Supabase Auth).
        if (el.login) {
            el.login.addEventListener('click', async () => {
                if (el.loginError) el.loginError.classList.add('hidden');
                el.login.disabled = true;
                try {
                    const { error } = await global.sb.auth.signInWithPassword({
                        email: global.CSB_ADMIN_EMAIL,
                        password: el.password.value
                    });
                    if (error) throw error;

                    el.password.value = '';
                    el.modalLogin.classList.add('hidden', 'opacity-0');
                    show(el.modalAdmin);
                    if (typeof hooks.onUnlock === 'function') hooks.onUnlock();
                } catch (err) {
                    console.error(err);
                    if (el.loginError) el.loginError.classList.remove('hidden');
                } finally {
                    el.login.disabled = false;
                }
            });
        }

        // Fermer le dashboard (et clore la session Auth).
        if (el.closeAdmin) {
            el.closeAdmin.addEventListener('click', async () => {
                hide(el.modalAdmin);
                try {
                    await global.sb.auth.signOut();
                } catch (err) {
                    console.error(err);
                }
                if (typeof hooks.onCloseAdmin === 'function') hooks.onCloseAdmin();
            });
        }

        // Demande de réinitialisation de mot de passe depuis le site
        if (el.forgotPassword) {
            el.forgotPassword.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!confirm("Voulez-vous recevoir un e-mail pour réinitialiser le mot de passe administrateur ?")) return;
                
                try {
                    const { error } = await global.sb.auth.resetPasswordForEmail(global.CSB_ADMIN_EMAIL, {
                        redirectTo: window.location.origin
                    });
                    if (error) throw error;
                    alert("Un e-mail de réinitialisation a été envoyé à l'adresse de l'administrateur.");
                    hide(el.modalLogin); // On peut fermer la modale
                } catch (err) {
                    console.error(err);
                    alert("Erreur lors de l'envoi de l'e-mail : " + (err.message || err));
                }
            });
        }
    }

    // =========================================================
    // RÉCUPÉRATION DE MOT DE PASSE (lien e-mail « mot de passe oublié »)
    // =========================================================
    // Quand l'admin clique sur le lien reçu par e-mail (envoyé depuis le
    // dashboard Supabase), il est redirigé vers le site avec un token et
    // reconnecté avec une session TEMPORAIRE. Supabase émet alors l'événement
    // PASSWORD_RECOVERY via onAuthStateChange. On demande le nouveau mot de
    // passe et on l'enregistre via updateUser().
    //
    // Indépendant des modales login/dashboard (pas besoin qu'elles existent
    // sur la page d'arrivée) : enregistré au chargement du script, pas dans
    // init(). L'ordre des <script> (supabase.js avant admin.js, partout)
    // garantit que window.sb est déjà prêt à ce stade.
    if (global.sb) {
        global.sb.auth.onAuthStateChange(async (event) => {
            if (event !== 'PASSWORD_RECOVERY') return;

            const nouveauMdp = prompt('Lien de récupération validé.\nSaisissez votre nouveau mot de passe :');
            if (!nouveauMdp) return; // annulé par l'admin

            try {
                const { error } = await global.sb.auth.updateUser({ password: nouveauMdp });
                if (error) throw error;
                alert('Mot de passe mis à jour ✅\nVous êtes connecté avec votre nouveau mot de passe.');
            } catch (err) {
                console.error(err);
                alert('Échec de la mise à jour du mot de passe.\n' + (err.message || err));
            }
        });
    }

    // Exposition globale (pas de bundler : on attache l'API à window).
    global.Admin = { init };

})(window);
