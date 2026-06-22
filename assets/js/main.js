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
