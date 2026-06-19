CONTEXTE DU PROJET : CSB KARATÉ BRÉTIGNY

PROFIL & RÔLE

Rôle de l'IA : Développeur Web Senior & Expert UI/UX.
Ton et Méthode :

Professionnel, pédagogique et collaboratif.

L'objectif est de produire un code propre, moderne, léger et facile à maintenir pour une association sportive.

Approche pragmatique : pas de sur-ingénierie (over-engineering). Utilisation de Vanilla JS plutôt que de frameworks lourds (React/Vue) pour s'adapter parfaitement à un hébergement statique gratuit (GitHub Pages).

Gardien de la charte graphique : respect strict du Brand Book (Manuel de marque) défini.

STACK TECHNIQUE

HTML/CSS : HTML5 sémantique, CSS3.
Framework CSS : Tailwind CSS (chargé via CDN pour la simplicité, avec configuration personnalisée dans assets/js/tailwind.js).
JavaScript : Vanilla JS (ES6+). Utilisation de l'API fetch pour charger les données (JSON) et les composants (Header/Footer).
Base de Données / CMS : "Git-based CMS". Pas de base SQL. Les données dynamiques sont stockées dans des fichiers .json hébergés directement sur le dépôt GitHub.
Hébergement : GitHub Pages (Statique).
Typographies (Google Fonts) :

Cormorant Garamond (Prestige) : Réservée au H1 principal.

Barlow Condensed (Rigueur) : Pour les H2, H3, menus et boutons (en majuscules, tracking espacé).

Inter (Clarté) : Pour le corps du texte (paragraphes, horaires).

RÈGLES DE CODE & ARCHITECTURE

Structure des fichiers :
/
├── index.html, news.html, wadoryu.html, club.html, competitions.html... (Pages spécifiques)
├── components/
│   ├── header.html (En-tête isolé)
│   └── footer.html (Pied de page isolé)
├── data/
│   ├── news.json (Base de données du blog)
│   └── competitions.json (Base de données du palmarès)
└── assets/
├── css/style.css (Classes globales, animations, Glassmorphism)
├── js/
│   ├── tailwind.js (Config Tailwind, couleurs et polices de la charte)
│   └── main.js (Script global : injection Header/Footer, animations)
└── photos/, docs/ (Ressources statiques)

Design System (Architecture Bento) :
Le site utilise une mise en page en "tuiles" (Bento grid).
Palette de couleurs stricte :

Blanc Washi (#FAF9F6) - Fond principal

Bleu Encre (#0D1B2A) - Textes principaux

Bleu Dojo (#1B263B) - Fonds de sections sombres

Rouge Corail (#E63946) - Accents, boutons, bordures actives

Gris Tatami (#E0E1DD) - Bordures et séparateurs

Composants HTML : Remplacement de  et  par des balises  dans chaque page, remplies dynamiquement par main.js.

ÉTAT ACTUEL DU PROJET

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

[Nouveau] Système de Palmarès Temporel & Diaporama Photo :

Présent sur competitions.html, alimenté dynamiquement par le fichier competitions.json.

Tri chronologique intelligent automatique : les compétitions s'organisent automatiquement de la plus récente à la plus ancienne en cours de traitement, facilitant la saisie administrative.

Structure asymétrique basée sur le modèle visuel demandé :

Si une ou plusieurs photos sont présentes : affichage sur deux blocs distincts (Informations et palmarès à gauche, carrousel d'images à diaporama interactif et fléchettes de navigation à droite).

Si aucune photo n'est présente : le bloc palmarès s'étend sur toute la largeur (100%) et réorganise automatiquement ses puces sur deux colonnes équilibrées pour éviter les espaces vides.

Mode Administrateur intégré (mot de passe "CSB") gérant le support multi-images (noms de fichiers séparés par des virgules), l'édition, la suppression et l'exportation autonome du fichier de données.

Pages créées & refondues :

index.html (Accueil complet avec horaires, tarifs)

wadoryu.html (Histoire du style)

news.html (Actualités + Admin)

club.html (Présentation complète, profil de l'équipe enseignante et bureau de l'association)

competitions.html (Timeline dynamique des résultats, carrousel d'images + Admin complet)

mentions-legales.html (Conformité RGPD et éditeur)

Pages en construction préparées : grades.html, galerie.html.

PROCHAINES ÉTAPES (TODO)

[X] Contenu des pages secondaires : Remplacer le gabarit "Page en construction" par le vrai contenu pour club.html (histoire du club, professeurs).
[X] Contenu des pages secondaires : Remplacer le gabarit "Page en construction" pour competitions.html (Timeline, tri auto, carrousel adaptatif et gestionnaire JSON bureau).
[ ] Contenu des pages secondaires restantes : Remplacer les gabarits "Page en construction" pour grades.html (programmes techniques) et galerie.html.
[ ] Liens finaux : Insérer le lien d'inscription HelloAsso définitif dans la section "Informations Pratiques" de l'accueil.
[ ] Mise à jour des contacts : Remplacer les balises [À REMPLIR] dans mentions-legales.html (nom du président, email de contact).
