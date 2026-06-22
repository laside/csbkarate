// =============================================================
// CLIENT SUPABASE — supabase.js  (module ES, chargé en <script type="module">)
// =============================================================
// Crée le client Supabase partagé et l'expose en global (window.sb) pour
// les scripts classiques store.js / admin.js (on n'a pas de bundler).
//
// POURQUOI ÇA MARCHE SANS BUILD : les modules ES et les scripts `defer`
// s'exécutent TOUS avant l'événement DOMContentLoaded. Or toute la logique
// des pages tourne dans un handler `DOMContentLoaded` → window.sb est
// garanti prêt au moment où store.js / admin.js l'utilisent (au clic,
// au chargement des données…), jamais avant.
//
// SÉCURITÉ : l'URL et la clé `anon` / `publishable` sont PUBLIQUES par
// conception. La protection vient de la RLS définie côté base
// (cf. supabase/migrations/). Lecture ouverte à tous, écriture réservée
// au compte admin connecté via Supabase Auth.
// ⚠️ Ne JAMAIS coller ici la clé `service_role` / `secret`.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Configuration du projet (valeurs publiques) ---
const SUPABASE_URL = 'https://xeagkreeuhppcrqtppfd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XdUwPKwx_RwEJXReduSuwA_o4vTYIM6';

// Email du compte admin (créé dans Supabase > Authentication > Users).
// Un seul bureau : l'admin ne saisit que son mot de passe, l'email est constant.
// ⚠️ À adapter si le compte Supabase a été créé avec un autre email.
const ADMIN_EMAIL = 'marsella.lorenzo@gmail.com';

// --- Client partagé ---
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exposition globale pour les scripts classiques (store.js, admin.js).
window.sb = client;
window.CSB_ADMIN_EMAIL = ADMIN_EMAIL;
