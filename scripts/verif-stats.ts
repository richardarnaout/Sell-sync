/**
 * Vérification des calculs purs de l'onglet Analyse (app/lib/stats.ts, T-022.8).
 * Lancer : npm run verif:stats
 */
import assert from 'node:assert/strict';
import type { Sale } from '../app/lib/sales';
import { parseSalesCSV, salesToCSV, calcProfit } from '../app/lib/sales';
import {
  headlineStats, groupByMonth, byCategory, compareMonths, topArticles, topSizes,
  bestPerMonth, byDayOfWeek, buildSuggestions, chartMonthly, bestMonth, computeGoal,
} from '../app/lib/stats';
import { prevMonthKey, evolutionPct, dailyProfit, totals, missingPurchase, yearCounter } from '../app/lib/dashboard';
import { sheinLink, SHEIN_ORDER_BASE, ageDays, isStale, dbToPurchase, type Purchase } from '../app/lib/stock';
import { saleToDb, dbToSale, today as todaySales } from '../app/lib/sales';
import {
  parsePrice, validDate, guessCategory, saleForArticle, articleMargin, splitStock, immobilized, articleSaleId,
  purchaseIdOfSale, checkPhotoUrl, localToday, sellArticle, updateArticleSale, cancelArticleSale,
} from '../app/lib/sellArticle';
import { fitWithin, dataUrlBytes } from '../app/lib/imageResize';
import { createDemoClient, demoSnapshot } from '../app/lib/demo/client';
import { DEMO_USER } from '../app/lib/demo/data';

let passed = 0;
test('today() : date locale à 00:30 (pas la veille UTC)', () => {
  const d = new Date(2026, 10, 20, 0, 30); // 00:30 heure locale (Paris en prod : TZ=Europe/Paris pour le prouver)
  assert.equal(todaySales(d), '2026-11-20');
  assert.equal(localToday(d), '2026-11-20');
});
function test(name: string, fn: () => void) { fn(); passed++; console.log('ok -', name); }

const mk = (id: string, date: string, article: string, category: string, size: string, pp: number, sp: number, ship = 0, boost = 0): Sale =>
  ({ id, date, article, category, size, purchasePrice: pp, salePrice: sp, shippingCost: ship, boosterCost: boost });

// 2026-11-02 = lundi, 2026-11-07 = samedi
const SALES: Sale[] = [
  mk('1', '2026-10-03', 'Jean', 'Bas', 'M', 5, 20),
  mk('2', '2026-10-10', 'Jean', 'Bas', 'M', 5, 25, 2),
  mk('3', '2026-11-02', 'Robe', 'Robes', 'S', 10, 30),
  mk('4', '2026-11-07', 'Jean', 'Bas', '', 0, 15),
  mk('5', '2026-11-07', 'Pull', 'Hauts', 'M', 4, 12, 0, 1),
];

test('cartes du haut (tout / mois filtré)', () => {
  const all = headlineStats(SALES, null);
  assert.equal(all.count, 5);
  assert.equal(all.totalRevenue, 102);
  assert.equal(all.missing, 1);                 // vente 4 sans prix d'achat
  assert.equal(all.totalCost, 5 + 5 + 2 + 10 + 4 + 1);
  assert.equal(all.avgSalePrice, 102 / 5);
  assert.equal(headlineStats(SALES, '2026-10').count, 2);
});

test('regroupement par mois + graphiques', () => {
  const bm = groupByMonth(SALES);
  assert.deepEqual(bm.map(([k]) => k), ['2026-10', '2026-11']);
  assert.equal(bm[0][1].profit, 15 + 18);
  assert.equal(bm[1][1].revenue, 57);
  assert.equal(chartMonthly(bm)[1]['Coûts'], 15);
  assert.equal(bestMonth(bm)![0], '2026-11');  // 42 € contre 33 €
  assert.equal(bestMonth([]), null);
  const cmp = compareMonths(bm);
  assert.equal(cmp.data.length, 31);
  assert.equal(cmp.data[2][cmp.months[0]], 15); // J3 d'octobre : vente du 3
  assert.deepEqual(compareMonths(bm.slice(0, 1)), { data: [], months: [] });
});

