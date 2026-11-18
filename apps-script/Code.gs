/**
 * SellSync — import automatique des mails (ventes Vinted + achats Shein).
 * À coller dans https://script.google.com (nouveau projet), CONNECTÉ AU GMAIL concerné.
 * Un script par Gmail. Seules les lignes CONFIG sont à remplir.
 *
 * Fonctionnement : toutes les 15 min, cherche les mails sans libellé « SellSync » :
 *  - Vinted « La transaction est finalisée »  → vente en attente dans SellSync ;
 *  - Vinted « Ton article s'est vendu »       → donne la vraie date de vente ;
 *  - Shein « Confirmation de votre commande » → articles dans l'onglet Stock
 *    (SEULEMENT si IMPORTER_SHEIN = true : à mettre sur le Gmail du compte d'achat).
 * Chaque mail est envoyé au webhook SellSync, puis le fil reçoit le libellé « SellSync »
 * (=> jamais renvoyé). En cas d'erreur, pas de libellé : nouvel essai 15 min plus tard.
 */

// ── CONFIG (à remplir) ──
var WEBHOOK_URL = 'https://VOTRE-APP.vercel.app/api/import/mail';
var IMPORT_SECRET = 'COLLER_ICI_LA_VALEUR_IMPORT_SECRET';
var IMPORTER_SHEIN = false; // true uniquement sur le Gmail du compte qui achète sur Shein

// ── Réglages ──
var LABEL_NAME = 'SellSync';
var WINDOW = ' -label:' + LABEL_NAME + ' newer_than:30d';
var SEARCHES = [
  // « s'est vendu » d'abord : la vente finalisée trouve ainsi sa vraie date dès le même passage.
  { kind: 'vendu', query: 'from:vinted ("s\'est vendu" OR subject:vendu)' + WINDOW },
  { kind: 'finalise', query: 'from:vinted subject:transaction subject:(finalisée OR finalisee)' + WINDOW },
  { kind: 'shein', query: 'from:(sheinnotice.com OR shein.com) subject:("Confirmation de votre commande")' + WINDOW },
];
var MAX_THREADS = 30; // par recherche et par passage

/** À lancer UNE fois à la main : autorise le script et crée le déclencheur de 15 min. */
function installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importerVentes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importerVentes').timeBased().everyMinutes(15).create();
  importerVentes(); // premier passage tout de suite
}

/** Le message correspond-il à la recherche ? (évite d'envoyer les autres mails du fil) */
function correspond(kind, subject, body) {
  var t = subject + '\n' + body;
  if (kind === 'finalise') return /finalis/i.test(t);
  if (kind === 'vendu') return /s['’]est vendu|a été vendu/i.test(t) && !/finalis/i.test(t);
  if (kind === 'shein') return /confirmation de (votre|ta) commande/i.test(t) && /SKU\s*:/i.test(body);
  return false;
}

/** Appelée par le déclencheur. (Nom gardé pour les déclencheurs déjà installés.) */
function importerVentes() {
  var label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  var account = Session.getActiveUser().getEmail();
  var tz = Session.getScriptTimeZone() || 'Europe/Paris';
  var bilan = { fils: 0, envoyes: 0, erreurs: 0 };

  SEARCHES.forEach(function (s) {
    if (s.kind === 'shein' && !IMPORTER_SHEIN) return;
    var threads = GmailApp.search(s.query, 0, MAX_THREADS);
    bilan.fils += threads.length;
    threads.forEach(function (thread) {
      var okThread = true;
      thread.getMessages().forEach(function (msg) {
        var subject = msg.getSubject() || '';
        var body = msg.getPlainBody() || '';
        if (!correspond(s.kind, subject, body)) return;
        var payload = {
          account: account,
          messageId: msg.getId(),
          subject: subject,
          from: msg.getFrom() || '',
          body: body.slice(0, 50000),
          receivedDate: Utilities.formatDate(msg.getDate(), tz, 'yyyy-MM-dd'),
        };
        if (s.kind === 'shein') payload.html = (msg.getBody() || '').slice(0, 400000); // photos des articles
        var res = UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-import-secret': IMPORT_SECRET },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload),
        });
        var code = res.getResponseCode();
        if (code === 200) {
          bilan.envoyes++;
        } else {
          okThread = false;
          bilan.erreurs++;
          console.warn('SellSync ' + code + ' pour « ' + subject + ' » : ' + res.getContentText().slice(0, 300));
        }
      });
      if (okThread) thread.addLabel(label);
    });
  });
  console.log('SellSync : ' + bilan.fils + ' fil(s), ' + bilan.envoyes + ' envoyé(s), ' + bilan.erreurs + ' erreur(s).');
}
