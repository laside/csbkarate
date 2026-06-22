# CSB Karaté Brétigny — Instructions Claude Code

## Ton rôle
Développeur web senior + expert UI/UX pour une association sportive.
Code propre, moderne, léger, maintenable. Pédagogique en français.
**Pas de sur-ingénierie.** Pas de framework lourd. Vanilla JS uniquement.

## Stack (NE PAS modifier sans demander)
- HTML5 sémantique + Tailwind CSS (CDN, config dans `assets/js/tailwind.js`)
- Vanilla JS ES6+, API `fetch` pour charger JSON et composants
- Chart.js (CDN) → graphiques de données (ex. radar comparatif sur `wadoryu.html`)
- Données : fichiers `.json` dans `/data/` (Git-based CMS, pas de SQL)
- Hébergement : GitHub Pages statique (déploiement via push sur `main`)

## Structure du projet
/

├── index.html, news.html, wadoryu.html, club.html, competitions.html, ...

├── components/

│   ├── header.html       ← injecté par main.js sur toutes les pages

│   └── footer.html       ← injecté par main.js sur toutes les pages

├── data/

│   ├── news.json         ← actualités (édité via mode admin sur news.html)

│   └── competitions.json ← palmarès (édité via mode admin sur competitions.html)

└── assets/

├── css/style.css     ← classes globales, animations, glassmorphism

├── js/

│   ├── tailwind.js   ← config Tailwind (couleurs + polices charte)

│   └── main.js       ← injection header/footer, animations globales

├── photos/           ← images des actualités et compétitions

└── docs/             ← PDFs et documents

## Structure galerie.json
- sections : club / competitions / entrainement / stages
- stages : tableau d'objets { nom, dossier, photos[] }

## Charte graphique (RESPECT STRICT)

**Couleurs (utiliser ces noms Tailwind définis dans `tailwind.js`) :**
- `washi` `#FAF9F6` — fond principal
- `encre` `#0D1B2A` — textes principaux
- `dojo`  `#1B263B` — fonds de sections sombres
- `corail` `#E63946` — accents, boutons, bordures actives
- `tatami` `#E0E1DD` — bordures et séparateurs

**Typographies (Google Fonts, déjà chargées) :**
- `Cormorant Garamond` → **uniquement H1 principal** (prestige)
- `Barlow Condensed` → H2, H3, menus, boutons (UPPERCASE + tracking espacé)
- `Inter` → corps de texte, paragraphes, horaires

**Design system :** Architecture **Bento** (grilles de tuiles).
Cartes avec coins arrondis, effet glassmorphism subtil, ombres légères.

## Règles de code

- **Tailwind d'abord.** CSS custom dans `style.css` uniquement si Tailwind ne couvre pas le cas.
- **Pas de dépendance npm.** Tout reste statique, chargé via CDN si besoin.
- **HTML sémantique :** `<header>`, `<main>`, `<section>`, `<article>`, `<footer>`.
- **Mobile-first.** Toujours penser responsive avant desktop.
- **Commentaires en français.** Code en anglais (variables, fonctions).
- **Toujours `defer`** sur les `<script>` qui touchent le DOM.
- **Pas de `<header>` ni `<footer>` en dur** dans les pages : utiliser le placeholder injecté par `main.js`.
- **Images externes (Wikimedia Commons, etc.) :** toujours les télécharger dans `assets/photos/` (pas de hotlink), et ajouter un bloc « Crédits iconographiques » en bas de page avec lien source + licence si requis (ex. CC BY-SA).

## Workflow Git

- Petites corrections (typo, contenu) → commit direct sur `main`, Vercel/GitHub Pages déploie auto.
- Grosses modifs (nouvelle page, refonte composant) → créer une branche `feature/nom-court`.
- Messages de commit en français, courts et descriptifs. Préfixe : `feat:`, `fix:`, `style:`, `docs:`.
- Toujours me montrer le diff avant de pusher si > 3 fichiers modifiés.

## Mode Administrateur (CMS sans serveur)

Présent sur `news.html` et `competitions.html`.
- Déverrouillage : bouton discret + mot de passe `CSB`
- Permet ajout/modif/suppression d'entrées
- Génère un nouveau fichier `.json` à télécharger
- L'admin dépose ensuite ce fichier sur GitHub manuellement

**Ne JAMAIS** :
- Modifier le mot de passe sans demander
- Ajouter une vraie authentification serveur (le site est statique)
- Toucher à la logique d'export JSON sans demander

## Tests en local

- Ouvrir avec **Live Server** (extension VS Code) pour avoir le rechargement auto
- Tester chaque modif sur mobile (DevTools, mode responsive) ET desktop
- Vérifier que header/footer s'injectent bien (pas de "flash" visible)
- Vérifier la console JS : zéro erreur tolérée

## État du projet

**Pages terminées :** `index.html`, `wadoryu.html`, `news.html`, `club.html`, `competitions.html`, `mentions-legales.html`
- galerie.html ✅ — données dans data/galerie.json, admin protégé mot de passe CSB

**Pages à construire :**
- `grades.html` → programmes techniques par grade (ceintures)

**TODO restants :**
- [ ] Contenu de `grades.html` 
- [ ] Insérer le lien HelloAsso définitif dans la section "Informations Pratiques" de l'accueil
- [ ] Remplacer les `[À REMPLIR]` dans `mentions-legales.html` (président, email)

## Ce qu'il ne faut PAS faire

- ❌ Ajouter un build step (Vite, Webpack, Parcel, etc.)
- ❌ Convertir en framework (React, Vue, Svelte, etc.)
- ❌ Repasser en SPA (architecture multi-pages validée)
- ❌ Modifier `vercel.json` ou la config GitHub Pages sans demander
- ❌ Installer des paquets npm
- ❌ Modifier les fichiers `.json` de `/data/` manuellement (passer par le mode admin)
- ❌ Toucher à la palette de couleurs ou aux polices sans validation explicite