test('catégories, articles, tailles, jours', () => {
  assert.equal(byCategory(SALES)[0].name, 'Bas');
  assert.deepEqual(topArticles(SALES)[0], { name: 'Jean', count: 3, profit: 15 + 18 + 15 });
  assert.deepEqual(topSizes(SALES)[0], { size: 'M', count: 3 });
  assert.ok(topSizes(SALES).some(s => s.size === 'N/A'));
  const dw = byDayOfWeek(SALES);
  assert.equal(dw[0].ventes, 1);               // lundi
  assert.equal(dw[5].ventes, 4);               // samedi (03/10, 10/10, 07/11 ×2)
  assert.equal(bestPerMonth(groupByMonth(SALES))[0].month, groupByMonth(SALES)[1][1].labelShort);
});

test('suggestions', () => {
  assert.deepEqual(buildSuggestions(SALES.slice(0, 2), [], byDayOfWeek([]), [], [], []), []);
  const bm = groupByMonth(SALES);
  const sug = buildSuggestions(SALES, topArticles(SALES), byDayOfWeek(SALES), byCategory(SALES), bm, topSizes(SALES));
  const titles = sug.map(s => s.title);
  assert.ok(titles.includes('Article phare à relancer'));
  assert.ok(titles.includes('Timing idéal pour publier'));
  assert.ok(sug.find(s => s.title === 'Timing idéal pour publier')!.body.includes('samedi'));
});

test('objectif de vente (date fixée)', () => {
  const g = computeGoal(groupByMonth(SALES), SALES, new Date(2026, 10, 7))!;
  assert.equal(g.targetCount, 3);               // moyenne 2,5 → 3
  assert.equal(g.targetRev, 50);                // moyenne 51 → arrondi à 5
  assert.equal(g.curKey, '2026-11');
  assert.equal(g.months[0].isCurrent, true);
  assert.equal(g.weekCount, 3);                 // lundi 02 → dimanche 08
  assert.equal(g.weekRev, 57);
  assert.equal(computeGoal([], [], new Date()), null);
});

test('CSV aller-retour', () => {
  const back = parseSalesCSV(salesToCSV(SALES));
  assert.equal(back.length, 5);
  assert.deepEqual(back.map(s => [s.date, s.article, s.salePrice, s.purchasePrice]), SALES.map(s => [s.date, s.article, s.salePrice, s.purchasePrice]));
});

test('articles perso (T-028)', () => {
  const perso: Sale = { ...mk('p1', '2026-11-07', 'Veste perso', 'Manteaux', 'M', 0, 40), isPersonal: true };
  const all = [...SALES, perso];
  assert.equal(missingPurchase(perso), false);          // plus « prix d'achat manquant »
  const t = totals(all);
  assert.equal(t.missing, 1);                           // seule la vente 4 reste manquante
  assert.equal(t.count, 6);
  assert.equal(t.revenue, 142);                         // CA global inclut le perso
  assert.deepEqual(t.perso, { count: 1, revenue: 40 });
  assert.equal(t.resale.revenue, 102);
  assert.equal(t.profit, totals(SALES).profit);         // bénéfice inchangé
  assert.equal(t.margin, totals(SALES).margin);         // marge de revente non faussée
  assert.equal(calcProfit(perso), 0);
  assert.equal(headlineStats(all, null).perso.revenue, 40);
  assert.equal(groupByMonth(all)[1][1].profit, groupByMonth(SALES)[1][1].profit);
  assert.equal(dailyProfit(all, '2026-11', 30)[6].profit, dailyProfit(SALES, '2026-11', 30)[6].profit);
  assert.equal(yearCounter(all, 2026).count, 6);        // seuils annuels : toutes les ventes
  assert.equal(yearCounter(all, 2026).revenue, 142);
});

// ══ T-034.3 : saisie du prix de vente sur un article (plus de liaison) ══
const P = (id: string, over: Partial<Purchase> = {}): Purchase => ({
  id, date: '2026-11-01', article: 'Robe midi rouge', model: 'Rafferiza', color: 'Rouge', size: 'S',
  purchasePrice: 12.5, sku: 'sz1', orderNumber: 'GS1', status: 'en_stock', ...over,
});

