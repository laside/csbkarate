# CSB Karaté Brétigny — Instructions Claude Code

## Ton rôle
Développeur web senior + expert UI/UX pour une association sportive.
Code propre, moderne, léger, maintenable. Pédagogique en français.
**Pas de sur-ingénierie.** Pas de framework lourd. Vanilla JS uniquement.

## Stack (NE PAS modifier sans demander)
- HTML5 sémantique + Tailwind CSS (CDN, config dans `assets/js/tailwind.js`)
- Vanilla JS ES6+, API `fetch` pour charger JSON et composants
- Chart.js (CDN) → graphiques de données (ex. radar comparatif sur `wadoryu.html`)
- Données : **bascule Supabase en cours** (cf. section BDD). `news` est servi par Supabase (Postgres + Auth, SDK via CDN ESM) ; `competitions`, `galerie`, `grades` restent sur fichiers `.json` dans `/data/` (Git-based CMS) jusqu'à leur migration. Le routage par collection est dans `store.js`.
- Hébergement : **Vercel** (déploiement auto sur push `main` = prod, preview sur les autres branches). Pas de `vercel.json` : config zéro. Vercel Web Analytics actif sur chaque page.

## Structure du projet
/

├── index.html, news.html, wadoryu.html, club.html, competitions.html, ...

├── components/

│   ├── header.html       ← injecté par main.js sur toutes les pages

│   └── footer.html       ← injecté par main.js sur toutes les pages

├── data/

│   ├── news.json         ← actualités (édité via mode admin sur news.html)

│   ├── competitions.json ← palmarès (édité via mode admin sur competitions.html)

│   ├── galerie.json      ← photos par section (édité via mode admin sur galerie.html)

│   └── grades.json       ← programme des grades Kyu/Dan (édité via mode admin sur grades.html)

└── assets/

├── css/style.css     ← classes globales, animations, glassmorphism

├── js/

│   ├── tailwind.js   ← config Tailwind (couleurs + polices charte)

│   ├── main.js       ← injection header/footer, menu mobile, animations globales

│   ├── supabase.js   ← client Supabase (module ESM, window.sb), cf. section BDD

│   ├── store.js      ← couche d'accès aux données + routage Supabase/JSON, cf. section BDD

│   └── admin.js      ← mode admin factorisé (login Supabase Auth + modales), cf. section BDD

├── photos/           ← images des actualités et compétitions

└── docs/             ← PDFs et documents

├── supabase/

│   └── migrations/   ← scripts SQL versionnés (tables + RLS), 1 par collection migrée

## Structure galerie.json
- sections : club / competitions / entrainement / stages
- stages : tableau d'objets { nom, dossier, photos[] }

## Structure grades.json
- `grades` : tableau unique mêlant Kyu et Dan, dans l'ordre de progression.
- Champs communs : `id`, `type` (`"kyu"` | `"dan"`), `grade`, `ceinture`, `couleurHex` (pastille couleur réelle de la ceinture — **seule exception tolérée à la palette**, car pilotée par les données), `hidden` (booléen → masque le grade côté public sans le supprimer).
- Kyu : `katas[]`, `kihonIpponKumite[]`, `sanbonKumite[]`, `ohyoKumite[]` (listes ; `ohyoKumite` vide = « Non requis »).
- Dan : `ageMinimum`, `tempsAttente`, `licences`, `katas[]` (programme Annexe V).
- Terminologie recopiée **verbatim** du dossier technique FFK (ex. « Pinan Yodan », « Naïfanchi Shodan » / « Naihanchi » selon le grade) — ne pas « corriger » sans demander.

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

Présent sur `news.html`, `competitions.html`, `galerie.html` et `grades.html`.
- Déverrouillage : bouton discret + **connexion Supabase Auth** (`signInWithPassword`, géré dans `admin.js`). L'email admin est constant (`window.CSB_ADMIN_EMAIL` dans `supabase.js`) ; l'admin ne saisit que son mot de passe. La session Auth autorise ensuite les écritures en base (RLS).
- Permet ajout/modif/suppression d'entrées.
- **Collections migrées (Supabase)** : enregistrement direct en base (bouton « Enregistrer en ligne »). Aujourd'hui : `news`.
- **Collections non migrées (JSON)** : génèrent encore un `.json` à télécharger, que l'admin dépose sur GitHub. Aujourd'hui : `competitions`, `galerie`, `grades`.

**Ne JAMAIS** :
- Modifier le compte/mot de passe admin Supabase sans demander
- Toucher à la logique d'export JSON (collections non encore migrées) sans demander

