// =============================================================
// EDGE FUNCTION « notify » — emails transactionnels du module gestion
// =============================================================
// Solution la plus intégrée à Supabase (cf. CLAUDE.md « Coût 0 €/mois ») :
// une Edge Function Deno + l'API REST de Resend (free tier). Aucun npm.
//
// Deux notifications (mission Espace Famille) :
//   • type 'new_member' → email au BUREAU : « la famille X a ajouté / inscrit
//     un nouvel adhérent ». Déclenché par la famille (adherent.js / inscription.js).
//   • type 'validation' → email à la FAMILLE : « le dossier de X a été
//     accepté / refusé ». Déclenché par le bureau (membres.js).
//
// POURQUOI UNE FONCTION SERVEUR (et pas un simple fetch côté navigateur) :
//   - Les emails du bureau ne sont PAS lisibles par une famille (RLS profiles) :
//     seul le service_role peut résoudre les destinataires côté serveur.
//   - La clé Resend est un SECRET : jamais dans le navigateur.
//
// SÉCURITÉ : on valide le JWT de l'appelant (Authorization: Bearer <token>,
// transmis par supabase.functions.invoke) et on vérifie ses droits selon le
// type (référent de la famille pour 'new_member', rôle bureau pour 'validation').
//
// --- DÉPLOIEMENT (une seule fois, hors navigateur) -----------------------
//   1) Créer un compte Resend + vérifier un domaine expéditeur (ou utiliser
//      onboarding@resend.dev en test).
//   2) Secrets de la fonction (Dashboard > Edge Functions > notify > Secrets,
//      ou CLI `supabase secrets set`) :
//        RESEND_API_KEY   = re_xxx                    (obligatoire)
//        NOTIFY_FROM      = "CSB Karaté <no-reply@votre-domaine.fr>"
//        BUREAU_FALLBACK  = email de secours si aucun profil 'bureau' (option.)
//      (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.)
//   3) Déployer : `supabase functions deploy notify`  (dashboard possible aussi).
//   4) Laisser « Verify JWT » ACTIVÉ (défaut) : la fonction lit le token appelant.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const COURS_LABEL: Record<string, string> = {
    Baby: 'Baby Karaté', Enfant: 'Enfant', Adulte: 'Adulte', 'Self-Defense': 'Self-défense',
};

