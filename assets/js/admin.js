// =============================================================
// MODE ADMINISTRATEUR — admin.js  (factorisation login + modales)
// =============================================================
// Centralise la logique du « mode admin » commune aux 4 pages CMS
// (news, competitions, galerie, grades) : ouverture/fermeture de la
// modale de connexion, vérification du mot de passe, bascule vers le
// dashboard, fermeture du dashboard.
//
//   Admin.init({ onUnlock, onCloseAdmin })
//
// Les 4 pages partagent EXACTEMENT les mêmes IDs (#btn-open-login,
// #modal-login, #btn-login, #admin-password, #login-error,
// #modal-admin, #btn-close-admin), donc le helper les récupère
// lui-même. Chaque page ne fournit que 2 callbacks :
//   - onUnlock     : après connexion réussie (peupler la liste,
//                    réinitialiser le formulaire…). Le dashboard est
//                    déjà ouvert quand il est appelé.
//   - onCloseAdmin : à la fermeture du dashboard (rafraîchir le public).
//
// DEMAIN (Auth Supabase, cf. CLAUDE.md) : il suffira de remplacer la
// vérification du mot de passe ci-dessous par un appel au SDK.
// Les pages ne changeront pas.
//
// Chargé en vanilla JS via <script defer> : expose un objet global `Admin`.
// =============================================================

(function (global) {
    'use strict';

    // Mot de passe du bureau (site statique — futur remplacement : Supabase Auth).
    const ADMIN_PASSWORD = 'CSB';

    // IDs partagés par les 4 pages CMS.
    const IDS = {
        openLogin: 'btn-open-login',
        modalLogin: 'modal-login',
        closeLogin: 'btn-close-login',
        login: 'btn-login',
        password: 'admin-password',
        loginError: 'login-error',
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

        // Tenter la connexion.
        if (el.login) {
            el.login.addEventListener('click', () => {
                if (el.password.value === ADMIN_PASSWORD) {
                    el.password.value = '';
                    if (el.loginError) el.loginError.classList.add('hidden');
                    el.modalLogin.classList.add('hidden', 'opacity-0');
                    show(el.modalAdmin);
                    if (typeof hooks.onUnlock === 'function') hooks.onUnlock();
                } else if (el.loginError) {
                    el.loginError.classList.remove('hidden');
                }
            });
        }

        // Fermer le dashboard.
        if (el.closeAdmin) {
            el.closeAdmin.addEventListener('click', () => {
                hide(el.modalAdmin);
                if (typeof hooks.onCloseAdmin === 'function') hooks.onCloseAdmin();
            });
        }
    }

    // Exposition globale (pas de bundler : on attache l'API à window).
    global.Admin = { init };

})(window);
