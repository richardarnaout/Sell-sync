/**
 * Vérification du parseur Vinted et du webhook (sans base, sans réseau).
 * Lancer : npm run verif:import
 * Mails reconstitués + exemples RÉELS anonymisés (T-021 : Vinted finalisé du 11/11/2026, Shein confirmation du 17/11/2026).
 * Le mail « Ton article s'est vendu » reste reconstitué (aucun exemple réel pour l'instant).
 */
import assert from 'node:assert/strict';
import { parseVintedFinalized, parseVintedSold, parseAmount, findDate } from '../app/lib/parseVinted';
import { matchScore } from '../app/lib/matchSale';
import { importMail, legacyImportVinted, VINTED_IGNORED_REASON, mailFingerprint, resolveUserId, secretMatches, type PendingRow, type MailInput, type ImportDeps, type SoldNoticeRow, type PurchaseRow, type UnparsedRow } from '../app/lib/importMail';
import { parseSheinOrder, sheinPhotos, sheinPhotoByAlt } from '../app/lib/parseShein';
import { sizeKey, sameSizeStock, type Purchase, type PendingSale } from '../app/lib/stock';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log('ok -', name);
}

const SUBJECT = 'La transaction est finalisée';
const MAIL_INLINE = [
  'Bonjour,',
  "La transaction est finalisée. L'argent a été ajouté à ton porte-monnaie Vinted.",
  'Article : Robe Violetta Tifany',
  'Taille : M',
  'Couleur : lila',
  'Montant de la commande : 29,00 €',
  'Frais de port : 2,88 €',
  'N° de transaction : 20886805143',
].join('\n');
const MAIL_LINES = [
  'La transaction est finalisée',
  '',
  'Article',
  'Robe Violetta Tifany',
  'Taille',
  'M',
  'Frais de port',
  '3,49 €',
  'Montant de la commande',
  '1 234,50 €',
  'Date',
  '18/07/2026 17 h 05',
].join('\r\n');
const MAIL_SOLD = ["Ton article s'est vendu !", 'Article : Jupe plissée', 'Montant de la commande : 12,00 €'].join('\n');
const MAIL_NO_AMOUNT = ['La transaction est finalisée', 'Article : Pull marin', 'Taille : L'].join('\n');

