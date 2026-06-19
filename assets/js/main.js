// Ce script s'exécute dès que la page HTML a fini de charger
document.addEventListener("DOMContentLoaded", () => {
    
    // Fonction réutilisable pour injecter un morceau de HTML
    const loadComponent = (placeholderId, componentPath) => {
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
                })
                .catch(error => {
                    console.error("Erreur de rendu du composant :", error);
                });
        }
    };

    // On lance le chargement des deux composants
    loadComponent("header-placeholder", "./components/header.html");
    loadComponent("footer-placeholder", "./components/footer.html");
});