test('T-034.3 prix saisi : virgule ou point, > 0, sinon refus', () => {
  assert.equal(parsePrice('24,90'), 24.9);
  assert.equal(parsePrice('24.9'), 24.9);
  assert.equal(parsePrice(' 18 € '), 18);
  for (const bad of ['', '0', '0,00', '-5', 'abc', '12,345', '1e3', '12,5,0']) assert.equal(parsePrice(bad), null, bad);
  assert.ok(validDate('2026-11-20'));
  assert.ok(!validDate('2026-02-30') && !validDate('20/11/2026'));
  assert.equal(localToday(new Date(2026, 10, 20, 0, 30)), '2026-11-20'); // date par défaut : jour local, pas UTC
});

test('T-034.3 vente créée depuis l’article : id lié, titre, catégorie, marge = vente − achat', () => {
  const s = saleForArticle(P('a1', { sheinUrl: 'https://fr.shein.com/x.html' }), 24.9, '2026-11-20');
  assert.equal(s.id, articleSaleId('a1'));
  assert.equal(purchaseIdOfSale(s.id), 'a1');
  assert.equal(purchaseIdOfSale('vente-0001'), null);
  assert.equal(s.article, 'Rafferiza — Robe midi rouge');
  assert.equal(s.category, 'Robes');
  assert.equal(s.purchasePrice, 12.5);
  assert.equal(calcProfit(s).toFixed(2), '12.40');          // bénéfice de l'onglet Ventes = marge (ni port ni boost)
  assert.equal(articleMargin(24.9, 12.5), 12.4);
  assert.equal(articleMargin(10, 12.5), -2.5);
  assert.equal(guessCategory('Jupe trapèze camel'), 'Bas');
  assert.equal(guessCategory('Truc inconnu'), 'Autre');
});

test('T-034.3 stock / vendus / stock immobilisé (la vente « achat-<id> » fait foi)', () => {
  const ps = [P('a'), P('b', { purchasePrice: 7.3 }), P('c', { status: 'vendu' }), P('d', { status: 'ignore' }), P('e', { purchasePrice: 4 })];
  const sales = [{ id: articleSaleId('b') }, { id: 'vente-x' }];
  const { inStock, sold } = splitStock(ps, sales);
  assert.deepEqual(inStock.map((p) => p.id), ['a', 'e']);   // b a sa vente même si son statut n'a pas suivi
  assert.deepEqual(sold.map((p) => p.id), ['b', 'c']);      // c : ancienne liaison
  assert.equal(immobilized(inStock), 16.5);
});

test('T-034.3 lien de photo (A1) : https du CDN Shein seulement, http normalisé, le reste refusé', () => {
  assert.deepEqual(checkPhotoUrl(''), { ok: true, url: '' });
  assert.deepEqual(checkPhotoUrl('https://img.ltwebstatic.com/v4/j/pi/a.jpg'), { ok: true, url: 'https://img.ltwebstatic.com/v4/j/pi/a.jpg' });
  assert.deepEqual(checkPhotoUrl('http://img.ltwebstatic.com/v4/j/pi/a.jpg'), { ok: true, url: 'https://img.ltwebstatic.com/v4/j/pi/a.jpg' });
  assert.deepEqual(checkPhotoUrl('//img.ltwebstatic.com/images3_pi/b.jpg'), { ok: true, url: 'https://img.ltwebstatic.com/images3_pi/b.jpg' });
  for (const bad of ['https://evil.com/a.jpg', 'https://img.ltwebstatic.com.evil.com/a.jpg', 'https://img.ltwebstatic.com@evil.com/a.jpg',
    'https://user:pw@img.ltwebstatic.com/a.jpg', 'https://img.ltwebstatic.com:8443/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAA', 'pas un lien']) {
    const r = checkPhotoUrl(bad);
    assert.ok(!r.ok && r.error.length > 10, bad);
  }
});

test('T-034.3 photo de modèle (A5) : ≤ 1280 px sans agrandir, taille d’une data URL', () => {
  assert.deepEqual(fitWithin(4032, 3024), { w: 1280, h: 960 });
  assert.deepEqual(fitWithin(3024, 4032), { w: 960, h: 1280 });
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 });
  assert.deepEqual(fitWithin(0, 600), { w: 0, h: 0 });
  assert.equal(dataUrlBytes('data:image/jpeg;base64,' + Buffer.alloc(300_000).toString('base64')), 300_000);
  assert.equal(dataUrlBytes('data:image/jpeg;base64,' + Buffer.alloc(301).toString('base64')), 301);
});

const asyncTests: [string, () => Promise<void>][] = [];
const testAsync = (name: string, fn: () => Promise<void>) => asyncTests.push([name, fn]);