## Tests en local

- Ouvrir avec **Live Server** (extension VS Code) pour avoir le rechargement auto
- Tester chaque modif sur mobile (DevTools, mode responsive) ET desktop
- Vérifier que header/footer s'injectent bien (pas de "flash" visible)
- Vérifier la console JS : zéro erreur tolérée

## État du projet

**Pages terminées :** `index.html`, `wadoryu.html`, `news.html`, `club.html`, `competitions.html`, `mentions-legales.html`, `galerie.html`, `grades.html`
- galerie.html ✅ — données dans data/galerie.json, admin via Supabase Auth
- grades.html ✅ — données dans data/grades.json (Kyu + Dan), admin via Supabase Auth

**TODO restants :**
- [ ] Insérer le lien HelloAsso définitif dans la section "Informations Pratiques" de l'accueil (placeholder `#lien-vers-helloasso-ou-form` dans `index.html`)
- [ ] Remplacer les `[À REMPLIR]` dans `mentions-legales.html` (éditeur/président, adresse, téléphone, email)

## Dette technique connue (audit du 22/06/2026)
Détail et priorisation dans l'historique de conversation ; points saillants à traiter :
- ~~**Navigation mobile absente**~~ ✅ **Corrigé** : `components/header.html` a désormais un bouton hamburger (`lg:hidden`) + un panneau `#mobile-menu` ; logique d'ouverture/fermeture (clic, lien, Échap) dans `initMobileMenu()` de `main.js`.
- ~~**Pas d'échappement HTML** dans les rendus CMS~~ ✅ **Corrigé** : `news.js`, `galerie.js`, `competitions.html` et le carrousel de `index.html` ont chacun leur fonction `esc()` (même pattern que `grades.js`, dupliquée volontairement — utilitaire pur de 2 lignes, pas de quoi justifier un module partagé). Tout contenu issu des données (`.json`) est échappé avant injection via `innerHTML`.
- ~~**`logo-wadoryu.png` ≈ 1 Mo**~~ ✅ **Corrigé** : redimensionné de 851×828 à 192×192 px (4× la taille d'affichage réelle de 48×48 dans `header.html`/`footer.html`, marge confortable pour le rétina), transparence conservée. ~987 Ko → ~70 Ko (−93 %).
- **Tailwind via CDN** (`cdn.tailwindcss.com`) : avertissement console + perf en prod. Candidat à un build CSS *si* un jour on accepte une étape de build (sinon laisser tel quel, cf. contraintes).
- ~~**Logique CMS dupliquée** sur 4 pages~~ ✅ **Factorisée** : l'**accès aux données** (lecture JSON + export) est dans `assets/js/store.js`, et le **mode admin** (login + modales) dans `assets/js/admin.js` (`Admin.init({ onUnlock, onCloseAdmin })`). Chaque page ne garde que son rendu et son CRUD. Mot de passe `CSB` centralisé dans `admin.js`.
- Typo corrigée : « Self-Défense Féminine Féminine » (index.html).

## Ce qu'il ne faut PAS faire

- ❌ Ajouter un build step (Vite, Webpack, Parcel, etc.)
- ❌ Convertir en framework (React, Vue, Svelte, etc.)
- ❌ Repasser en SPA (architecture multi-pages validée)
- ❌ Modifier la config de déploiement Vercel (créer un `vercel.json`, changer les réglages projet) sans demander
- ❌ Installer des paquets npm
- ❌ Modifier les fichiers `.json` de `/data/` manuellement (passer par le mode admin)
- ❌ Toucher à la palette de couleurs ou aux polices sans validation explicite

## Base de données : Supabase (bascule EN COURS)

Objectif : remplacer le CMS « Git-based » (export JSON manuel → commit) par une vraie persistance, pour que l'admin enregistre directement depuis le site. **Migration progressive, collection par collection.**

### État de la bascule
- ✅ **`news`** — migré (table Postgres + RLS, Auth, lecture/écriture depuis le site). Pilote validé.
- ✅ **`competitions`** — migré (même patron que `news`, tableau plat).
- ✅ **`galerie`** — migré en **document JSONB** (table singleton 1 ligne, `id = 1`), car structure imbriquée (sections + stages). Voir note Storage ci-dessous : seule la **structure** est en base, les **fichiers images** restent manuels.
- ⬜ **`grades`** — encore sur JSON, à migrer (tableau plat, mais champ `hidden` à filtrer côté public).

### Comment c'est branché
- **`assets/js/supabase.js`** (module ESM, `window.sb`) : crée le client. URL + clé `anon`/`publishable` **publiques** (sûres : sécurité par la RLS). ⚠️ Jamais la clé `service_role` ici. Chargé via `<script type="module">` sur les pages utilisant Store/Admin.
- **`store.js`** : `SUPABASE_COLLECTIONS` (Set) liste les collections migrées → routées vers Supabase ; les autres gardent le fetch JSON + export téléchargé. **Migrer une collection = ajouter son nom au Set + écrire ses cas `load/saveFromSupabase` + un SQL `00xx_<collection>.sql`.** Les pages ne changent pas. Pour les tableaux plats (news, competitions), `saveToSupabase` délègue à `replaceSupabaseTable(table, rows)` (upsert + suppression du complément) — helper partagé, à ne pas dupliquer pour la prochaine collection plate.
- **`admin.js`** : login = `signInWithPassword` (Supabase Auth) ; la session autorise les écritures (RLS « écriture = authenticated »).
- **SQL versionné** : `supabase/migrations/00xx_<collection>.sql` (table + RLS + reprise des données). Exécuté à la main dans le SQL Editor Supabase. `0001_news.sql` sert de modèle.

### RLS (modèle appliqué)
- `SELECT` ouvert à `anon` + `authenticated` (site public). Pour `grades`, prévoir de **filtrer `hidden`** côté policy ou requête lors de sa migration.
- `INSERT`/`UPDATE`/`DELETE` réservés à `authenticated` (l'admin connecté).

### Points de vigilance
- *Free tier* : projet **mis en pause après ~1 semaine d'inactivité** → prévoir un ping (Vercel Cron) ou accepter un cold start.
- *`id`* : on conserve des `id` numériques fournis par le client (le `Date.now()` des pages) pour ne pas toucher au CRUD existant ; le `save` fait `upsert` + `delete` du complément (= « remplace la collection par ce tableau »).
- *Storage* : l'upload des photos reste manuel (`assets/photos/`) pour l'instant ; **Supabase Storage** est l'étape suivante envisagée (remplacera le dépôt manuel), notamment pour `galerie`.

---

### Archives — étude initiale du choix

**Recommandation : Supabase** (Postgres managé + Auth + Storage).
- *Pourquoi lui* : un seul produit couvre les 3 besoins de la migration — la **BDD** (remplace les `.json`), l'**Auth** (remplace le faux mot de passe `CSB`) et le **Storage** (remplace l'upload manuel des photos dans `assets/photos/`).
- *Compatible avec la contrainte « pas de build »* : le SDK `@supabase/supabase-js` s'importe via CDN ESM (`<script type="module">`), donc utilisable en vanilla JS sans npm. Avec la Row Level Security (RLS), le navigateur peut lire/écrire directement sans backend custom.
- *Gratuit* : free tier 500 Mo BDD, 1 Go Storage, 50k utilisateurs Auth. ⚠️ Un projet free est **mis en pause après ~1 semaine d'inactivité** → prévoir un ping (Vercel Cron) ou accepter un cold start.
- *Intégration Vercel* : disponible via Vercel Marketplace (injection auto des variables d'env).

**Alternative : Neon** (Postgres pur, serverless) si l'on ne veut QUE la BDD : plus léger, mais Auth + Storage + une API restent à coder soi-même (via Vercel Functions, car les identifiants Postgres ne s'exposent pas au navigateur) → plus de travail. Pour le stockage des photos dans ce scénario : **Vercel Blob**.

**Schéma cible proposé** (1 table par collection actuelle) : `news`, `competitions`, `galerie_photos`, `grades`. Conserver un `id` par ligne et harmoniser son type (aujourd'hui mélange de timestamps et de petits entiers).

**Étape 0 de préparation (sans BDD) — ✅ FAITE.** L'accès aux données est factorisé dans `assets/js/store.js` :
- `Store.loadCollection(name)` → `Promise` des données (lit `./data/<name>.json`).
- `Store.saveCollection(name, data)` → aujourd'hui télécharge `<name>.json` (export manuel inchangé) ; **demain** ce sera un appel Supabase, **sans toucher aux pages**.
- Branché sur les 5 consommateurs : `news.js`, `galerie.js`, `grades.js`, le JS inline de `competitions.html` et le carrousel de `index.html`. Chargé via `<script defer src="./assets/js/store.js">` (avant les scripts de page).
- Bascule BDD : il suffira de remplacer le **corps** de ces 2 fonctions par le SDK Supabase.