// --- Envoi via l'API Resend --------------------------------------------------
async function sendEmail(to: string[], subject: string, html: string) {
    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('NOTIFY_FROM') || 'CSB Karaté <onboarding@resend.dev>';
    if (!apiKey) throw new Error('RESEND_API_KEY manquant (secret de la fonction non configuré).');
    if (!to.length) return { skipped: true };

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status} : ${await res.text()}`);
    return await res.json();
}

// Gabarit HTML minimal aux couleurs du club.
function layout(title: string, bodyHtml: string) {
    return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;max-width:560px;margin:0 auto">
        <div style="background:#1B263B;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:18px;letter-spacing:.05em;text-transform:uppercase">CSB Karaté</h1>
        </div>
        <div style="border:1px solid #E0E1DD;border-top:none;border-radius:0 0 12px 12px;padding:24px">
            <h2 style="margin:0 0 12px;font-size:16px;color:#0D1B2A">${title}</h2>
            ${bodyHtml}
            <p style="margin-top:24px;font-size:12px;color:#8a8f98">Cet email est envoyé automatiquement par l'espace de gestion du club. Merci de ne pas y répondre.</p>
        </div>
    </div>`;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

    try {
        const authHeader = req.headers.get('Authorization') || '';
        const url = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Client « appelant » (valide le JWT) + client admin (service_role, lit tout).
        const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } },
        });
        const admin = createClient(url, serviceKey);

        const { data: { user }, error: userErr } = await asUser.auth.getUser();
        if (userErr || !user) return json({ error: 'Non authentifié.' }, 401);

        const { type, adherent_id, famille_id } = await req.json().catch(() => ({}));

        // ---------------------------------------------------------------
        // new_member : prévenir le bureau qu'un adhérent a été ajouté.
        // ---------------------------------------------------------------
        if (type === 'new_member') {
            // Résolution de la famille + des adhérents concernés.
            let familleId = famille_id;
            let adherentsList: any[] = [];
            if (adherent_id) {
                const { data: a } = await admin.from('adherents')
                    .select('id, prenom, nom, cours_type, famille_id').eq('id', adherent_id).maybeSingle();
                if (!a) return json({ error: 'Adhérent introuvable.' }, 404);
                familleId = a.famille_id;
                adherentsList = [a];
            } else if (familleId) {
                const { data: as } = await admin.from('adherents')
                    .select('id, prenom, nom, cours_type, famille_id').eq('famille_id', familleId).order('id');
                adherentsList = as || [];
            } else {
                return json({ error: 'adherent_id ou famille_id requis.' }, 400);
            }

            const { data: fam } = await admin.from('familles')
                .select('id, nom_referent, referent_user_id').eq('id', familleId).maybeSingle();
            if (!fam) return json({ error: 'Famille introuvable.' }, 404);

            // Autorisation : le référent de la famille, ou un membre du bureau.
            const { data: prof } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
            const isBureau = prof?.role === 'bureau';
            if (fam.referent_user_id !== user.id && !isBureau) return json({ error: 'Accès refusé.' }, 403);

            // Destinataires : tous les comptes de rôle 'bureau'.
            const { data: bureaux } = await admin.from('profiles').select('email').eq('role', 'bureau');
            const recipients = (bureaux || []).map((b) => b.email).filter((e): e is string => !!e && e.includes('@'));
            const fallback = Deno.env.get('BUREAU_FALLBACK');
            if (!recipients.length && fallback) recipients.push(fallback);
            if (!recipients.length) return json({ ok: true, skipped: 'aucun destinataire bureau' });

            const lignes = adherentsList
                .map((a) => `<li>${esc(a.prenom)} ${esc(a.nom)} — <em>${esc(COURS_LABEL[a.cours_type] || a.cours_type || '—')}</em></li>`)
                .join('');
            const html = layout(
                `Nouvel${adherentsList.length > 1 ? 's' : ''} adhérent${adherentsList.length > 1 ? 's' : ''} à valider`,
                `<p>La famille <strong>${esc(fam.nom_referent || '—')}</strong> vient d'ajouter :</p>
                 <ul style="padding-left:18px">${lignes}</ul>
                 <p>Connectez-vous à l'<strong>Espace Bureau</strong> pour consulter le dossier et valider les pièces.</p>`);
            const r = await sendEmail(recipients, 'CSB Karaté — nouvel adhérent à valider', html);
            return json({ ok: true, sent: r });
        }

        // ---------------------------------------------------------------
        // validation : prévenir la famille d'une acceptation / d'un refus.
        // ---------------------------------------------------------------
        if (type === 'validation') {
            if (!adherent_id) return json({ error: 'adherent_id requis.' }, 400);

            // Autorisation : réservé au bureau (évite qu'une famille s'auto-notifie).
            const { data: prof } = await admin.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
            if (prof?.role !== 'bureau') return json({ error: 'Réservé au bureau.' }, 403);

            const { data: a } = await admin.from('adherents')
                .select('prenom, nom, statut_validation, validation_note, famille_id').eq('id', adherent_id).maybeSingle();
            if (!a) return json({ error: 'Adhérent introuvable.' }, 404);

            const { data: fam } = await admin.from('familles')
                .select('email, nom_referent').eq('id', a.famille_id).maybeSingle();
            const to = fam?.email && fam.email.includes('@') ? [fam.email] : [];
            if (!to.length) return json({ ok: true, skipped: 'famille sans email' });

            const accepte = a.statut_validation === 'accepte';
            const titre = accepte
                ? `Le dossier de ${esc(a.prenom)} a été accepté ✅`
                : `Le dossier de ${esc(a.prenom)} n'a pas pu être validé`;
            const corps = accepte
                ? `<p>Bonjour ${esc(fam?.nom_referent || '')},</p>
                   <p>Bonne nouvelle : l'inscription de <strong>${esc(a.prenom)} ${esc(a.nom)}</strong> a été <strong style="color:#2e7d32">acceptée</strong> par le bureau du club.</p>
                   <p>Vous pouvez suivre l'état du règlement et télécharger vos documents depuis votre <strong>Espace Famille</strong>.</p>`
                : `<p>Bonjour ${esc(fam?.nom_referent || '')},</p>
                   <p>L'inscription de <strong>${esc(a.prenom)} ${esc(a.nom)}</strong> a été marquée comme <strong style="color:#c62828">refusée / à revoir</strong> par le bureau.</p>
                   ${a.validation_note ? `<p><strong>Motif :</strong> ${esc(a.validation_note)}</p>` : ''}
                   <p>N'hésitez pas à contacter le bureau ou à compléter votre dossier depuis votre <strong>Espace Famille</strong>.</p>`;
            const r = await sendEmail(to, `CSB Karaté — inscription de ${a.prenom}`, layout(titre, corps));
            return json({ ok: true, sent: r });
        }

        return json({ error: 'type inconnu (attendu : new_member | validation).' }, 400);
    } catch (err) {
        console.error('[notify]', err);
        return json({ error: String((err as Error).message || err) }, 500);
    }
});
