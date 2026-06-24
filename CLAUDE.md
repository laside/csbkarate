# CSB Karaté Brétigny — Instructions Claude Code

## Ton rôle
Développeur web senior + expert UI/UX pour une association sportive.
Code propre, moderne, léger, maintenable. Pédagogique en français.
**Pas de sur-ingénierie.** Pas de framework lourd. Vanilla JS uniquement.

## Stack (NE PAS modifier sans demander)
- HTML5 sémantique + Tailwind CSS. **Double chemin** (décidé le 24/06/2026, cf. section dédiée plus bas) : CDN (`cdn.tailwindcss.com`, config dans `assets/js/tailwind.js`) en local sur `localhost`/`127.0.0.1` ; CSS purgé/minifié généré par CI (`assets/css/tailwind.min.css`) partout ailleurs (preview Vercel + prod). Pas de build local, pas de npm — le build vit uniquement dans GitHub Actions.
- Vanilla JS ES6+, API `fetch` pour charger JSON et composants
- Chart.js (CDN) → graphiques de données (ex. radar comparatif sur `wadoryu.html`)
- Données : **Supabase** (Postgres + Auth, SDK via CDN ESM) — cf. section BDD. Les 5 collections CMS (`news`, `competitions`, `galerie`, `grades`, `saison`) sont migrées. Le routage par collection est dans `store.js` (toutes pointent vers Supabase aujourd'hui ; les fichiers `.json` de `/data/` restent en lecture seule, comme trace historique).
- Hébergement : **Vercel** (déploiement auto sur push `main` = prod, preview sur les autres branches). Pas de `vercel.json` : config zéro. Vercel Web Analytics actif sur chaque page.

## Structure du projet
/

├── index.html, news.html, wadoryu.html, club.html, competitions.html, galerie.html, grades.html, ...

├── inscription.html      ← module gestion : inscription en ligne (public)

├── membres.html          ← module gestion : espace bureau / CRM + règlements/facturation (accès protégé)

├── adherent.html         ← module gestion : espace adhérent privé (dossier + attestation PDF)

├── construction.html     ← page-verrou « En construction » (cf. section dédiée)

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

│   ├── admin.js      ← mode admin factorisé (login Supabase Auth + modales), cf. section BDD

│   ├── saison.js     ← horaires/tarifs éditables de l'accueil (collection `saison`)

│   ├── tarifs.js     ← moteur de calcul de tarif pur (window.CSBTarifs, centimes)

│   ├── inscription.js ← parcours d'inscription en ligne (module gestion)

│   ├── membres.js    ← espace bureau / CRM + règlements/facturation (module gestion)

│   ├── adherent.js   ← espace adhérent privé (dossier + attestation, module gestion)

│   └── pdf.js        ← génération PDF partagée (window.CSBPdf : attestation + facture)

├── photos/           ← images des actualités et compétitions

└── docs/             ← PDFs et documents

├── supabase/

│   ├── migrations/   ← scripts SQL versionnés (tables + RLS) : 0001-0004 collections CMS, 0005 saison, 0006-0008 module gestion, 0009 factures

│   └── seed_test_adherents.sql ← jeu de test (20 adhérents) — DEV uniquement, hors migrations

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

Présent sur `news.html`, `competitions.html`, `galerie.html`, `grades.html` et `index.html` (édition des horaires/tarifs de la saison, cf. collection `saison`).
> ⚠️ Ce « Mode Administrateur CMS » (mot de passe admin unique, `admin.js`) est **distinct** du **module Gestion de club** (`membres.html`/`inscription.html`, auth multi-rôles `bureau`/`enseignant`/`adherent`) décrit plus bas. Deux systèmes d'auth Supabase coexistants pour deux usages.
- Déverrouillage : bouton discret + **connexion Supabase Auth** (`signInWithPassword`, géré dans `admin.js`). L'email admin est constant (`window.CSB_ADMIN_EMAIL` dans `supabase.js`) ; l'admin ne saisit que son mot de passe. La session Auth autorise ensuite les écritures en base (RLS). Fonction de **réinitialisation de mot de passe** intégrée avec redirection dynamique (`window.location.origin`) pour supporter localhost/preview/prod.
- Permet ajout/modif/suppression d'entrées, enregistrement direct en base (bouton « Enregistrer en ligne ») pour les 5 collections (`news`, `competitions`, `galerie`, `grades`, `saison`).
- Exception : sur `galerie.html`, seule la **structure** (quelle photo dans quelle section/stage) est enregistrée en ligne — les **fichiers images** doivent toujours être déposés manuellement dans `assets/photos/galerie/` sur GitHub (Storage pas encore migré).

**Ne JAMAIS** :
- Modifier le compte/mot de passe admin Supabase sans demander
- Modifier les fichiers `.json` de `/data/` en pensant que ça changera le site : ils ne sont plus la source de données (conservés à titre historique), toute édition doit passer par le mode admin → Supabase.

## Tests en local

- Ouvrir avec **Live Server** (extension VS Code) pour avoir le rechargement auto
- Tester chaque modif sur mobile (DevTools, mode responsive) ET desktop
- Vérifier que header/footer s'injectent bien (pas de "flash" visible)
- Vérifier la console JS : zéro erreur tolérée

## Build CSS Tailwind (CI GitHub Actions) — décidé le 24/06/2026

Le CDN Tailwind (`cdn.tailwindcss.com`) reste la dette technique connue la plus visible (warning console + poids en prod). Plutôt que d'introduire un build local (interdit, cf. Stack), la purge/minification est déportée dans **GitHub Actions**, déclenchée automatiquement, sans jamais toucher au poste du développeur ni à `npm`.

**Mécanique :**
- `tailwind.config.js` (racine) : config **CLI**, miroir de `assets/js/tailwind.js` (mêmes couleurs/polices). Les deux fichiers doivent rester synchronisés à la main si la charte change — pas de source unique, pour ne pas complexifier le chargement CDN côté navigateur.
- `assets/css/tailwind-input.css` : entrée `@tailwind base/components/utilities`, donnée au CLI.
- `assets/css/tailwind.min.css` : **généré**, committé dans le repo (comme un artefact, pas une source éditée à la main). Présent dès maintenant (généré une première fois en local via le binaire standalone, pour ne pas livrer un prod cassé avant le premier run CI).
- `.github/workflows/build-css.yml` : à chaque push (toutes branches, pour que les previews Vercel aient aussi un CSS à jour), télécharge le **binaire CLI autonome** de Tailwind (`tailwindcss-linux-x64`, version figée — pas de `npm install`), régénère `tailwind.min.css`, et le recommit (`[skip ci]` + bot identity) **uniquement si le contenu a changé**. Vercel redéploie sur ce commit de bot comme sur n'importe quel push.
- **Dans le `<head>` des pages** (les 10 pages publiques/gestion, pas `construction.html` ni `template.html`, cf. plus bas) :
  ```html
  <link rel="stylesheet" href="./assets/css/style.css">
  <link rel="stylesheet" href="./assets/css/tailwind.min.css">
  <script>
      if (['localhost', '127.0.0.1'].includes(location.hostname)) {
          document.write('<script src="https://cdn.tailwindcss.com"><\/script>');
      }
  </script>
  <script src="./assets/js/tailwind.js"></script>
  ```
  En local (Live Server = `localhost`/`127.0.0.1`) : le CDN se charge en plus, en JIT — *aucun changement* du confort de dev (nouvelle classe visible instantanément, pas besoin d'attendre un build). Ailleurs (preview `*.vercel.app`, prod) : uniquement le CSS généré, pas de CDN, pas de warning console.
- **Exclus délibérément** : `construction.html` (utilise un bloc `<style type="text/tailwindcss">` avec `@layer`/`@apply`, une fonctionnalité **CDN runtime only** que le CLI ne traite pas — page de verrou temporaire, peu de trafic, pas une priorité de perf) et `template.html` (brand book non lié au site, convention de couleurs différente, pas une page live).

**Pourquoi c'est sûr (vérifié le 24/06/2026) :** le contenu scanné par le CLI inclut `./*.html`, `./components/*.html` **et** `./assets/js/**/*.js` — nécessaire car plusieurs pages construisent des classes Tailwind dans des template strings JS (`membres.js`, `saison.js`, `inscription.js`, `competitions.html` inline) plutôt que dans du HTML statique. Toutes ces classes sont des **littéraux statiques** (jamais de concaténation type `'bg-' + couleur`), donc détectables par le scanner texte du CLI — vérifié par recherche de motifs de concaténation dynamique (aucun trouvé) et par échantillonnage des classes les plus à risque (couleurs `csb-*`, classes retournées conditionnellement par `statutClass()`, valeurs arbitraires `min-h-[...]`/`aspect-[...]`, modificateurs d'opacité `/30`) dans le CSS généré.

**Limites connues, acceptées à ce stade :**
- Pas de vérification visuelle automatisée (pas d'outil de navigateur disponible dans cet environnement) : à confirmer manuellement (Live Server pour le chemin CDN, une preview Vercel pour le chemin CSS généré) avant de considérer la bascule définitivement validée.
- Si deux push arrivent en même temps, le second `git push` du bot peut échouer (non-fast-forward) ; pas de retry automatique — un push suivant régénère normalement. Acceptable à l'échelle d'un petit club.
- Si la charte graphique change, penser à répercuter dans **les deux** fichiers de config (CDN et CLI).

## État du projet

**Pages terminées :** `index.html`, `wadoryu.html`, `news.html`, `club.html`, `competitions.html`, `mentions-legales.html`, `galerie.html`, `grades.html`
- galerie.html ✅ — données (structure) sur Supabase, admin via Supabase Auth, photos toujours manuelles
- grades.html ✅ — données sur Supabase (Kyu + Dan), admin via Supabase Auth
- index.html ✅ — section « Informations Pratiques » (horaires/tarifs) éditable, collection `saison` ; cartes disciplines à retournement (flip) ; carrousel d'actus

**Module Gestion de club (branche `feature-gestion`) — EN COURS :** `inscription.html` (Phase 1 livrée) et `membres.html` (Phase 2 en cours). Détail complet dans la section dédiée plus bas.

## Fonctionnalité temporaire : Mode "En Construction" (Restriction d'accès)
Le site n'étant pas encore prêt pour le grand public, un système de restriction d'accès "léger" (front-end) a été mis en place pour bloquer les visiteurs tout en permettant aux membres du bureau de tester le site.

Comment fonctionne le blocage :

Vérification Globale (assets/js/main.js) : Au tout début du chargement de chaque page, le script vérifie la présence de la variable csb_access_granted dans le sessionStorage du navigateur.

Redirection Forcée : Si l'utilisateur n'a pas cette autorisation et tente d'accéder à une page autre que construction.html, il est instantanément redirigé vers construction.html.

Déverrouillage (construction.html) : La page de construction contient un formulaire de connexion. Si le membre du bureau entre le bon mot de passe (défini dans le script de la page, par ex: CSB2024!), la variable sessionStorage est créée et l'utilisateur est redirigé vers index.html. Il peut ensuite naviguer librement jusqu'à la fermeture de son navigateur.


**TODO restants :**
- ~~Insérer le lien HelloAsso définitif dans la section "Informations Pratiques"~~ ✅ Le bouton « Démarrer l'inscription » pointe désormais vers la page interne `inscription.html` (module Gestion, Phase 1). HelloAsso = paiement en ligne, phase ultérieure (cf. Roadmap Phase 3).
- [ ] Remplacer les `[À REMPLIR]` dans `mentions-legales.html` (éditeur/président, adresse, téléphone, email)
- [ ] Tester en local la migration `grades` (re-fetch sur login, ordre préservé, `hidden` filtré par RLS) — pas encore vérifié manuellement.
- [ ] Supabase **Storage** pour les photos de la galerie (aujourd'hui dépôt manuel dans `assets/photos/galerie/`) — non commencé.

## Module Gestion de club (branche `feature-gestion`) — EN COURS

Système d'information du club inspiré de **MonClub**, intégré au site. Spécifié à partir d'un rapport Gemini (donné comme direction, **pas pris au pied de la lettre**) + du **dossier d'inscription papier 2022/2023** (source de vérité pour les champs et les tarifs). Objectif : **simplicité + coût 0 €/mois**.

### Décisions verrouillées (22/06/2026)
- **Compte membre créé à l'inscription** (Supabase Auth) : les écritures d'inscription se font **sous la session du référent**, scopées par RLS à sa seule famille (pas d'écriture anonyme).
- **Paiement « au club » d'abord** (chèque/espèces validés par le bureau). HelloAsso (paiement en ligne) = phase ultérieure, via une **petite fonction serverless Vercel `/api/`** (le `client_secret` HelloAsso ne peut PAS vivre dans le navigateur). Cette fonction n'altère pas le site statique (pas de build front).
- **On démarre par l'Inscription en ligne.**

### Coupes de périmètre validées (vs rapport Gemini)
- ❌ **Appli mobile + notifications push** → remplacées par **web responsive + email** (il n'y aura jamais d'appli native, ça casserait les contraintes).
- ❌ **Boutique / Karategi**.
- ❌ **Comptabilité avancée** → réduite à un **export CSV** des paiements pour le bilan d'AG.
- ⚠️ **Relances auto de documents manquants** → démarrer par un **bouton « relancer » manuel** ; automatisation plus tard.

### Rôles (auth multi-utilisateurs, nouveau vs l'ancien admin unique)
`bureau` (secrétariat/admin, accès total) · `enseignant` (valide les grades) · `adhérent` (voit son dossier). Géré par une table `profiles` (user_id → role, famille_id) + RLS par utilisateur.

### Tarifs (source = dossier papier, PAS les chiffres de Gemini qui étaient faux)
- Cotisations (licence/assurance **incluse**, pas de ligne séparée) : **Adulte 210 € · Enfant 180 € · Self-défense 130 €**.
- **Membre du bureau : 37 € fixe** (remplace le tarif de cours).
- **Remise famille** (sur N inscrits dans le panier) : **2→10 € · 3→30 € · 4→50 € · 5+→70 €**.
- **Remise Pass'Sport : 50 €** (⚠️ change chaque année → **valeur configurable** par le bureau).
- Acompte 30 € = vestige de la pré-inscription papier en 2 temps → **supprimé du flux en ligne** (on paie le total d'un coup).
- Règlement **3× max par chèque uniquement**, chèques libellés à *CSB Karaté*, encaissés mensuellement.
- **Règle d'or attestation CE/CAF** : PDF d'attestation **bloqué tant que le règlement n'est pas complet** (toutes les échéances encaissées).

### RGPD (non négociable)
Données de **mineurs** (photos, contact d'urgence, santé) → Storage en **bucket PRIVÉ** (≠ galerie publique), RLS étanche, traçabilité des consentements (règlement intérieur, droit à l'image, autorisation parentale).

### Roadmap (chaque phase livrable + testable)
- **Phase 0 — Fondations** ✅ migration prête : `supabase/migrations/0006_gestion_foundations.sql` (renumérotée depuis `0005_*` lors de la fusion avec `main`, qui avait déjà pris ce numéro pour `0005_saison.sql`) (tables `profiles`/`tarifs`/`familles`/`adherents`/`dossiers`/`paiements` + RLS multi-rôles + bucket privé `dossiers` + trigger profil auto + seed tarifs `2026-2027`). **À exécuter dans le SQL Editor.** Montants en **centimes** partout. Le module gestion N'utilise PAS `store.js` (CRUD relationnel avec auth, pattern différent du CMS) → ses propres modules JS.
  - **Verrou sécurité clé** : écriture `paiements` réservée au `bureau` (un membre ne peut pas s'auto-encaisser → règle d'or des attestations inviolable).
  - **1er compte bureau** = l'email admin historique (`marsella.lorenzo@gmail.com`, promu par le 5c du SQL) — adapter si différent.
- **Phase 1 — Inscription en ligne** ✅ LIVRÉ (à tester en local) : `inscription.html` (wizard 4 étapes : famille → adhérents 1→5 → autorisations → récap), logique dans `assets/js/inscription.js`, **moteur de tarif** pur et testable dans `assets/js/tarifs.js` (`window.CSBTarifs`, tout en **centimes**). Règles d'âge au 1er sept. (Self ≥13 ans bloquant ; <18 → autorisation parentale dynamique à l'étape 3). Photos uploadées dans le bucket privé `dossiers` (chemin `<uid>/...`). **Flux de soumission** : `auth.signUp` (référent) → `upsert familles` → `insert adherents` (+ photos) → `insert dossiers` (statut `attente_paiement`). **Aucun `paiements` créé ici** (réservé au bureau). Migration complémentaire **`0007_adherents_passsport.sql`** (colonnes `pass_sport` / `pass_sport_code` sur `adherents`) — **à exécuter**. Le moteur de tarif réutilise la ligne `tarifs` Supabase (fallback `DEFAULT_CONFIG`). Pré-requis Auth : **« Confirm email » désactivé** (sinon pas de session post-signUp → l'insert RLS échoue). Limite connue Phase 1 : pas de rollback transactionnel si une étape échoue après le `signUp` (message invitant à contacter le club plutôt que resoumettre) ; **liée au site** depuis le bouton « Démarrer l'inscription » de l'accueil + l'entrée « Inscription en ligne » du menu « Le club » (desktop + mobile, `components/header.html`).
- **Phase 2 — Espace Bureau (CRM)** ⏳ EN COURS : `membres.html` + `assets/js/membres.js` (page **bureau-only**, accès `/membres.html` via le bouton **« Espace Bureau »** du header — desktop à côté de « Nous rejoindre » + menu mobile, `components/header.html` ; visible publiquement mais protégée par son propre portail de connexion). Portail de connexion (`signInWithPassword` + vérif rôle `bureau` via `profiles`, déconnexion si non-bureau), **tableau de bord** (adhérents par cours, dossiers par statut, membres bureau, encaissé/attendu depuis `dossiers`+`paiements`) et **liste filtrable** (recherche nom/référent, cours, statut) des `adherents` avec **édition inline auto-enregistrée** : `statut_dossier` (Incomplet/Attente paiement/Validé — la « case paiement »), `membre_bureau`, `grade_actuel`. **Section « Administrateurs du site »** : ne liste QUE les comptes de rôle `bureau`/`enseignant` (les `adherent` sont masqués). Ajouter (= promouvoir un compte **existant** par email, via `profiles.email`), changer le niveau (Administrateur=`bureau` / Enseignant=`enseignant`), retirer l'accès (→ `adherent`). Gardes anti-blocage : ni son propre accès bureau, ni le dernier bureau. La création/suppression *définitive* de comptes Auth nécessitera une fonction serveur (service_role, hors navigateur) — non faite. ⚠️ **TROIS notions distinctes à ne pas confondre** : (1) `adherents` = pratiquants (la liste principale) ; (2) `adherents.membre_bureau` = pratiquant **membre du bureau du club** (gouvernance asso, tarif 37 € — libellé UI « Bureau du club ») ; (3) `profiles.role` = **admin du site** (accès gestion, libellé UI « Administrateur »). Un adhérent peut être (2) sans être (3). `marsella.lorenzo` est (3) et n'apparaît PAS dans la liste des adhérents s'il n'a pas été inscrit comme pratiquant. Migration **`0008_profiles_email.sql`** (colonne `profiles.email` + trigger `handle_new_user` qui la remplit + backfill) — **à exécuter** : nécessaire car `auth.users` n'est pas lisible depuis le navigateur. **Reste à faire pour clore la phase** : ~~enregistrement des règlements~~ ✅ livré en Phase 4 (section « Dossiers & règlements ») ; restent la validation des documents et une vue détaillée par dossier/famille.
  - **Jeu de test** : `supabase/seed_test_adherents.sql` (hors `migrations/`) peuple 20 adhérents crédibles (7 bureau + 3 enseignants + 10 adhérents) avec dossiers/paiements. Emails en `@seed.test`, ré-exécutable (purge d'abord), nettoyage par `delete from auth.users where email like '%@seed.test'`. ⚠️ DEV/preview uniquement, insère dans `auth.users` (comptes d'affichage, non connectables).
- **Phase 3 — Paiement HelloAsso** : fonction `/api/checkout` (1×/3×) + retour de paiement.
- **Phase 4 — Espace Adhérent + Facturation** ✅ LIVRÉ (à tester en local) : `adherent.html` + `assets/js/adherent.js` (espace privé du référent : portail `signInWithPassword` + mot de passe oublié, lecture **RLS-scopée à sa seule famille** — coordonnées, adhérents/grades, état du règlement par dossier + barre de progression). **Attestation de paiement** (document NON fiscal, sans numéro) **générée côté client** via `assets/js/pdf.js` (jsPDF lazy-loadé du CDN), **conditionnée au dossier soldé** (statut `valide` OU somme encaissée ≥ `montant_total`) — aucune écriture côté membre.
  - Côté **bureau** (`membres.html` / `membres.js`) : section **« Dossiers & règlements »** = enregistrement des **encaissements** (table `paiements`, écriture RLS **`bureau`-only**, via une modale ; mode chèque/espèces/CB/ANCV/CAF + n° + date) ; `dossiers.statut` **dérivé automatiquement** des encaissements (`attente_paiement` → `paye_partiel` → `valide`). **Clôt le « reste à faire » de la Phase 2** (enregistrement des règlements).
  - **Facture = légalité française** : numérotation **atomique et continue** côté base via la fonction `public.emettre_facture(p_dossier_id)` (`SECURITY DEFINER`, garde `is_bureau()` → **émission réservée au bureau**), persistée dans la table **`factures`** (migration **`0009_factures.sql`** — **à exécuter** ; séquence `factures_numero_seq`, numéro `AAAA-NNNN`, snapshot **immuable** du dossier, `dossier_id` UNIQUE = **une seule facture par dossier**, idempotente). Émission **refusée tant que le dossier n'est pas soldé**. Le membre ne peut **jamais** l'émettre mais peut la **télécharger** une fois émise (RLS `select` = sa famille). `pdf.js` (`window.CSBPdf`) factorise en-tête/pied (identité légale du club = constante `CLUB` — **à compléter** : adresse/SIRET/contact) entre attestation et facture.
- **Phase 5 — Grades par l'enseignant** : validation d'un grade en 1 clic (réutilise les données de référence de `grades`).
- **Phase 6 (optionnel)** : planning + alertes email, présences, export compta CSV.

### Coût visé : 0 €/mois
HelloAsso 0 % · Supabase free · Vercel Hobby (fonctions + Cron inclus) · jsPDF CDN · emails via free tier (ex. Resend). Piège : pause Supabase après ~1 sem. d'inactivité → **ping Vercel Cron** gratuit.

## Dette technique connue (audit du 22/06/2026)
Détail et priorisation dans l'historique de conversation ; points saillants à traiter :
- ~~**Navigation mobile absente**~~ ✅ **Corrigé** : `components/header.html` a désormais un bouton hamburger (`lg:hidden`) + un panneau `#mobile-menu` ; logique d'ouverture/fermeture (clic, lien, Échap) dans `initMobileMenu()` de `main.js`.
- ~~**Pas d'échappement HTML** dans les rendus CMS~~ ✅ **Corrigé** : `news.js`, `galerie.js`, `competitions.html` et le carrousel de `index.html` ont chacun leur fonction `esc()` (même pattern que `grades.js`, dupliquée volontairement — utilitaire pur de 2 lignes, pas de quoi justifier un module partagé). Tout contenu issu des données (`.json`) est échappé avant injection via `innerHTML`.
- ~~**`logo-wadoryu.png` ≈ 1 Mo**~~ ✅ **Corrigé** : redimensionné de 851×828 à 192×192 px (4× la taille d'affichage réelle de 48×48 dans `header.html`/`footer.html`, marge confortable pour le rétina), transparence conservée. ~987 Ko → ~70 Ko (−93 %).
- ~~**Tailwind via CDN** (`cdn.tailwindcss.com`) : avertissement console + perf en prod.~~ ✅ **Corrigé le 24/06/2026** : purge/minification déportée vers GitHub Actions (CLI standalone, pas de npm) ; le CDN ne reste chargé qu'en local (`localhost`/`127.0.0.1`). Détail dans la section « Build CSS Tailwind (CI) ».
- ~~**Logique CMS dupliquée** sur 4 pages~~ ✅ **Factorisée** : l'**accès aux données** (lecture JSON + export) est dans `assets/js/store.js`, et le **mode admin** (login + modales) dans `assets/js/admin.js` (`Admin.init({ onUnlock, onCloseAdmin })`). Chaque page ne garde que son rendu et son CRUD. Mot de passe `CSB` centralisé dans `admin.js`.
- Typo corrigée : « Self-Défense Féminine Féminine » (index.html).
- ~~**Refonte des icônes de disciplines sur index.html**~~ ✅ **Corrigé** : La section "Nos Disciplines" sur `index.html` a été mise à jour avec des icônes plus grandes, un design en tuiles "Bento" amélioré (padding, ombres, coins arrondis), des tailles de texte ajustées et des couleurs de fond/texte alignées avec la charte graphique. Les chemins des images (`kkt2.png`, `mm2.png`, `ff2.png`) ont été mis à jour pour pointer vers `assets/photos/`.
- ~~**Dates de saison obsolètes (2024-2025)**~~ ✅ **Corrigé** : Remplacées par la saison actuelle "2026-2027" sur la page d'accueil et le lien du document PDF d'inscription.
- ~~**Lien Mot de passe oublié manquant**~~ ✅ **Corrigé** : Intégration de `resetPasswordForEmail` de Supabase avec `redirectTo: window.location.origin` dans `admin.js` et ajout du bouton sur toutes les modales de connexion.

## Ce qu'il ne faut PAS faire

- ❌ Ajouter un build step **local** (Vite, Webpack, Parcel, etc.) — exception unique et déjà actée : la purge CSS Tailwind tourne en **CI** (GitHub Actions), jamais sur la machine du développeur. Ne pas généraliser ce précédent à autre chose sans demander.
- ❌ Convertir en framework (React, Vue, Svelte, etc.)
- ❌ Repasser en SPA (architecture multi-pages validée)
- ❌ Modifier la config de déploiement Vercel (créer un `vercel.json`, changer les réglages projet) sans demander
- ❌ Installer des paquets npm
- ❌ Modifier les fichiers `.json` de `/data/` manuellement (obsolètes depuis la bascule Supabase — passer par le mode admin du site)
- ❌ Toucher à la palette de couleurs ou aux polices sans validation explicite

## Base de données : Supabase (bascule TERMINÉE pour les données)

Objectif : remplacer le CMS « Git-based » (export JSON manuel → commit) par une vraie persistance, pour que l'admin enregistre directement depuis le site. **Les 5 collections sont migrées.** Reste une étape distincte et non commencée : le Storage des photos (cf. « Points de vigilance »).

### État de la bascule
- ✅ **`news`** — migré (table Postgres + RLS, Auth, lecture/écriture depuis le site). Pilote validé.
- ✅ **`competitions`** — migré (même patron que `news`, tableau plat).
- ✅ **`galerie`** — migré en **document JSONB** (table singleton 1 ligne, `id = 1`), car structure imbriquée (sections + stages). Seule la **structure** est en base, les **fichiers images** restent manuels (Storage pas encore fait).
- ✅ **`grades`** — migré (tableau plat + colonne `position` pour préserver l'ordre d'affichage d'origine, qui n'est pas un tri par id ; champ `hidden` filtré **au niveau RLS**, pas seulement côté client).
- ✅ **`saison`** — migré en **document JSONB** (singleton `id=1`, patron `galerie`), `0005_saison.sql`. Pilote les horaires/tarifs/libellé/plage de l'accueil ; rendu via `saison.js` en *progressive enhancement* (le HTML statique d'`index.html` sert de fallback si Supabase échoue).

### Comment c'est branché
- **`assets/js/supabase.js`** (module ESM, `window.sb`) : crée le client. URL + clé `anon`/`publishable` **publiques** (sûres : sécurité par la RLS). ⚠️ Jamais la clé `service_role` ici. Chargé via `<script type="module">` sur les pages utilisant Store/Admin.
- **`store.js`** : route **toutes** les collections vers Supabase (`SUPABASE_COLLECTIONS`, les 5 désormais). La source JSON (`loadFromJson`/`saveToJson`) reste dans le fichier pour le filet de sécurité / référence, mais n'est plus appelée par aucune collection active. Pour les tableaux plats (news, competitions, grades), `saveToSupabase` délègue à `replaceSupabaseTable(table, rows)` (upsert + suppression du complément) — helper partagé. Les collections à structure imbriquée ou avec champ filtré par RLS (`galerie`, `grades`) ont leur propre logique.
- **`admin.js`** : login = `signInWithPassword` (Supabase Auth) ; la session autorise les écritures (RLS « écriture = authenticated »).
- **SQL versionné** : `supabase/migrations/00xx_<collection>.sql` (table + RLS + reprise des données). Exécuté à la main dans le SQL Editor Supabase. `0001_news.sql` sert de modèle pour un tableau plat simple ; `0003_galerie.sql` pour un document JSONB ; `0004_grades.sql` pour une RLS différenciée anon/authenticated + colonne d'ordre.

### RLS (modèle appliqué)
- `SELECT` ouvert à `anon` + `authenticated` pour `news`, `competitions`, `galerie` (site public, pas de notion de contenu privé).
- `grades` fait exception : `SELECT` pour `anon` filtré par `using (hidden = false)` ; `authenticated` voit tout (`using (true)`), nécessaire pour que l'admin puisse « Afficher » à nouveau un grade masqué. Conséquence dans `grades.js` : `onUnlock` **re-fetch** la collection après connexion, sinon les grades masqués (absents du premier chargement anonyme) resteraient invisibles même connecté.
- `INSERT`/`UPDATE`/`DELETE` réservés à `authenticated` (l'admin connecté), partout.

### Points de vigilance
- *Free tier* : projet **mis en pause après ~1 semaine d'inactivité** → prévoir un ping (Vercel Cron) ou accepter un cold start.
- *`id`* : on conserve des `id` numériques fournis par le client (le `Date.now()` des pages) pour ne pas toucher au CRUD existant ; le `save` fait `upsert` + `delete` du complément (= « remplace la collection par ce tableau »).
- *Ordre d'affichage (`grades`)* : `position` est recalculée à **chaque sauvegarde** depuis l'ordre du tableau en mémoire côté client (`data.grades`), pas stockée comme une identité permanente — reproduit fidèlement l'ancien comportement « l'ordre du fichier JSON est l'ordre d'affichage ».
- *Fichiers `data/*.json`* : conservés dans le repo mais **plus lus par le site** (trace historique uniquement). Ne pas les considérer comme source de vérité pour un audit de contenu — toujours vérifier en base.
- *Storage* : l'upload des photos reste manuel (`assets/photos/`) ; **Supabase Storage** est l'étape suivante envisagée (remplacera le dépôt manuel), notamment pour `galerie`. Non commencé.

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