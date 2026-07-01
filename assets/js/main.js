// --- SYSTÈME DE BLOCAGE DE PAGE (En construction) ---
// On vérifie si l'utilisateur est sur la page de construction
const isOnConstructionPage = window.location.pathname.includes('construction.html');

// On vérifie s'il a l'autorisation dans sa session
const hasAccess = sessionStorage.getItem('csb_access_granted') === 'true';

// S'il n'est PAS sur la page de construction ET qu'il n'a PAS l'accès -> Redirection forcée
// On préserve le hash (#...) de l'URL d'origine : indispensable pour les liens de
// récupération de mot de passe Supabase (#access_token=...&type=recovery), qui
// seraient sinon perdus dans ce rebond avant même que supabase.js ne les lise.
if (!isOnConstructionPage && !hasAccess) {
    // Mémorise la page d'origine pour que construction.html puisse
    // y renvoyer l'utilisateur après déverrouillage (indispensable
    // pour les liens de récupération de mot de passe Supabase).
    sessionStorage.setItem('csb_redirect_after_unlock', window.location.pathname);
    window.location.href = 'construction.html' + window.location.hash;
}
// Ce script s'exécute dès que la page HTML a fini de charger
document.addEventListener("DOMContentLoaded", () => {
    
    // Fonction réutilisable pour injecter un morceau de HTML.
    // onLoaded : callback exécuté une fois le composant injecté dans le DOM
    // (indispensable ici car un <script> injecté via outerHTML ne s'exécute pas).
    const loadComponent = (placeholderId, componentPath, onLoaded) => {
        const placeholder = document.getElementById(placeholderId);

        // Si la balise existe sur la page, on charge le composant
        if (placeholder) {
            fetch(componentPath)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Impossible de charger ${componentPath}`);
                    }
                    return response.text();
                })
                .then(html => {
                    // On remplace la balise vide par le vrai code HTML (Header ou Footer)
                    placeholder.outerHTML = html;
                    if (typeof onLoaded === 'function') onLoaded();
                })
                .catch(error => {
                    console.error("Erreur de rendu du composant :", error);
                });
        }
    };

    // On lance le chargement des deux composants
    loadComponent("header-placeholder", "./components/header.html", initMobileMenu);
    loadComponent("footer-placeholder", "./components/footer.html");

    // Gestion du menu hamburger (mobile / tablette).
    function initMobileMenu() {
        const burger = document.getElementById('btn-burger');
        const menu = document.getElementById('mobile-menu');
        if (!burger || !menu) return;

        const iconOpen = document.getElementById('burger-open');
        const iconClose = document.getElementById('burger-close');

        const openMenu = () => {
            menu.classList.remove('hidden');
            // Laisse le navigateur peindre l'état caché avant d'animer l'entrée
            // (même approche que les modales du site).
            setTimeout(() => menu.classList.remove('opacity-0', '-translate-y-3'), 10);
            burger.setAttribute('aria-expanded', 'true');
            iconOpen.classList.add('hidden');
            iconClose.classList.remove('hidden');
        };

        const closeMenu = () => {
            menu.classList.add('opacity-0', '-translate-y-3');
            burger.setAttribute('aria-expanded', 'false');
            iconOpen.classList.remove('hidden');
            iconClose.classList.add('hidden');
            setTimeout(() => menu.classList.add('hidden'), 200);
        };

        burger.addEventListener('click', () => {
            if (menu.classList.contains('hidden')) openMenu();
            else closeMenu();
        });

        // Fermer le menu après un clic sur un lien (utile pour les ancres de la même page).
        menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

        // Fermer avec la touche Échap.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !menu.classList.contains('hidden')) closeMenu();
        });
    }
});
