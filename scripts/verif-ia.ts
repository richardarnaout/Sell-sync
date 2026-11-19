/**
 * Vérification de l'IA côté serveur (T-031.2) : calculs purs + routes /api/ai/* avec une base et une IA factices.
 * Aucun réseau, aucune clé. Lancer : npm run verif:ia
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import type { Sale } from '../app/lib/sales';
import type { Purchase } from '../app/lib/stock';
import { suggestPrice, dormantStock, monthReport, guessCategory } from '../app/lib/aiStats';
import { aiDeps, DAILY_LIMIT, MODEL } from '../app/lib/ai';
import { POST as price } from '../app/api/ai/price/route';
import { POST as listing } from '../app/api/ai/listing/route';
import { POST as analyst } from '../app/api/ai/analyst/route';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) { await fn(); passed++; console.log('ok -', name); }

const mk = (id: string, date: string, category: string, size: string, pp: number, sp: number, ship = 0, boost = 0, perso = false): Sale =>
  ({ id, date, article: 'x', category, size, purchasePrice: pp, salePrice: sp, shippingCost: ship, boosterCost: boost, isPersonal: perso || undefined });

const SALES: Sale[] = [
  mk('1', '2026-10-03', 'Bas', 'M', 5, 20, 2), mk('2', '2026-10-10', 'Bas', 'M', 5, 25, 2), mk('3', '2026-10-12', 'Bas', 'M', 6, 30, 2),
  mk('4', '2026-11-02', 'Robes', 'S', 10, 30), mk('5', '2026-11-07', 'Bas', 'L', 4, 12, 0, 1),
  mk('6', '2026-11-08', 'Hauts', 'M', 4, 12, 0, 1), mk('7', '2026-11-09', 'Bas', 'M', 0, 99, 0, 0, true), // perso : exclu
];

const P = (id: string, date: string, status: Purchase['status'], photoUrl = ''): Purchase => ({
  id, date, article: 'Jupe plissée', model: 'SHEIN', color: 'Noir', size: 'M', purchasePrice: 6, sku: '', orderNumber: '', status, photoUrl,
});

// ── Base factice : tables en mémoire, RLS simulée par utilisateur, compteur de quota ──
const DB = { sales: [] as any[], purchases: [] as any[], cache: new Map<string, string>(), used: 0, rows: [] as any[] };
const toRow = (s: Sale) => ({ id: s.id, date: s.date, article: s.article, category: s.category, size: s.size, purchase_price: s.purchasePrice,
  sale_price: s.salePrice, shipping_cost: s.shippingCost, booster_cost: s.boosterCost, is_personal: s.isPersonal === true });
const prow = (p: Purchase) => ({ id: p.id, date: p.date, article: p.article, model: p.model, color: p.color, size: p.size, purchase_price: p.purchasePrice,
  sku: '', order_number: '', status: p.status, photo_url: p.photoUrl });

function fakeClient(token: string): any {
  const user = token === 'good' ? { id: 'u1' } : null;
  const q = (table: 'sales' | 'purchases', rows: any[]) => {
    let r = rows;
    const b: any = {
      select: () => b, eq: (c: string, v: any) => { r = r.filter(x => x[c] === v); return b; },
      range: (f: number, t: number) => Promise.resolve({ data: r.slice(f, t + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: r[0] ?? null, error: null }),
    };
    return b;
  };
  return {
    auth: { getUser: async () => user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad' } } },
    from: (t: string) => {
      if (t === 'ai_cache') {
        return {
          select: () => ({ eq: (_: string, k: string) => ({ maybeSingle: async () => ({ data: DB.cache.has(k) ? { value: DB.cache.get(k) } : null, error: null }) }) }),
          upsert: async (row: any) => { DB.cache.set(row.key, row.value); return { error: null }; },
        };
      }
      return q(t as any, t === 'sales' ? DB.sales : DB.purchases);
    },
    rpc: async (fn: string, args: any) => {
      assert.equal(fn, 'ai_take');
      if (DB.used >= args.p_limit) return { data: -1, error: null };
      return { data: ++DB.used, error: null };
    },
  };
}

let aiCalls = 0, lastContent: any[] = [];
aiDeps.makeClient = fakeClient as any;
aiDeps.object = (async (_s: any, _sys: string, content: any[]) => {
  aiCalls++; lastContent = content;
  return { title: 'Jupe plissée noire SHEIN', description: 'Jolie jupe.', keywords: ['jupe', 'plissée'] };
}) as any;
aiDeps.text = async () => { aiCalls++; return 'Bilan : continue sur les bas M.'; };

const call = (h: (r: NextRequest) => Promise<Response>, body: unknown, token: string | null = 'good') =>
  h(new NextRequest('http://localhost/api/ai/x', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  }));
const reset = (purchases: Purchase[] = []) => {
  DB.sales = SALES.map(toRow); DB.purchases = purchases.map(prow); DB.cache.clear(); DB.used = 0; aiCalls = 0; lastContent = [];
};

(async () => {
  // ── calculs purs ──
  await test('prix : médiane catégorie+taille, fourchette, bénéfice', () => {
    const r = suggestPrice(SALES, 'Bas', 'M', 5); // comparables Bas M : 20, 25, 30 (perso exclu)
    assert.deepEqual(r, { median: 25, low: 22.5, high: 27.5, n: 3, profit: 18 }); // 25 - 5 - frais médians 2
  });
  await test('prix : moins de 3 comparables avec la taille -> catégorie seule', () => {
    const r = suggestPrice(SALES, 'Bas', 'L', 5); // 1 seul Bas L -> tous les Bas : 12, 20, 25, 30
    assert.equal(r.n, 4); assert.equal(r.median, 22.5);
  });
  await test('prix : aucun comparable -> n=0, profit null ; sans prix d\'achat -> profit null', () => {
    assert.deepEqual(suggestPrice(SALES, 'Chaussures', 'M', 5), { median: 0, low: 0, high: 0, n: 0, profit: null });
    assert.equal(suggestPrice(SALES, 'Bas', 'M').profit, null);
  });
  await test('stock dormant : > 45 jours, en_stock seulement, tri par ancienneté', () => {
    const ps = [P('a', '2026-10-05', 'en_stock'), P('b', '2026-10-06', 'en_stock'), P('c', '2026-08-01', 'vendu'), P('d', '2026-09-01', 'en_stock')];
    const d = dormantStock(ps, '2026-11-20'); // a: 46 j, b: 45 j (pas > 45), c vendu, d: 80 j
    assert.deepEqual(d.map(x => [x.id, x.days]), [['d', 80], ['a', 46]]);
    assert.ok(d[0].action.includes('10 %')); assert.ok(d[1].action.includes('Remonter'));
  });
  await test('bilan du mois : totaux, meilleurs/pires distincts', () => {
    const r = monthReport(SALES, '2026-11');
    assert.equal(r.totals.count, 4); assert.equal(r.totals.revenue, 30 + 12 + 12 + 99);
    assert.equal(r.totals.resale.profit, (30 - 10) + (12 - 4 - 1) + (12 - 4 - 1)); // perso : pas de bénéfice
    assert.equal(r.best[0].category, 'Robes');
    const keys = new Set(r.best.map(c => c.category + c.size));
    assert.ok(r.worst.every(c => !keys.has(c.category + c.size)));
    assert.equal(monthReport(SALES, '2025-01').totals.count, 0);
  });
  await test('catégorie devinée', () => {
    assert.equal(guessCategory('Jupe plissée taille haute'), 'Bas');
    assert.equal(guessCategory('SHEIN Robe fleurie'), 'Robes');
    assert.equal(guessCategory('Truc inconnu'), 'Autre');
  });

  // ── routes ──
  await test('401 sans jeton ou jeton invalide (aucun appel IA, aucune lecture)', async () => {
    reset([P('11111111-1111-1111-1111-111111111111', '2026-09-01', 'en_stock')]);
    for (const h of [price, listing, analyst]) {
      assert.equal((await call(h, {}, null)).status, 401);
      assert.equal((await call(h, {}, 'mauvais')).status, 401);
    }
    assert.equal(aiCalls, 0); assert.equal(DB.used, 0);
  });
  await test('POST /price : réponse chiffrée, sans IA ni quota ; 400 si entrée invalide', async () => {
    reset();
    const res = await call(price, { category: 'Bas', size: 'M', purchase_price: 5 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { median: 25, low: 22.5, high: 27.5, n: 3, profit: 18 });
    assert.equal(aiCalls, 0); assert.equal(DB.used, 0);
    assert.equal((await call(price, { size: 'M' })).status, 400);
    assert.equal((await call(price, { category: 'Bas', purchase_price: 'abc' })).status, 400);
    assert.equal((await call(price, 'pas du json')).status, 400);
  });
  const ID = '11111111-1111-1111-1111-111111111111';
  await test('POST /listing : annonce + prix, photo Shein transmise, photo hors CDN ignorée', async () => {
    reset([P(ID, '2026-09-01', 'en_stock', 'https://img.ltwebstatic.com/images3_pi/x.jpg'), P('22222222-2222-2222-2222-222222222222', '2026-09-01', 'en_stock', 'http://169.254.169.254/x.jpg')]);
    const j: any = await (await call(listing, { purchase_id: ID })).json();
    assert.deepEqual(Object.keys(j).sort(), ['description', 'keywords', 'price', 'title']);
    assert.equal(j.price.n, 3); assert.equal(j.price.median, 25); assert.equal(j.price.profit, 25 - 6 - 2);
    assert.ok(lastContent.some(c => c.type === 'image'));
    assert.ok(!JSON.stringify(lastContent.filter(c => c.type === 'text')).match(/acheteur|buyer|@/));
    await call(listing, { purchase_id: '22222222-2222-2222-2222-222222222222' });
    assert.ok(!lastContent.some(c => c.type === 'image')); // URL non Shein : texte seul
    assert.equal((await call(listing, { purchase_id: '33333333-3333-3333-3333-333333333333' })).status, 404);
    assert.equal((await call(listing, { purchase_id: "1'; drop table" })).status, 400);
  });
  await test(`429 {error:"quota"} au plafond de ${DAILY_LIMIT}/jour, sans appel IA`, async () => {
    reset([P(ID, '2026-09-01', 'en_stock')]);
    for (let i = 0; i < DAILY_LIMIT; i++) assert.equal((await call(listing, { purchase_id: ID })).status, 200);
    assert.equal(aiCalls, DAILY_LIMIT);
    const res = await call(listing, { purchase_id: ID });
    assert.equal(res.status, 429); assert.deepEqual(await res.json(), { error: 'quota' });
    assert.equal(aiCalls, DAILY_LIMIT);
    assert.equal((await call(analyst, { month: '2026-11' })).status, 429);
    assert.equal((await call(price, { category: 'Bas' })).status, 200); // le prix reste illimité
  });
  await test('POST /analyst : chiffres par code, commentaire IA mémorisé (2e appel = 0 IA, 0 quota)', async () => {
    reset([P('a', '2026-09-01', 'en_stock')]);
    const r1: any = await (await call(analyst, { month: '2026-11' })).json();
    assert.deepEqual(Object.keys(r1).sort(), ['best', 'comment', 'dormant', 'totals', 'worst']);
    assert.equal(r1.totals.count, 4); assert.equal(r1.dormant.length, 1); assert.equal(r1.comment, 'Bilan : continue sur les bas M.');
    const r2: any = await (await call(analyst, { month: '2026-11' })).json();
    assert.deepEqual(r2, r1); assert.equal(aiCalls, 1); assert.equal(DB.used, 1);
    assert.equal((await call(analyst, { month: '2026-13' })).status, 400);
    assert.equal((await call(analyst, { month: '2024-01' })).status, 400); // aucune vente
  });
  await test('erreur IA : message générique, aucun détail interne', async () => {
    reset([P(ID, '2026-09-01', 'en_stock')]);
    const old = aiDeps.object;
    aiDeps.object = (async () => { throw new Error('SECRET api key AIza123 invalid'); }) as any;
    const origErr = console.error; console.error = () => {};
    const res = await call(listing, { purchase_id: ID });
    console.error = origErr; aiDeps.object = old;
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(await res.json()).includes('AIza'));
  });
  await test(`un seul modèle ${MODEL}, plus aucun gemini-2.5-flash`, () => {
    assert.equal(MODEL, 'gemini-2.5-flash-lite');
    const bad: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (/\.(ts|tsx)$/.test(e.name) && /gemini-2\.5-flash(?!-lite)/.test(fs.readFileSync(p, 'utf8'))) bad.push(p);
    });
    walk(path.join(__dirname, '../../app')); // .verif/scripts -> racine du projet
    assert.deepEqual(bad, []);
  });
  console.log(`\n${passed} vérifications OK`);
})().catch(e => { console.error('ÉCHEC :', e); process.exit(1); });
