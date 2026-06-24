// =============================================================
// GÉNÉRATION PDF — pdf.js  (script classique, window.CSBPdf)
// =============================================================
// Factorise la production des deux documents du module gestion :
//   - attestation de paiement (espace adhérent, NON fiscale, sans numéro) ;
//   - facture (espace bureau, fiscale, numérotée par la base — cf. migration 0009).
// Les deux partagent l'en-tête (identité du club) et le pied (mentions légales),
// d'où ce module commun plutôt qu'une duplication dans adherent.js / membres.js.
//
// jsPDF est chargé À LA DEMANDE (lazy) depuis le CDN : les pages qui n'éditent
// pas de PDF ne paient pas son poids. Tout en CENTIMES en entrée (cf. tarifs.js).
// =============================================================

(function (global) {
    'use strict';

    // -------------------------------------------------------------
    // Identité légale du club — À COMPLÉTER par le bureau.
    // -------------------------------------------------------------
    // Centralisée ici (un seul endroit) car réutilisée par les deux documents.
    // Les valeurs « [À REMPLIR] » doivent être renseignées avant toute émission
    // de facture réelle (obligations légales : émetteur identifiable).
    const CLUB = {
        nom:        'CSB Karaté Brétigny',
        statut:     'Association loi 1901',
        adresse:    '[À REMPLIR — adresse]',
        codePostal: '[CP]',
        ville:      'Brétigny-sur-Orge',
        email:      '[À REMPLIR — email]',
        telephone:  '[À REMPLIR — téléphone]',
        siret:      '',  // facultatif (laisser vide si l'association n'en a pas)
        // Mention TVA : la plupart des associations sportives ne sont pas
        // assujetties (franchise en base). Adapter si la situation diffère.
        mentionTva: 'TVA non applicable, art. 293 B du CGI'
    };

    // --- Mise en page (mm, format A4) ---
    const M = 18;          // marge gauche/droite
    const PAGE_W = 210;
    const RIGHT = PAGE_W - M;

    // Couleurs charte (jsPDF travaille en RGB 0–255).
    const ENCRE = [13, 27, 42];
    const CORAIL = [230, 57, 70];
    const GRIS = [120, 128, 140];

    // -------------------------------------------------------------
    // Chargement paresseux de jsPDF (UMD → window.jspdf.jsPDF)
    // -------------------------------------------------------------
    let jsPdfPromise = null;
    function ensureJsPDF() {
        if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf.jsPDF);
        if (jsPdfPromise) return jsPdfPromise;
        jsPdfPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = () => (global.jspdf && global.jspdf.jsPDF)
                ? resolve(global.jspdf.jsPDF)
                : reject(new Error('jsPDF indisponible après chargement.'));
            s.onerror = () => reject(new Error('Échec du chargement de jsPDF (connexion ?).'));
            document.head.appendChild(s);
        });
        return jsPdfPromise;
    }

    // --- Helpers de formatage ---
    // Formateur DÉDIÉ au PDF : on n'utilise PAS Intl (CSBTarifs.formatEuros)
    // car il insère une espace fine insécable (U+202F) avant « € », mal rendue
    // par les polices standard de jsPDF. Ici : séparateur de milliers en espace
    // ASCII normal, virgule décimale française.
    function eur(centimes) {
        const n = (Math.round(centimes || 0) / 100).toFixed(2);
        const [ent, dec] = n.split('.');
        const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${groupe},${dec} €`;
    }
    function dateFr(d) {
        const dt = d ? new Date(d) : new Date();
        return isNaN(dt) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    // -------------------------------------------------------------
    // Blocs communs
    // -------------------------------------------------------------
    function setColor(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

    // En-tête : identité du club à gauche, titre du document à droite.
    function drawHeader(doc, titre, sousTitre) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(17); setColor(doc, ENCRE);
        doc.text('CSB ', M, 22);
        const w = doc.getTextWidth('CSB ');
        setColor(doc, CORAIL); doc.text('Karaté', M + w, 22);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, GRIS);
        const lignes = [
            CLUB.statut,
            `${CLUB.adresse}, ${CLUB.codePostal} ${CLUB.ville}`,
            [CLUB.email, CLUB.telephone].filter(Boolean).join(' · '),
            CLUB.siret ? `SIRET ${CLUB.siret}` : ''
        ].filter(Boolean);
        doc.text(lignes, M, 28);

        // Titre du document (aligné à droite).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); setColor(doc, ENCRE);
        doc.text(titre, RIGHT, 22, { align: 'right' });
        if (sousTitre) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(doc, GRIS);
            doc.text(sousTitre, RIGHT, 28, { align: 'right' });
        }

        setColor(doc, CORAIL); doc.setDrawColor(CORAIL[0], CORAIL[1], CORAIL[2]); doc.setLineWidth(0.6);
        doc.line(M, 46, RIGHT, 46);
        return 56; // y de départ pour la suite
    }

    // Bloc destinataire (la famille).
    function drawDestinataire(doc, snap, y) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, GRIS);
        doc.text('DESTINATAIRE', RIGHT - 70, y, { align: 'left' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); setColor(doc, ENCRE);
        const lignes = [
            snap.referent || '',
            snap.adresse || '',
            [snap.code_postal, snap.ville].filter(Boolean).join(' ')
        ].filter(Boolean);
        doc.text(lignes, RIGHT - 70, y + 6);
        return y + 6 + lignes.length * 5 + 6;
    }

    // Tableau du détail (réutilise detail_calcul produit par tarifs.js).
    function drawDetail(doc, detail, y) {
        const lignes = (detail && detail.lignes) || [];
        // En-tête de tableau.
        doc.setFillColor(245, 245, 243);
        doc.rect(M, y, RIGHT - M, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(doc, GRIS);
        doc.text('DÉSIGNATION', M + 3, y + 5.5);
        doc.text('MONTANT', RIGHT - 3, y + 5.5, { align: 'right' });
        y += 8;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(doc, ENCRE);
        lignes.forEach((l) => {
            y += 7;
            const label = `${l.nom}${l.label ? ' — ' + l.label : ''}`;
            doc.text(label, M + 3, y);
            doc.text(eur(l.montant), RIGHT - 3, y, { align: 'right' });
        });

        doc.setDrawColor(225, 225, 222); doc.setLineWidth(0.2);
        doc.line(M, y + 3, RIGHT, y + 3);
        y += 9;

        // Sous-total + remises (si présentes).
        const row = (libelle, montant, corail) => {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            setColor(doc, corail ? CORAIL : GRIS);
            doc.text(libelle, RIGHT - 60, y);
            doc.text(montant, RIGHT - 3, y, { align: 'right' });
            y += 6;
        };
        if (detail) {
            row('Sous-total', eur(detail.sousTotal));
            if (detail.remiseFamille > 0) row(`Remise famille (${detail.nbInscrits} inscrits)`, '− ' + eur(detail.remiseFamille), true);
            if (detail.remisePassSport > 0) row(`Pass'Sport (× ${detail.nbPassSport})`, '− ' + eur(detail.remisePassSport), true);
        }

        // Total TTC.
        y += 2;
        doc.setDrawColor(ENCRE[0], ENCRE[1], ENCRE[2]); doc.setLineWidth(0.4);
        doc.line(RIGHT - 60, y, RIGHT, y);
        y += 7;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setColor(doc, ENCRE);
        doc.text('TOTAL', RIGHT - 60, y);
        const total = detail ? detail.total : 0;
        doc.text(eur(total), RIGHT - 3, y, { align: 'right' });
        return y + 10;
    }

    // Pied de page : mentions légales + numérotation.
    function drawFooter(doc, extra) {
        const yBase = 280;
        doc.setDrawColor(225, 225, 222); doc.setLineWidth(0.2);
        doc.line(M, yBase, RIGHT, yBase);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(doc, GRIS);
        const lignes = [
            `${CLUB.nom} — ${CLUB.statut}`,
            CLUB.mentionTva
        ];
        if (extra) lignes.push(extra);
        doc.text(lignes, M, yBase + 5);
    }

    function saveDoc(doc, filename) {
        doc.save(filename);
    }

    // -------------------------------------------------------------
    // API publique
    // -------------------------------------------------------------

    // Attestation de paiement (NON fiscale). `ctx` :
    //   { referent, adresse, code_postal, ville, saison, detail, datePaiement }
    // À n'appeler QUE si le dossier est soldé (gating fait par l'appelant).
    async function attestation(ctx) {
        const jsPDF = await ensureJsPDF();
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const snap = ctx || {};
        let y = drawHeader(doc, 'ATTESTATION', `de paiement · saison ${snap.saison || ''}`);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); setColor(doc, ENCRE);
        const total = snap.detail ? snap.detail.total : 0;
        const intro = doc.splitTextToSize(
            `Je soussigné, représentant du ${CLUB.nom} (${CLUB.statut}), atteste que ` +
            `${snap.referent || 'la famille'} a réglé la somme de ${eur(total)} au titre des ` +
            `cotisations de la saison ${snap.saison || ''} pour les adhérents suivants :`,
            RIGHT - M
        );
        doc.text(intro, M, y);
        y += intro.length * 6 + 2;

        ((snap.detail && snap.detail.lignes) || []).forEach((l) => {
            y += 6;
            doc.text(`•  ${l.nom}${l.label ? ' — ' + l.label : ''}`, M + 2, y);
        });
        y += 12;

        doc.setFontSize(11);
        doc.text(`Règlement constaté le ${dateFr(snap.datePaiement)}.`, M, y);
        y += 8;
        doc.text(`Fait à ${CLUB.ville}, le ${dateFr()}.`, M, y);

        doc.setFont('helvetica', 'italic'); doc.setFontSize(9); setColor(doc, GRIS);
        doc.text('Document non fiscal — délivré à titre d\'attestation de règlement.', M, y + 16);

        drawFooter(doc);
        saveDoc(doc, `attestation-${CLUB.ville}-${(snap.saison || '').replace(/\W+/g, '')}.pdf`);
    }

    // Facture (fiscale). `facture` = ligne renvoyée par la fonction
    // `emettre_facture` (numéro garanti par la base) : { numero, montant,
    // saison, emise_le, snapshot:{ referent, adresse, code_postal, ville, detail } }
    async function facture(fac) {
        const jsPDF = await ensureJsPDF();
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const snap = fac.snapshot || {};
        let y = drawHeader(doc, 'FACTURE', `N° ${fac.numero}`);

        // Métadonnées (date d'émission + saison) à gauche, destinataire à droite.
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setColor(doc, GRIS);
        doc.text('Date d\'émission', M, y);
        doc.text('Saison', M, y + 11);
        setColor(doc, ENCRE); doc.setFontSize(11);
        doc.text(dateFr(fac.emise_le), M, y + 5);
        doc.text(fac.saison || '', M, y + 16);

        drawDestinataire(doc, snap, y - 4);
        y += 28;

        y = drawDetail(doc, snap.detail, y);

        // Mention d'acquittement (la facture n'est émise que dossier soldé).
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setColor(doc, ENCRE);
        doc.text('Facture acquittée.', M, y + 4);
        doc.setFont('helvetica', 'normal'); setColor(doc, GRIS); doc.setFontSize(9);
        doc.text('Le règlement de la totalité a été constaté par le bureau du club.', M, y + 10);

        drawFooter(doc, `Facture N° ${fac.numero} · émise le ${dateFr(fac.emise_le)}`);
        saveDoc(doc, `facture-${fac.numero}.pdf`);
    }

    global.CSBPdf = { attestation, facture, CLUB };
})(window);