// Parcours complet sur le client démo (mêmes règles d'unicité que Postgres, panne réseau simulable).
testAsync('T-034.3 vente puis modification puis annulation (client démo)', async () => {
  const db = createDemoClient();
  const p = dbToPurchase(demoSnapshot('purchases').find((x) => x.status === 'en_stock' && x.photo_url)!);
  const before = demoSnapshot('sales').length;
  const r = await sellArticle(db, DEMO_USER.id, p, 24.9, '2026-11-20', saleToDb);
  assert.deepEqual(r, { ok: true, already: false });
  const sale = demoSnapshot('sales').find((s) => s.id === articleSaleId(p.id))!;
  assert.equal(dbToSale(sale).salePrice, 24.9);
  assert.equal(dbToSale(sale).purchasePrice, p.purchasePrice);
  assert.equal(demoSnapshot('purchases').find((x) => x.id === p.id)!.status, 'vendu');
  const all = () => demoSnapshot('purchases').map(dbToPurchase);
  assert.ok(splitStock(all(), demoSnapshot('sales').map(dbToSale)).sold.some((x) => x.id === p.id));
  // double clic : aucune vente en double
  const again = await sellArticle(db, DEMO_USER.id, p, 24.9, '2026-11-20', saleToDb);
  assert.ok(again.ok && again.already);
  assert.equal(demoSnapshot('sales').length, before + 1);
  // modification du prix
  assert.ok((await updateArticleSale(db, p.id, 30, '2026-11-19')).ok);
  const edited = demoSnapshot('sales').find((s) => s.id === articleSaleId(p.id))!;
  assert.deepEqual([edited.sale_price, edited.date], [30, '2026-11-19']);
  // annulation : l'article revient en stock, la vente disparaît
  assert.ok((await cancelArticleSale(db, p.id)).ok);
  assert.equal(demoSnapshot('sales').length, before);
  assert.equal(demoSnapshot('purchases').find((x) => x.id === p.id)!.status, 'en_stock');
  assert.ok(splitStock(all(), demoSnapshot('sales').map(dbToSale)).inStock.some((x) => x.id === p.id));
});

testAsync('T-034.3 erreur réseau : rien d’écrit à moitié, message clair', async () => {
  const db = createDemoClient();
  const p = dbToPurchase(demoSnapshot('purchases').find((x) => x.status === 'en_stock')!);
  const g = globalThis as any;
  const salesBefore = demoSnapshot('sales').length;
  g.__SELLSYNC_DEMO_FAIL__ = 'sales';                       // la vente ne passe pas
  const r = await sellArticle(db, DEMO_USER.id, p, 20, '2026-11-20', saleToDb);
  assert.ok(!r.ok && /Rien n'a été enregistré/.test(r.error), JSON.stringify(r));
  assert.equal(demoSnapshot('sales').length, salesBefore);
  assert.equal(demoSnapshot('purchases').find((x) => x.id === p.id)!.status, 'en_stock');
  g.__SELLSYNC_DEMO_FAIL__ = 'purchases';                   // la vente passe, le statut non : l'article est quand même vendu
  const r2 = await sellArticle(db, DEMO_USER.id, p, 20, '2026-11-20', saleToDb);
  assert.ok(r2.ok && !!r2.warning);
  assert.ok(splitStock(demoSnapshot('purchases').map(dbToPurchase), demoSnapshot('sales').map(dbToSale)).sold.some((x) => x.id === p.id));
  g.__SELLSYNC_DEMO_FAIL__ = 'sales';                       // annulation : suppression en échec → l'article reste vendu
  const c = await cancelArticleSale(db, p.id);
  assert.ok(!c.ok && /reste vendu/.test(c.error));
  assert.ok(splitStock(demoSnapshot('purchases').map(dbToPurchase), demoSnapshot('sales').map(dbToSale)).sold.some((x) => x.id === p.id));
  assert.ok((await cancelArticleSale(db, p.id)).ok);         // nouvel essai : annulée
  assert.equal(demoSnapshot('sales').length, salesBefore);
});

(async () => {
  for (const [name, fn] of asyncTests) { await fn(); passed++; console.log('ok -', name); }
  console.log(`\n${passed}/${passed} vérifications OK`);
})().catch((e) => { console.error(e); process.exit(1); });
