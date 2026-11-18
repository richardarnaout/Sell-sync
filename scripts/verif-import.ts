/**
 * Vérification du parseur Vinted et du webhook (sans base, sans réseau).
 * Lancer : npm run verif:import
 * Mails reconstitués + exemples RÉELS anonymisés (T-021 : Vinted finalisé du 11/11/2026, Shein confirmation du 17/11/2026).
 * Le mail « Ton article s'est vendu » reste reconstitué (aucun exemple réel pour l'instant).
 */
import assert from 'node:assert/strict';
import { parseVintedFinalized, parseAmount, findDate } from '../app/lib/parseVinted';
import { importMail, mailFingerprint, resolveUserId, secretMatches, type PendingRow, type MailInput, type ImportDeps, type SoldNoticeRow, type PurchaseRow, type UnparsedRow } from '../app/lib/importMail';
import { parseSheinOrder } from '../app/lib/parseShein';
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

  await test('insertion puis doublons (même mail renvoyé, même transaction via un autre mail)', async () => {
    const a = await importMail(mail(MAIL_INLINE, 'm1'), 'u1', { insertPending: fakeInsert });
    assert.equal(a.status, 'inserted');
    assert.equal(rows[0].sale_price, 29);
    assert.equal(rows[0].source_account, 'vendeur@gmail.com');
    assert.equal((await importMail(mail(MAIL_INLINE, 'm1'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal((await importMail(mail(MAIL_INLINE, 'm2'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal((await importMail(mail(MAIL_LINES, 'm3'), 'u1', { insertPending: fakeInsert })).status, 'inserted');
    assert.equal((await importMail(mail(MAIL_LINES, 'm3'), 'u1', { insertPending: fakeInsert })).status, 'duplicate');
    assert.equal(rows.length, 2);
  });
  await test('mail non finalisé → ignored, rien écrit', async () => {
    const r = await importMail(mail(MAIL_SOLD, 'm4', "Ton article s'est vendu"), 'u1', { insertPending: fakeInsert });
    assert.equal(r.status, 'ignored');
    assert.equal(rows.length, 2);
  });
  await test("parseur en échec : Gemini seulement s'il est configuré", async () => {
    const sans = await importMail(mail(MAIL_NO_AMOUNT, 'm5'), 'u1', { insertPending: fakeInsert });
    assert.equal(sans.status, 'unparsed');
    let appels = 0;
    const avec = await importMail(mail(MAIL_NO_AMOUNT, 'm5'), 'u1', {
      insertPending: fakeInsert,
      aiFallback: async () => {
        appels++;
        return { article: 'Pull marin', size: 'L', color: '', price: 15, date: '2026-07-19', transactionNumber: '' };
      },
    });
    assert.equal(appels, 1);
    assert.ok(avec.status === 'inserted' && 'via' in avec && avec.via === 'gemini');
    let appelsInutiles = 0;
    await importMail(mail(MAIL_INLINE, 'm6'), 'u1', {
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

  // ── Fausse base complète (mêmes règles d'unicité que les fichiers SQL) ──
  const db = { pending: [] as PendingRow[], notices: [] as (SoldNoticeRow & { id: string; used: boolean })[], purchases: [] as PurchaseRow[] };
  const deps: ImportDeps = {
    insertPending: async (row) => {
      if (db.pending.some((r) => r.user_id === row.user_id && ((row.transaction_number && r.transaction_number === row.transaction_number) || r.mail_fingerprint === row.mail_fingerprint))) return 'duplicate';
      db.pending.push(row);
      return 'inserted';
    },
    findSoldNotice: async (u, key, before) => {
      const n = db.notices.filter((x) => x.user_id === u && x.article_key === key && !x.used && x.date <= before)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      return n ? { id: n.id, date: n.date } : null;
    },
    markNoticeUsed: async (id) => { const n = db.notices.find((x) => x.id === id); if (n) n.used = true; },
    insertSoldNotice: async (row) => {
      if (db.notices.some((x) => x.user_id === row.user_id && x.mail_fingerprint === row.mail_fingerprint)) return { status: 'duplicate' };
      const id = `n${db.notices.length + 1}`;
      db.notices.push({ ...row, id, used: false });
      return { status: 'inserted', id };
    },
    fixPendingDate: async (u, key, date) => {
      const p = db.pending.filter((x) => x.user_id === u && x.article_key === key && x.date_approx && x.status === 'en_attente' && x.date >= date)
        .sort((x, y) => x.date.localeCompare(y.date))[0];
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
  await test("date de vente = date du mail « s'est vendu » (avant le « finalisée »)", async () => {
    const s = await importMail(m2(SOLD_SUBJECT, SOLD_BODY, 'v1', '2026-11-08'), 'u1', deps);
    assert.ok(s.status === 'inserted' && 'kind' in s && s.kind === 'vinted_sold' && s.date === '2026-11-08');
    const f = await importMail(m2(SUBJECT, REAL_FINALIZED, 'f1', '2026-11-12'), 'u1', deps);
    assert.ok(f.status === 'inserted' && 'dateApprox' in f && !f.dateApprox);
    const row = db.pending.find((p) => p.transaction_number === '23324499342')!;
    assert.equal(row.date, '2026-11-08');
    assert.equal(row.date_approx, false);
    assert.equal(db.notices[0].used, true);
  });
  await test("sans « s'est vendu » : date du finalisé + date_approx, corrigée si l'avis arrive après", async () => {
    await importMail(m2(SUBJECT, MAIL_INLINE, 'f2', '2026-07-19'), 'u1', deps);
    const row = db.pending.find((p) => p.transaction_number === '20886805143')!;
    assert.equal(row.date, '2026-07-19');
    assert.equal(row.date_approx, true);
    const late = await importMail(m2(SOLD_SUBJECT, "Ton article « Robe Violetta Tifany » s'est vendu.", 'v2', '2026-07-16'), 'u1', deps);
    assert.ok('kind' in late && late.kind === 'vinted_sold' && late.fixedPending);
    assert.equal(row.date, '2026-07-16');
    assert.equal(row.date_approx, false);
    assert.equal((await importMail(m2(SOLD_SUBJECT, SOLD_BODY, 'v1', '2026-11-08'), 'u1', deps)).status, 'duplicate');
  });
  await test("mail non reconnu (422) noté pour l'app ; une base en panne ne change pas la réponse", async () => {
    const notes: UnparsedRow[] = [];
    const r = await importMail(mail(MAIL_NO_AMOUNT, 'm9'), 'u1', { insertPending: fakeInsert, recordUnparsed: async (row) => { notes.push(row); } });
    assert.equal(r.status, 'unparsed');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].user_id, 'u1');
    assert.equal(notes[0].mail_fingerprint, mailFingerprint(mail(MAIL_NO_AMOUNT, 'm9')));
    assert.ok((notes[0].missing ?? []).length > 0);
    const ok = await importMail(mail(MAIL_INLINE, 'm10'), 'u1', { insertPending: fakeInsert, recordUnparsed: async (row) => { notes.push(row); } });
    assert.notEqual(ok.status, 'unparsed');
    assert.equal(notes.length, 1);
    const panne = await importMail(mail(MAIL_NO_AMOUNT, 'm11'), 'u1', { insertPending: fakeInsert, recordUnparsed: async () => { throw new Error('table absente'); } });
    assert.equal(panne.status, 'unparsed');
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
