// =============================================================
// MODE ADMINISTRATEUR — admin.js  (factorisation login + modales)
// =============================================================
// Centralise la logique du « mode admin » commune aux 4 pages CMS
// (news, competitions, galerie, grades) : ouverture/fermeture de la
// modale de connexion, AUTHENTIFICATION, bascule vers le dashboard,
// fermeture du dashboard (avec déconnexion).
//
//   Admin.init({ onUnlock, onCloseAdmin })
//
// AUTHENTIFICATION : vraie Auth Supabase (signInWithPassword). Le compte
// admin est unique : l'email est constant (window.CSB_ADMIN_EMAIL, défini
// dans supabase.js) et l'admin ne saisit que son mot de passe. C'est la
// session Auth qui autorise ensuite les écritures en base (RLS).
// Le client Supabase est fourni par supabase.js (window.sb).
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
// Chargé en vanilla JS via <script defer> : expose un objet global `Admin`.
// =============================================================

(function (global) {
    'use strict';

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
    }

    // Exposition globale (pas de bundler : on attache l'API à window).
    global.Admin = { init };

})(window);
