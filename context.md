CONTEXTE DU PROJET : CSB KARATÉ BRÉTIGNY

1. PROFIL & RÔLE

Rôle de l'IA : Développeur Web Senior & Expert UI/UX.
Ton et Méthode :

Professionnel, pédagogique et collaboratif.

L'objectif est de produire un code propre, moderne, léger et facile à maintenir pour une association sportive.

Approche pragmatique : pas de sur-ingénierie (over-engineering). Utilisation de Vanilla JS plutôt que de frameworks lourds (React/Vue) pour s'adapter parfaitement à un hébergement statique gratuit (GitHub Pages).

Gardien de la charte graphique : respect strict du Brand Book (Manuel de marque) défini.

2. STACK TECHNIQUE

HTML/CSS : HTML5 sémantique, CSS3.

Framework CSS : Tailwind CSS (chargé via CDN pour la simplicité, avec configuration personnalisée dans assets/js/tailwind.js).

JavaScript : Vanilla JS (ES6+). Utilisation de l'API fetch pour charger les données (JSON) et les composants (Header/Footer).

Base de Données / CMS : "Git-based CMS". Pas de base SQL. Les données dynamiques sont stockées dans des fichiers .json hébergés directement sur le dépôt GitHub.

Hébergement : GitHub Pages (Statique).

Typographies (Google Fonts) :

Cormorant Garamond (Prestige) : Réservée au H1 principal.

Barlow Condensed (Rigueur) : Pour les H2, H3, menus et boutons (en majuscules, tracking espacé).

Inter (Clarté) : Pour le corps du texte (paragraphes, horaires).

3. RÈGLES DE CODE & ARCHITECTURE

Structure des fichiers :

/
├── index.html, news.html, wadoryu.html... (Pages spécifiques)
├── components/
│   ├── header.html (En-tête isolé)
│   └── footer.html (Pied de page isolé)
├── data/
│   └── news.json (Base de données du blog)
└── assets/
    ├── css/style.css (Classes globales, animations, Glassmorphism)
    ├── js/
    │   ├── tailwind.js (Config Tailwind, couleurs et polices de la charte)
    │   ├── main.js (Script global : injection Header/Footer, animations)
    │   └── news.js (Script spécifique aux actus : affichage et Mode Admin)
    └── photos/, docs/ (Ressources statiques)


Design System (Architecture Bento) :

Le site utilise une mise en page en "tuiles" (Bento grid).

Palette de couleurs stricte :

Blanc Washi (#FAF9F6) - Fond principal

Bleu Encre (#0D1B2A) - Textes principaux

Bleu Dojo (#1B263B) - Fonds de sections sombres

Rouge Corail (#E63946) - Accents, boutons, bordures actives

Gris Tatami (#E0E1DD) - Bordures et séparateurs

Composants HTML : Remplacement de <header> et <footer> par des balises <div id="header-placeholder"></div> dans chaque page, remplies dynamiquement par main.js.

4. ÉTAT ACTUEL DU PROJET

Architecture validée : Site statique multi-pages optimisé. Abandon de l'approche SPA (Single Page Application) au profit de fichiers HTML séparés, jugés plus robustes et simples à maintenir via GitHub.

Fonctionnalités opérationnelles :

Système de Composants : Le header et le footer s'injectent automatiquement sur toutes les pages via main.js.

Design System "Bento" intégré : Grilles de cartes responsives, refonte visuelle complète respectant le manuel de marque de l'association.

Carrousel d'accueil dynamique : Affiche automatiquement les 3 dernières actualités sur index.html en lisant le fichier news.json.

Mode Administrateur (CMS sans serveur) :

Présent sur news.html (déverrouillé via un bouton discret et le mot de passe "CSB").

Permet d'ajouter, modifier et supprimer des actualités.

Gère l'ajout de photos (nom du fichier relié au dossier assets/photos/).

Exporte un fichier news.json propre, que l'admin doit simplement glisser-déposer sur GitHub pour mettre le site à jour.

Pages créées & refondues :

index.html (Accueil complet avec horaires, tarifs)

wadoryu.html (Histoire du style)

news.html (Actualités + Admin)

mentions-legales.html (Conformité RGPD et éditeur)

Pages en construction préparées : club.html, competitions.html, grades.html, galerie.html.

5. PROCHAINES ÉTAPES (TODO)

[ ] Contenu des pages secondaires : Remplacer les gabarits "Page en construction" par le vrai contenu pour club.html (histoire du club, professeurs), competitions.html, grades.html (programmes techniques), et galerie.html.

[ ] Liens finaux : Insérer le lien d'inscription HelloAsso définitif dans la section "Informations Pratiques" de l'accueil.

[ ] Mise à jour des contacts : Remplacer les balises [À REMPLIR] dans mentions-legales.html (nom du président, email de contact).

[ ] Extension du mode Admin (Optionnel) : Si besoin, dupliquer la logique du news.json pour d'autres sections qui nécessitent des mises à jour régulières (ex: galerie photos, résultats de compétitions).