(async () => {
  await test('montants', () => {
    assert.equal(parseAmount('29,00 €'), 29);
    assert.equal(parseAmount('€ 7.5'), 7.5);
    assert.equal(parseAmount('1 234,50 €'), 1234.5);
    assert.ok(Number.isNaN(parseAmount('gratuit')));
  });
  await test('dates', () => {
    assert.equal(findDate('le 18/07/2026 17 h 05'), '2026-07-18');
    assert.equal(findDate('le 1er août 2026'), '2026-08-01');
    assert.equal(findDate('aucune'), '');
  });
  await test('mail finalisé, libellés sur la même ligne', () => {
    const r = parseVintedFinalized(SUBJECT, MAIL_INLINE, '2026-07-19');
    assert.deepEqual(r, {
      ok: true,
      sale: { article: 'Robe Violetta Tifany', size: 'M', color: 'lila', price: 29, date: '2026-07-19', transactionNumber: '20886805143' },
    });
  });
  await test('valeurs sur la ligne suivante, frais de port ignorés, date du corps', () => {
    const r = parseVintedFinalized(SUBJECT, MAIL_LINES, '2026-07-20');
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.sale.article, 'Robe Violetta Tifany');
      assert.equal(r.sale.size, 'M');
      assert.equal(r.sale.price, 1234.5);
      assert.equal(r.sale.date, '2026-07-18');
      assert.equal(r.sale.transactionNumber, '');
    }
  });
  await test("« Ton article s'est vendu » ignoré", () => {
    assert.deepEqual(parseVintedFinalized("Ton article s'est vendu", MAIL_SOLD, '2026-07-19'), { ok: false, reason: 'not_finalized' });
  });
  await test('montant absent → échec propre', () => {
    assert.deepEqual(parseVintedFinalized(SUBJECT, MAIL_NO_AMOUNT, '2026-07-19'), { ok: false, reason: 'missing_fields', missing: ['montant'] });
  });

  // ── Webhook avec une fausse base (mêmes règles d'unicité que supabase/import-mail.sql) ──
  const rows: PendingRow[] = [];
  const fakeInsert = async (row: PendingRow) => {
    const dup = rows.some(
      (r) =>
        r.user_id === row.user_id &&
        ((row.transaction_number && r.transaction_number === row.transaction_number) || r.mail_fingerprint === row.mail_fingerprint),
    );
    if (dup) return 'duplicate' as const;
    rows.push(row);
    return 'inserted' as const;
  };
  const mail = (body: string, messageId: string, subject = SUBJECT): MailInput => ({
    account: 'Vendeur@Gmail.com',
    messageId,
    subject,
    body,
    receivedDate: '2026-07-19',
  });

  await test('[ancien flux Vinted] insertion puis doublons (même mail renvoyé, même transaction via un autre mail)', async () => {
    const a = await legacyImportVinted(mail(MAIL_INLINE, 'm1'), 'u1', { insertPending: fakeInsert });
    assert.equal(a.status, 'inserted');
    assert.equal(rows[0].sale_price, 29);
    assert.equal(rows[0].source_account, 'vendeur@gmail.com');
    assert.equal((await legacyImportVinted(mail(MAIL_INLINE, 'm1'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal((await legacyImportVinted(mail(MAIL_INLINE, 'm2'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal((await legacyImportVinted(mail(MAIL_LINES, 'm3'), 'u1', { insertPending: fakeInsert })).status, 'inserted');
    assert.equal((await legacyImportVinted(mail(MAIL_LINES, 'm3'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal(rows.length, 2);
  });
  await test('[ancien flux Vinted] mail non finalisé → ignored, rien écrit', async () => {
    const r = await legacyImportVinted(mail(MAIL_SOLD, 'm4', "Ton article s'est vendu"), 'u1', { insertPending: fakeInsert });
    assert.equal(r.status, 'ignored');
    assert.equal(rows.length, 2);
  });
  await test("[ancien flux Vinted] parseur en échec : Gemini seulement s'il est configuré", async () => {
    const sans = await legacyImportVinted(mail(MAIL_NO_AMOUNT, 'm5'), 'u1', { insertPending: fakeInsert });
    assert.equal(sans.status, 'unparsed');
    let appels = 0;
    const avec = await legacyImportVinted(mail(MAIL_NO_AMOUNT, 'm5'), 'u1', {
      insertPending: fakeInsert,
      aiFallback: async () => {
        appels++;
        return { article: 'Pull marin', size: 'L', color: '', price: 15, date: '2026-07-19', transactionNumber: '' };
      },
    });
    assert.equal(appels, 1);
    assert.ok(avec.status === 'inserted' && 'via' in avec && avec.via === 'gemini');
    let appelsInutiles = 0;
    await legacyImportVinted(mail(MAIL_INLINE, 'm6'), 'u1', {
      insertPending: fakeInsert,
      aiFallback: async () => {
        appelsInutiles++;
        return null;
      },
    });
    assert.equal(appelsInutiles, 0, 'Gemini ne doit pas être appelé quand le parseur réussit');
  });
  await test('secret, utilisateur, empreinte', () => {
    assert.ok(secretMatches('abc', 'abc'));
    assert.ok(!secretMatches('abd', 'abc'));
    assert.ok(!secretMatches(null, 'abc'));
    assert.ok(!secretMatches('abc', undefined));
    const env = { IMPORT_USER_MAP: '{"a@gmail.com":"u-a"}', IMPORT_USER_ID: 'u-def' };
    assert.equal(resolveUserId('A@gmail.com', env), 'u-a');
    assert.equal(resolveUserId('b@gmail.com', env), 'u-def');
    assert.equal(resolveUserId('b@gmail.com', {}), null);
    assert.equal(mailFingerprint(mail('x', 'id1')), mailFingerprint(mail('y', 'id1')));
  });

  // ══ T-021 : exemples réels anonymisés (hq/cache/sellsync/exemples-mails.md) ══
  const REAL_FINALIZED = [
    'La transaction est finalisée',
    '| La vente de Robe longue fleurie taille M a été réalisée avec succès. |',
    '| N° de Transaction : #23324499342 |',
    '| Date : 11/11/2026 14 h 32 |',
    '| Montant de la commande : | 29,00 € |',
    '| Viré sur ton compte Vinted : | 29,00 € |',
  ].join('\n');
  const SHEIN_SUBJECT = 'Confirmation de votre commande';
  const SHEIN_ONE = [
    'Merci pour votre commande !',
    'Numéro de commande: GSO1AT280000AW1 | Montant total: 57.41€',
    'Date de paiement : 17 Nov 2026',
    "SHEIN EZwear Manteau long élégant et moelleux pour femme, beige, col montant, manches longues, avec poches, pour sorties, soirées et rendez-vous d'hiver SKU: sz2408175405533444 TAILLE: Gris pâle-XL QTÉ: 1 Prix unitaire: 57.41€",
    'Frais de port: | 0.00€',
    'Total: | 57.41€',
  ].join('\n');
  const SHEIN_HTML_ONE = '<img src="https://img.ltwebstatic.com/images3_spmp/logo.png"><img src="https://img.ltwebstatic.com/v4/j/pi/2024/manteau_thumbnail_220x293.jpg?a=1&amp;b=2">';
  const SHEIN_TWO = [
    'Numéro de commande: GSO1TEST0000ZZ9',
    'Date de paiement : 3 Déc 2026',
    '| Robe midi plissée à fines bretelles |',
    '| SKU: sz2501010000000001 | TAILLE: Noir-M | QTÉ: 2 | Prix unitaire: 12.50€ |',
    'SHEIN Pull côtelé col roulé SKU: sw2501010000000002 TAILLE: S QTÉ: 1 Prix unitaire: 9.99€',
    'Total: | 34.99€',
  ].join('\n');
  const SHEIN_HTML_TWO = '<img src="//img.ltwebstatic.com/v4/j/pi/robe.jpg"><img src="//img.ltwebstatic.com/v4/j/pi/pull.jpg"><img src="//img.ltwebstatic.com/v4/j/pi/robe.jpg">';
  const SOLD_SUBJECT = "Ton article s'est vendu !";
  const SOLD_BODY = ['Bonne nouvelle !', 'Ton article « Robe longue fleurie taille M » s\'est vendu.', 'Envoie-le dès que possible.'].join('\n');

  await test('Vinted finalisé — format réel du 11/11/2026', () => {
    const r = parseVintedFinalized(SUBJECT, REAL_FINALIZED, '2026-11-12');
    assert.deepEqual(r, {
      ok: true,
      sale: { article: 'Robe longue fleurie taille M', size: 'M', color: '', price: 29, date: '2026-11-11', transactionNumber: '23324499342' },
    });
  });
  await test('Shein confirmation — format réel (1 article, photo du HTML)', () => {
    const r = parseSheinOrder(SHEIN_SUBJECT, SHEIN_ONE, '2026-11-18', SHEIN_HTML_ONE, 'SHEIN <noreply@sheinnotice.com>');
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.equal(r.order.orderNumber, 'GSO1AT280000AW1');
    assert.equal(r.order.date, '2026-11-17');
    assert.equal(r.order.items.length, 1);
    const it = r.order.items[0];
    assert.equal(it.model, 'SHEIN EZwear');
    assert.ok(it.article.startsWith('Manteau long élégant'));
    assert.ok(it.article.endsWith("rendez-vous d'hiver"));
    assert.equal(it.sku, 'sz2408175405533444');
    assert.equal(it.color, 'Gris pâle');
    assert.equal(it.size, 'XL');
    assert.equal(it.quantity, 1);
    assert.equal(it.unitPrice, 57.41);
    assert.equal(it.photoUrl, 'https://img.ltwebstatic.com/v4/j/pi/2024/manteau_thumbnail_220x293.jpg?a=1&b=2');
  });
  await test('Shein : plusieurs articles, cellules « | », quantité 2, date « 3 Déc »', () => {
    const r = parseSheinOrder(SHEIN_SUBJECT, SHEIN_TWO, '2026-12-04', SHEIN_HTML_TWO);
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.equal(r.order.date, '2026-12-03');
    const [a, b] = r.order.items;
    assert.deepEqual([a.article, a.color, a.size, a.quantity, a.unitPrice, a.photoUrl],
      ['Robe midi plissée à fines bretelles', 'Noir', 'M', 2, 12.5, 'https://img.ltwebstatic.com/v4/j/pi/robe.jpg']);
    assert.deepEqual([b.model, b.article, b.color, b.size, b.quantity, b.unitPrice, b.photoUrl],
      ['SHEIN', 'Pull côtelé col roulé', '', 'S', 1, 9.99, 'https://img.ltwebstatic.com/v4/j/pi/pull.jpg']);
    assert.deepEqual(parseSheinOrder('Votre colis est livré', 'Livré', '2026-12-04'), { ok: false, reason: 'not_shein_order' });
  });

  await test('T-033 photos Shein : format « images3_pi », entités HTML, photo choisie par texte alternatif', () => {
    // Ancien format du CDN (toujours servi) : n'était pas reconnu → photo_url vide → carrés dans l'app.
    assert.deepEqual(sheinPhotos('<img src="https://img.ltwebstatic.com/images3_pi/2024/11/15/9d/1731_thumbnail_405x552.jpg">'),
      ['https://img.ltwebstatic.com/images3_pi/2024/11/15/9d/1731_thumbnail_405x552.jpg']);
    // URL dans un style « url(&quot;…&quot;) » : le &quot; ne doit pas rester collé à l'URL.
    assert.deepEqual(sheinPhotos('<td style="background:url(&quot;//img.ltwebstatic.com/v4/j/pi/a.jpg&quot;)">'),
      ['https://img.ltwebstatic.com/v4/j/pi/a.jpg']);
    // Logos / bannières hors « pi » ignorés.
    assert.deepEqual(sheinPhotos('<img src="https://img.ltwebstatic.com/images3_ccc/2024/logo.png">'), []);
    // Une suggestion avant l'article : l'ordre seul se tromperait, le texte alternatif tranche.
    const html = '<img alt="Vous aimerez aussi" src="https://img.ltwebstatic.com/v4/j/pi/suggestion.jpg">'
      + '<img src="https://img.ltwebstatic.com/images3_pi/2024/manteau.jpg" alt="SHEIN EZwear Manteau long &eacute;l&eacute;gant et moelleux pour femme, beige, col montant, manches longues, avec poches, pour sorties, soir&eacute;es et rendez-vous d&#39;hiver">';
    const r = parseSheinOrder(SHEIN_SUBJECT, SHEIN_ONE, '2026-11-18', html.replace(/&eacute;/g, 'é'), 'SHEIN <noreply@sheinnotice.com>');
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.equal(r.order.items[0].photoUrl, 'https://img.ltwebstatic.com/images3_pi/2024/manteau.jpg');
  });

  // ── Fausse base complète (mêmes règles d'unicité que les fichiers SQL) ──
  const db = { pending: [] as (PendingRow & { id: string })[], notices: [] as (SoldNoticeRow & { id: string; used: boolean })[], purchases: [] as PurchaseRow[] };
  const deps: ImportDeps = {
    insertPending: async (row) => {
      if (db.pending.some((r) => r.user_id === row.user_id && ((row.transaction_number && r.transaction_number === row.transaction_number) || r.mail_fingerprint === row.mail_fingerprint))) return 'duplicate';
      db.pending.push({ ...row, id: `p${db.pending.length + 1}` });
      return 'inserted';
    },
    listSoldNotices: async (u, from, to) =>
      db.notices.filter((x) => x.user_id === u && !x.used && x.date >= from && x.date <= to)
        .map((x) => ({ id: x.id, date: x.date, article: x.article, size: x.size, price: x.price })),
    listApproxPending: async (u, from, to) =>
      db.pending.filter((x) => x.user_id === u && x.date_approx && x.status === 'en_attente' && x.date >= from && x.date <= to)
        .map((x) => ({ id: x.id, date: x.date, article: x.article, size: x.size, sale_price: x.sale_price })),
    markNoticeUsed: async (id) => { const n = db.notices.find((x) => x.id === id); if (n) n.used = true; },
    insertSoldNotice: async (row) => {
      if (db.notices.some((x) => x.user_id === row.user_id && x.mail_fingerprint === row.mail_fingerprint)) return { status: 'duplicate' };
      const id = `n${db.notices.length + 1}`;
      db.notices.push({ ...row, id, used: false });
      return { status: 'inserted', id };
    },
    setPendingDate: async (id, date) => {
      const p = db.pending.find((x) => x.id === id && x.date_approx && x.status === 'en_attente');
      if (!p) return false;
      p.date = date;
      p.date_approx = false;
      return true;
    },
    insertPurchase: async (row) => {
      if (db.purchases.some((x) => x.user_id === row.user_id && x.order_number === row.order_number && x.sku === row.sku && x.unit_index === row.unit_index)) return 'duplicate';
      db.purchases.push(row);
      return 'inserted';
    },
    fillPurchasePhoto: async (row) => {
      const p = db.purchases.find((x) => x.user_id === row.user_id && x.order_number === row.order_number && x.sku === row.sku && x.unit_index === row.unit_index);
      if (p && !p.photo_url) p.photo_url = row.photo_url;
    },
  };
  const m2 = (subject: string, body: string, id: string, receivedDate: string, extra: Partial<MailInput> = {}): MailInput =>
    ({ account: 'Vendeur@Gmail.com', messageId: id, subject, body, receivedDate, ...extra });

  await test('Shein → stock : 1 ligne par unité, anti-doublon SKU + n° de commande', async () => {
    const a = await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 's1', '2026-12-04', { html: SHEIN_HTML_TWO }), 'u1', deps);
    assert.ok(a.status === 'inserted' && 'kind' in a && a.kind === 'shein_order' && a.inserted === 3 && a.duplicates === 0);
    assert.deepEqual(db.purchases.map((p) => [p.sku, p.unit_index, p.purchase_price]),
      [['sz2501010000000001', 1, 12.5], ['sz2501010000000001', 2, 12.5], ['sw2501010000000002', 1, 9.99]]);
    assert.equal(db.purchases[0].photo_url, 'https://img.ltwebstatic.com/v4/j/pi/robe.jpg');
    const again = await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 's1-bis', '2026-12-05'), 'u1', deps);
    assert.ok(again.status === 'duplicate' && 'kind' in again && again.kind === 'shein_order' && again.duplicates === 3);
    assert.equal(db.purchases.length, 3);
  });
  await test("T-033 ré-import : la photo manquante est rattrapée, une photo existante n'est pas écrasée", async () => {
    db.purchases[2].photo_url = null; // achat importé avant le correctif, sans photo
    const html = '<img src="//img.ltwebstatic.com/images3_pi/robe-bis.jpg"><img src="//img.ltwebstatic.com/images3_pi/pull-bis.jpg">';
    const r = await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 's1-ter', '2026-12-06', { html }), 'u1', deps);
    assert.ok(r.status === 'duplicate');
    assert.equal(db.purchases.length, 3);
    assert.equal(db.purchases[0].photo_url, 'https://img.ltwebstatic.com/v4/j/pi/robe.jpg');
    assert.equal(db.purchases[2].photo_url, 'https://img.ltwebstatic.com/images3_pi/pull-bis.jpg');
  });
  await test("[ancien flux Vinted] date de vente = date du mail « s'est vendu » (avant le « finalisée »)", async () => {
    const s = await legacyImportVinted(m2(SOLD_SUBJECT, SOLD_BODY, 'v1', '2026-11-08'), 'u1', deps);
    assert.ok(s.status === 'inserted' && 'kind' in s && s.kind === 'vinted_sold' && s.date === '2026-11-08');
    const f = await legacyImportVinted(m2(SUBJECT, REAL_FINALIZED, 'f1', '2026-11-12'), 'u1', deps);
    assert.ok(f.status === 'inserted' && 'dateApprox' in f && !f.dateApprox);
    const row = db.pending.find((p) => p.transaction_number === '23324499342')!;
    assert.equal(row.date, '2026-11-08');
    assert.equal(row.date_approx, false);
    assert.equal(db.notices[0].used, true);
  });
  await test("[ancien flux Vinted] sans « s'est vendu » : date du finalisé + date_approx, corrigée si l'avis arrive après", async () => {
    await legacyImportVinted(m2(SUBJECT, MAIL_INLINE, 'f2', '2026-07-19'), 'u1', deps);
    const row = db.pending.find((p) => p.transaction_number === '20886805143')!;
    assert.equal(row.date, '2026-07-19');
    assert.equal(row.date_approx, true);
    const late = await legacyImportVinted(m2(SOLD_SUBJECT, "Ton article « Robe Violetta Tifany » s'est vendu.", 'v2', '2026-07-16'), 'u1', deps);
    assert.ok('kind' in late && late.kind === 'vinted_sold' && late.fixedPending);
    assert.equal(row.date, '2026-07-16');
    assert.equal(row.date_approx, false);
    assert.equal((await legacyImportVinted(m2(SOLD_SUBJECT, SOLD_BODY, 'v1', '2026-11-08'), 'u1', deps)).status, 'duplicate');
  });
  // ══ T-021.2 : correctifs après le premier import réel (18/11/2026) ══
  // Texte brut Gmail réel : la photo de l'article apparaît en « [image: <alt>] ».
  const soldReal = (alt: string, line: string) => ['Bonjour vendeuse,', 'acheteuse a acheté', `[image: ${alt}]`, line, 'Envoie-le dès que possible.'].join('\n');
  const finalReal = (article: string, tx: string, date: string, montant: string) => [
    'La transaction est finalisée',
    `| [image: ${article}] |`,
    `| La vente de ${article} a été réalisée avec succès. |`,
    `| N° de Transaction : #${tx} |`,
    `| Date : ${date} 10 h 00 |`,
    `| Montant de la commande : | ${montant} |`,
  ].join('\n');

  await test("[image: …] retiré du nom (s'est vendu, finalisée) ; repli sur le texte alternatif", () => {
    const a = parseVintedSold(SOLD_SUBJECT, soldReal('Robe Talya bleue nuits a mo…', '| Robe Talya bleue nuits à motifs 18,00 € |'), '2026-10-25');
    assert.ok(a.ok && a.notice.article === 'Robe Talya bleue nuits à motifs' && a.notice.price === 18, JSON.stringify(a));
    const b = parseVintedSold(SOLD_SUBJECT, ['acheteuse a acheté', '| [image: Robe lilas lumina Taille L] |', '| 25,00 € |'].join('\n'), '2026-10-29');
    assert.ok(b.ok && b.notice.article === 'Robe lilas lumina Taille L' && b.notice.size === 'L' && b.notice.price === 25, JSON.stringify(b));
    const c = parseVintedSold(SOLD_SUBJECT, 'acheteuse a acheté [image] Jupe courte [image: x] 9 €', '2026-10-29');
    assert.ok(c.ok && c.notice.article === 'Jupe courte', JSON.stringify(c));
    const f = parseVintedFinalized(SUBJECT, finalReal('Robe lumina taille L', '1', '07/11/2026', '25,00 €'), '2026-11-07');
    assert.ok(f.ok && f.sale.article === 'Robe lumina taille L', JSON.stringify(f));
  });
  await test('Shein : texte brut Gmail réel avec « [image: …] » (photo + nom, ou nom seulement dans la photo)', () => {
    const body = [
      '[image: SHEIN] Merci pour votre commande !',
      'Numéro de commande: GSO1AT280000AW1 | Montant total: 57.41€',
      'Date de paiement : 17 Nov 2026',
      '[image: SHEIN EZwear Manteau long beige]',
      'SHEIN EZwear Manteau long élégant et moelleux pour femme SKU: sz2408175405533444 TAILLE: Gris pâle-XL QTÉ: 1 Prix unitaire: 57.41€',
      '| [image: Robe midi plissée] | SKU: sz2501010000000001 | TAILLE: Noir-M | QTÉ: 1 | Prix unitaire: 12.50€ |',
      'Total: | 69.91€',
    ].join('\n');
    const r = parseSheinOrder(SHEIN_SUBJECT, body, '2026-11-17', '', 'SHEIN <noreply@sheinnotice.com>');
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.deepEqual(r.order.items.map((i) => [i.model, i.article, i.size, i.unitPrice]), [
      ['SHEIN EZwear', 'Manteau long élégant et moelleux pour femme', 'XL', 57.41],
      ['', 'Robe midi plissée', 'M', 12.5],
    ]);
    // Format inattendu (pas de SKU) d'un expéditeur Shein → 422 (« Mails à vérifier »), pas ignoré.
    const bad = parseSheinOrder(SHEIN_SUBJECT, 'Merci pour votre commande', '2026-11-17', '', 'noreply@sheinnotice.com');
    assert.ok(!bad.ok && bad.reason === 'missing_fields');
  });
  await test('score de rapprochement : titres différents acceptés, contradictions refusées', () => {
    const lumina = { article: 'Robe lumina', size: 'L', price: 25, date: '2026-11-07' };
    assert.ok(matchScore(lumina, { article: 'Robe lilas lumina Taille L', size: 'L', price: null, date: '2026-10-29' }) !== null);
    const jena = { article: 'Jena Stradivarius', size: '40', price: 4, date: '2026-10-25' };
    assert.ok(matchScore(jena, { article: 'Jena Stradivarius taille 40', size: '40', price: null, date: '2026-10-21' }) !== null);
    assert.equal(matchScore(lumina, { article: 'Robe lilas lumina Taille M', size: 'M', price: null, date: '2026-10-29' }), null, 'taille différente');
    assert.equal(matchScore(lumina, { article: 'Robe lilas lumina Taille L', size: 'L', price: 30, date: '2026-10-29' }), null, 'prix différent');
    assert.equal(matchScore(lumina, { article: 'Robe lilas lumina Taille L', size: 'L', price: null, date: '2026-11-08' }), null, 'vendu après finalisé');
    assert.equal(matchScore(lumina, { article: 'Robe lilas lumina Taille L', size: 'L', price: null, date: '2026-10-07' }), null, 'écart > 30 jours');
    assert.equal(matchScore({ article: 'Pantalon noir Zara', size: 'M', price: 10, date: '2026-11-07' },
      { article: 'Pantalon beige Zara', size: 'M', price: 10, date: '2026-11-01' }), null, 'couleur différente');
    assert.equal(matchScore({ article: 'Robe lumina', size: '', price: null, date: '2026-11-07' },
      { article: 'Robe lilas lumina', size: '', price: null, date: '2026-11-01' }), null, '1 seul mot commun sans taille ni prix');
  });
  await test('[ancien flux Vinted] import réel : finalisé « Robe lumina » rattaché au vendu « [image: Robe lilas lumina Taille L] »', async () => {
    const before = db.notices.length;
    await legacyImportVinted(m2(SOLD_SUBJECT, ['acheteuse a acheté', '| [image: Robe lilas lumina Taille L] |', '| 25,00 € |'].join('\n'), 'r1', '2026-10-29'), 'u1', deps);
    assert.equal(db.notices[before].article, 'Robe lilas lumina Taille L');
    const f = await legacyImportVinted(m2(SUBJECT, finalReal('Robe lumina taille L', '90000000001', '07/11/2026', '25,00 €'), 'r2', '2026-11-07'), 'u1', deps);
    assert.ok(f.status === 'inserted' && 'dateApprox' in f && !f.dateApprox, JSON.stringify(f));
    assert.equal(db.pending.find((p) => p.transaction_number === '90000000001')!.date, '2026-10-29');
    assert.equal(db.notices[before].used, true);
  });
  await test('[ancien flux Vinted] import réel inverse : finalisé « Jena Stradivarius » (40, 4 €) puis vendu « Jena Stradivarius taille 40 »', async () => {
    const f = await legacyImportVinted(m2(SUBJECT, finalReal('Jena Stradivarius taille 40', '90000000002', '25/10/2026', '4,00 €'), 'r3', '2026-10-25'), 'u1', deps);
    assert.ok('dateApprox' in f && f.dateApprox);
    const s = await legacyImportVinted(m2(SOLD_SUBJECT, soldReal('Jena Stradivarius taille 40', '| Jena Stradivarius taille 40 4,00 € |'), 'r4', '2026-10-21'), 'u1', deps);
    assert.ok('kind' in s && s.kind === 'vinted_sold' && s.fixedPending, JSON.stringify(s));
    const row = db.pending.find((p) => p.transaction_number === '90000000002')!;
    assert.deepEqual([row.date, row.date_approx], ['2026-10-21', false]);
  });
  await test('[ancien flux Vinted] candidat ambigu (deux « vendu » possibles) → aucun rattachement, date_approx gardée', async () => {
    await legacyImportVinted(m2(SOLD_SUBJECT, soldReal('Pull Mango vert taille S', '| Pull Mango vert taille S 15,00 € |'), 'a1', '2026-09-01'), 'u1', deps);
    await legacyImportVinted(m2(SOLD_SUBJECT, soldReal('Pull Mango vert taille S', '| Pull Mango vert taille S 15,00 € |'), 'a2', '2026-09-03'), 'u1', deps);
    const f = await legacyImportVinted(m2(SUBJECT, finalReal('Pull Mango vert taille S', '90000000003', '06/09/2026', '15,00 €'), 'a3', '2026-09-06'), 'u1', deps);
    assert.ok('dateApprox' in f && f.dateApprox, JSON.stringify(f));
    const row = db.pending.find((p) => p.transaction_number === '90000000003')!;
    assert.deepEqual([row.date, row.date_approx], ['2026-09-06', true]);
    assert.ok(db.notices.filter((n) => n.article.startsWith('Pull Mango')).every((n) => !n.used));
    // Sens inverse : deux ventes approximatives possibles pour un même avis → rien.
    await legacyImportVinted(m2(SUBJECT, finalReal('Gilet Kiabi rose taille M', '90000000004', '10/08/2026', '8,00 €'), 'b1', '2026-08-10'), 'u1', deps);
    await legacyImportVinted(m2(SUBJECT, finalReal('Gilet Kiabi rose taille M', '90000000005', '12/08/2026', '8,00 €'), 'b2', '2026-08-12'), 'u1', deps);
    const s = await legacyImportVinted(m2(SOLD_SUBJECT, soldReal('Gilet Kiabi rose taille M', '| Gilet Kiabi rose taille M 8,00 € |'), 'b3', '2026-08-08'), 'u1', deps);
    assert.ok('kind' in s && s.kind === 'vinted_sold' && !s.fixedPending);
    assert.ok(db.pending.filter((p) => p.article.startsWith('Gilet Kiabi')).every((p) => p.date_approx));
  });
  await test('mail trouvé par la recherche Shein mais non reconnu → 422 (à vérifier), pas ignoré', async () => {
    const r = await importMail(m2('Votre commande', 'Bonjour', 'h1', '2026-11-17', { hint: 'shein' }), 'u1', deps);
    assert.equal(r.status, 'unparsed');
    const sansHint = await importMail(m2('Votre commande', 'Bonjour', 'h2', '2026-11-17'), 'u1', deps);
    assert.equal(sansHint.status, 'ignored');
  });

  await test("mail Shein non reconnu (422) noté pour l'app ; une base en panne ne change pas la réponse", async () => {
    const notes: UnparsedRow[] = [];
    const rec = { recordUnparsed: async (row: UnparsedRow) => { notes.push(row); } };
    const r = await importMail(m2('Votre commande', 'Bonjour', 'u9', '2026-11-17', { hint: 'shein' }), 'u1', { ...deps, ...rec });
    assert.equal(r.status, 'unparsed');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].user_id, 'u1');
    assert.equal(notes[0].mail_fingerprint, mailFingerprint(m2('Votre commande', 'Bonjour', 'u9', '2026-11-17', { hint: 'shein' })));
    const bad = await importMail(m2(SHEIN_SUBJECT, 'Merci pour votre commande', 'u10', '2026-11-17', { from: 'noreply@sheinnotice.com' }), 'u1', { ...deps, ...rec });
    assert.equal(bad.status, 'unparsed');
    assert.ok((notes[1].missing ?? []).length > 0);
    const panne = await importMail(m2('Votre commande', 'Bonjour', 'u11', '2026-11-17', { hint: 'shein' }), 'u1', { ...deps, recordUnparsed: async () => { throw new Error('table absente'); } });
    assert.equal(panne.status, 'unparsed');
  });

  // ══ T-034.2 : import Shein seul ══
  // Base espion : toute écriture ou tout appel Gemini est compté.
  const spy = { writes: 0, gemini: 0, unparsed: 0 };
  const spyDeps: ImportDeps = {
    insertPending: async () => { spy.writes++; return 'inserted'; },
    insertSoldNotice: async () => { spy.writes++; return { status: 'inserted', id: 'x' }; },
    setPendingDate: async () => { spy.writes++; return true; },
    markNoticeUsed: async () => { spy.writes++; },
    listSoldNotices: async () => [], listApproxPending: async () => [],
    recordUnparsed: async () => { spy.unparsed++; },
    aiFallback: async () => { spy.gemini++; return { article: 'Pull', size: 'L', color: '', price: 15, date: '2026-07-19', transactionNumber: '' }; },
  };
  await test('T-034.2 Vinted « transaction finalisée » → ignored, 0 écriture, 0 appel Gemini, rien à vérifier', async () => {
    for (const [body, id] of [[MAIL_INLINE, 'i1'], [MAIL_LINES, 'i2'], [REAL_FINALIZED, 'i3'], [MAIL_NO_AMOUNT, 'i4']] as const) {
      const r = await importMail(mail(body, id), 'u1', spyDeps);
      assert.ok(r.status === 'ignored' && r.reason === VINTED_IGNORED_REASON, JSON.stringify(r));
    }
    assert.deepEqual(spy, { writes: 0, gemini: 0, unparsed: 0 });
  });
  await test("T-034.2 Vinted « article vendu » → ignored, 0 écriture (ni avis ni vente en attente)", async () => {
    for (const [s, b, id] of [[SOLD_SUBJECT, SOLD_BODY, 'j1'], [SOLD_SUBJECT, soldReal('Robe Talya bleue', '| Robe Talya bleue 18,00 € |'), 'j2'], ["Ton article s'est vendu", MAIL_SOLD, 'j3']] as const) {
      const r = await importMail(m2(s, b, id, '2026-11-08'), 'u1', spyDeps);
      assert.ok(r.status === 'ignored' && r.reason === VINTED_IGNORED_REASON, JSON.stringify(r));
    }
    // Trouvé par une recherche Vinted mais illisible : ignoré aussi (pas dans « Mails à vérifier »).
    const h = await importMail(m2('Vinted', 'texte illisible', 'j4', '2026-11-08', { hint: 'vendu' }), 'u1', spyDeps);
    assert.equal(h.status, 'ignored');
    assert.deepEqual(spy, { writes: 0, gemini: 0, unparsed: 0 });
  });
  await test('T-034.2 chemin Shein inchangé (insertion, photo, anti-doublon)', async () => {
    const before = db.purchases.length;
    const r = await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 'k1', '2026-12-04', { html: SHEIN_HTML_TWO }), 'u2', deps);
    assert.ok(r.status === 'inserted' && 'kind' in r && r.kind === 'shein_order' && r.inserted === 3, JSON.stringify(r));
    assert.equal(db.purchases.length, before + 3);
    assert.equal(db.purchases[before].photo_url, 'https://img.ltwebstatic.com/v4/j/pi/robe.jpg');
    assert.equal((await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 'k2', '2026-12-04'), 'u2', deps)).status, 'duplicate');
  });
  await test('T-034.2 B1 : texte alternatif exact avant préfixe (« Robe longue noire » / « … fendue », deux ordres)', () => {
    const a = '<img alt="SHEIN Robe longue noire" src="//img.ltwebstatic.com/v4/j/pi/a.jpg">';
    const b = '<img alt="SHEIN Robe longue noire fendue" src="//img.ltwebstatic.com/v4/j/pi/b.jpg">';
    for (const html of [a + b, b + a]) {
      assert.equal(sheinPhotoByAlt(html, 'SHEIN Robe longue noire fendue'), 'https://img.ltwebstatic.com/v4/j/pi/b.jpg');
      assert.equal(sheinPhotoByAlt(html, 'SHEIN Robe longue noire'), 'https://img.ltwebstatic.com/v4/j/pi/a.jpg');
    }
    // Sans égalité exacte, le préfixe sert toujours de repli (alt tronqué par Shein).
    assert.equal(sheinPhotoByAlt(b, 'SHEIN Robe longue noire fendue dos nu'), 'https://img.ltwebstatic.com/v4/j/pi/b.jpg');
  });
  await test('T-034.2 B2 : URL http: enregistrée en https:', async () => {
    assert.deepEqual(sheinPhotos('<img src="http://img.ltwebstatic.com/v4/j/pi/a.jpg">'), ['https://img.ltwebstatic.com/v4/j/pi/a.jpg']);
    assert.equal(sheinPhotoByAlt('<img alt="SHEIN Robe longue noire" src="http://img.ltwebstatic.com/v4/j/pi/a.jpg">', 'SHEIN Robe longue noire'), 'https://img.ltwebstatic.com/v4/j/pi/a.jpg');
    const html = SHEIN_HTML_TWO.replace(/(?:https?:)?\/\/img\.ltwebstatic\.com/g, 'http://img.ltwebstatic.com');
    assert.ok(html.includes('http://img.ltwebstatic.com'), 'le HTML du test contient bien des URL http:');
    const before = db.purchases.length;
    await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 'k3', '2026-12-04', { html }), 'u3', deps);
    const rows = db.purchases.slice(before);
    assert.ok(rows.length === 3 && rows.every((x) => !!x.photo_url && x.photo_url.startsWith('https://')), JSON.stringify(rows.map((x) => x.photo_url)));
  });
  await test("T-034.2 B3 : échec du rattrapage photo journalisé, l'import continue (pas d'erreur)", async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a); };
    try {
      const r = await importMail(m2(SHEIN_SUBJECT, SHEIN_TWO, 'k4', '2026-12-06', { html: SHEIN_HTML_TWO }), 'u1', {
        ...deps, fillPurchasePhoto: async () => { calls++; throw new Error('colonne photo_url absente'); },
      });
      assert.ok(r.status === 'duplicate' && 'kind' in r && r.kind === 'shein_order' && r.duplicates === 3, JSON.stringify(r));
    } finally { console.error = orig; }
    assert.equal(calls, 3, 'chaque unité est tentée malgré l’échec de la première');
    assert.equal(errors.length, 3, 'chaque échec est journalisé');
  });
  await test('file de révision : stock de même taille seulement, tailles normalisées', () => {
    assert.equal(sizeKey('M / 38 / 10'), 'M');
    assert.equal(sizeKey('taille xl'), 'XL');
    const base = { date: '2026-11-17', model: '', color: '', purchasePrice: 10, sku: '', orderNumber: '', status: 'en_stock' as const };
    const stock: Purchase[] = [
      { ...base, id: 'a', article: 'Manteau', size: 'XL' },
      { ...base, id: 'b', article: 'Robe', size: 'M' },
      { ...base, id: 'c', article: 'Robe vendue', size: 'M', status: 'vendu' },
      { ...base, id: 'd', article: 'Jupe', size: 'm', date: '2026-11-18' },
    ];
    const sale: PendingSale = { id: 's', date: '2026-11-18', article: 'Robe', color: '', size: 'M / 38', salePrice: 29, transactionNumber: '', status: 'en_attente' };
    assert.deepEqual(sameSizeStock(sale, stock).map((p) => p.id), ['d', 'b']);
  });

  console.log(`\n${passed} tests OK`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
