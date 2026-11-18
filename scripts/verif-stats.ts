/**
 * Vérification des calculs purs de l'onglet Analyse (app/lib/stats.ts, T-022.8).
 * Lancer : npm run verif:stats
 */
import assert from 'node:assert/strict';
import type { Sale } from '../app/lib/sales';
import { parseSalesCSV, salesToCSV } from '../app/lib/sales';
import {
  headlineStats, groupByMonth, byCategory, compareMonths, topArticles, topSizes,
  bestPerMonth, byDayOfWeek, buildSuggestions, chartMonthly, bestMonth, computeGoal,
} from '../app/lib/stats';
import { prevMonthKey, evolutionPct, dailyProfit } from '../app/lib/dashboard';
import { sheinLink, SHEIN_ORDER_BASE, ageDays, isStale } from '../app/lib/stock';

let passed = 0;
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

console.log(`\n${passed}/${passed} vérifications OK`);
