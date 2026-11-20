/**
 * T-034.1 — Vérification du mode démo : règle d'activation, garde-fous dans le code,
 * contenu du jeu fictif, comportement du faux client (en mémoire, sans réseau).
 * Lancer : npm run verif:demo   (le build de production, lui, est vérifié par npm run verif:demo-build)
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { demoAllowed } from '../app/lib/demo/flag';
import { DEMO_PURCHASES, DEMO_SALES, DEMO_MAIL_REJECTS, DEMO_USER } from '../app/lib/demo/data';

const ROOT = join(__dirname, '..', '..');
let passed = 0;
const queue: [string, () => unknown][] = [];
const test = (name: string, fn: () => unknown) => queue.push([name, fn]);

// Aucune requête réseau ne doit partir du mode démo : tout appel à fetch fait échouer la vérification.
let fetchCalls = 0;
(globalThis as any).fetch = async () => { fetchCalls++; throw new Error('fetch interdit en mode démo'); };

test('activation : seulement NEXT_PUBLIC_DEMO=1 hors production', () => {
  assert.equal(demoAllowed('development', '1'), true);
  assert.equal(demoAllowed('production', '1'), false);   // la variable traîne en prod : refusé
  assert.equal(demoAllowed('production', undefined), false);
  assert.equal(demoAllowed('development', undefined), false);
  assert.equal(demoAllowed('development', 'true'), false); // valeur exacte « 1 » exigée
  assert.equal(demoAllowed(undefined, '1'), true);         // scripts locaux (pas de NODE_ENV)
});

test('garde-fous écrits en toutes lettres là où le code démo est chargé', () => {
  const guard = "process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO === '1'";
  for (const f of ['app/lib/supabaseClient.ts', 'app/components/AiTools.tsx', 'app/lib/demo/flag.ts']) {
    assert.ok(readFileSync(join(ROOT, f), 'utf8').includes(guard), `${f} : condition démo absente ou modifiée`);
  }
  for (const f of ['app/lib/demo/client.ts', 'app/lib/demo/ai.ts']) {
    assert.ok(/if \(process\.env\.NODE_ENV === 'production'\)[^\n]*throw|if \(process\.env\.NODE_ENV === 'production'\) \{\s*\/\/[^\n]*\n\s*throw/.test(readFileSync(join(ROOT, f), 'utf8')), `${f} : pas de refus en production`);
  }
});

test('jeu fictif : achats, photos, cas limites', () => {
  const withPhoto = DEMO_PURCHASES.filter((p) => p.photo_url && existsSync(join(ROOT, 'public', p.photo_url)));
  assert.ok(withPhoto.length >= 12, `${withPhoto.length} achats avec photo locale (≥ 12 attendus)`);
  assert.equal(DEMO_PURCHASES.filter((p) => !p.photo_url).length, 1, '1 achat sans photo');
  const broken = DEMO_PURCHASES.filter((p) => p.photo_url && !existsSync(join(ROOT, 'public', p.photo_url)));
  assert.equal(broken.length, 1, '1 lien de photo cassé');
  for (const p of DEMO_PURCHASES) if (p.photo_url) assert.ok(p.photo_url.startsWith('/demo/'), 'photo locale uniquement');
  const sold = DEMO_PURCHASES.filter((p) => p.status === 'vendu');
  assert.equal(sold.length, 4, '4 articles vendus');
  for (const p of sold) {
    const s = DEMO_SALES.find((x) => x.article.endsWith(p.article));
    assert.ok(s && s.sale_price > 0 && s.purchase_price === p.purchase_price, `vente de « ${p.article} »`);
  }
  assert.ok(DEMO_PURCHASES.some((p) => p.article.length > 50), 'nom long');
  assert.ok(new Set(DEMO_PURCHASES.map((p) => p.size)).size >= 8, 'tailles variées');
  assert.ok(DEMO_PURCHASES.every((p) => p.user_id === DEMO_USER.id));
});

test('jeu fictif : ventes sur 3 mois, perso, mail à vérifier', () => {
  assert.equal(DEMO_SALES.filter((s) => s.is_personal).length, 2, '2 ventes perso');
  const months = new Set(DEMO_SALES.map((s) => s.date.slice(0, 7)));
  assert.ok(months.size >= 3, `${months.size} mois de ventes`);
  assert.equal(new Set(DEMO_SALES.map((s) => s.id)).size, DEMO_SALES.length, 'ids de vente uniques');
  assert.equal(DEMO_MAIL_REJECTS.filter((m) => m.status === 'a_verifier').length, 1, '1 mail à vérifier');
});

test('faux client : lecture filtrée et triée', async () => {
  const { createDemoClient } = await import('../app/lib/demo/client');
  const sb = createDemoClient();
  const { data, error } = await sb.from('purchases').select('*').eq('user_id', DEMO_USER.id).order('date', { ascending: false });
  assert.equal(error, null);
  assert.equal(data.length, DEMO_PURCHASES.length);
  for (let i = 1; i < data.length; i++) assert.ok(data[i - 1].date >= data[i].date, 'tri décroissant');
  const m = await sb.from('mail_rejects').select('id, subject').eq('user_id', DEMO_USER.id).eq('status', 'a_verifier').order('last_seen_at', { ascending: false }).limit(50);
  assert.equal(m.data.length, 1);
});

test('faux client : ajout, clé en double refusée, modification, suppression', async () => {
  const { createDemoClient, demoSnapshot } = await import('../app/lib/demo/client');
  const sb = createDemoClient();
  const before = demoSnapshot('sales').length;
  const row = { id: 'verif-1', user_id: DEMO_USER.id, date: '2026-11-20', article: 'Test', sale_price: 10, purchase_price: 4 };
  assert.equal((await sb.from('sales').insert(row)).error, null);
  const dup = await sb.from('sales').insert(row);
  assert.equal(dup.error?.code, '23505', 'double clic = même id refusé');
  assert.equal(demoSnapshot('sales').length, before + 1, 'aucun doublon écrit');
  const up = await sb.from('sales').update({ sale_price: 12 }).eq('id', 'verif-1').select();
  assert.equal(up.data[0].sale_price, 12);
  const del = await sb.from('sales').delete().eq('id', 'verif-1').select();
  assert.equal(del.data.length, 1);
  assert.equal(demoSnapshot('sales').length, before);
});

test('faux client : RPC valider_vente (mêmes règles que le SQL) et panne simulée', async () => {
  const { createDemoClient, demoSnapshot } = await import('../app/lib/demo/client');
  const sb = createDemoClient();
  const pend = demoSnapshot('pending_sales')[0];
  const pur = demoSnapshot('purchases').find((p) => p.status === 'en_stock')!;
  (globalThis as any).__SELLSYNC_DEMO_FAIL__ = 'rpc:valider_vente';
  const ko = await sb.rpc('valider_vente', { p_pending_id: pend.id, p_purchase_id: pur.id, p_sale_id: 'verif-rpc', p_article: 'x' });
  assert.equal(ko.error?.code, 'DEMO_NETWORK');
  assert.ok(!demoSnapshot('sales').some((s) => s.id === 'verif-rpc'), 'panne : rien d’écrit');
  const ok = await sb.rpc('valider_vente', { p_pending_id: pend.id, p_purchase_id: pur.id, p_sale_id: 'verif-rpc', p_article: 'x' });
  assert.equal(ok.error, null);
  assert.equal(ok.data.deja_traite, false);
  const again = await sb.rpc('valider_vente', { p_pending_id: pend.id, p_purchase_id: pur.id, p_sale_id: 'verif-rpc', p_article: 'x' });
  assert.equal(again.data.deja_traite, true, 'idempotent');
  assert.equal(demoSnapshot('sales').filter((s) => s.id === 'verif-rpc').length, 1);
  assert.equal(demoSnapshot('purchases').find((p) => p.id === pur.id)!.status, 'vendu');
});

test('faux client : session démo, déconnexion', async () => {
  const { createDemoClient } = await import('../app/lib/demo/client');
  const sb = createDemoClient();
  const s = await sb.auth.getSession();
  assert.equal(s.data.session.user.id, DEMO_USER.id);
  let ev = '';
  const { data } = sb.auth.onAuthStateChange((e: string) => { ev = e; });
  await sb.auth.signOut();
  assert.equal(ev, 'SIGNED_OUT');
  assert.equal((await sb.auth.getSession()).data.session, null);
  await sb.auth.signInWithPassword({ email: 'x', password: 'y' });
  assert.equal(ev, 'SIGNED_IN');
  data.subscription.unsubscribe();
});

test('outils IA démo : réponse fictive sans appel réseau', async () => {
  const { demoAi } = await import('../app/lib/demo/ai');
  const l: any = await demoAi('/api/ai/listing', { purchase_id: DEMO_PURCHASES[0].id });
  assert.ok(l.title && l.price.n > 0);
  const p: any = await demoAi('/api/ai/price', { category: 'Robes', purchase_price: 10 });
  assert.equal(p.profit, 8);
  const a: any = await demoAi('/api/ai/analyst', { month: DEMO_SALES[0].date.slice(0, 7) });
  assert.ok(a.totals.count >= 1);
});

test('aucune requête réseau pendant toutes ces opérations', () => {
  assert.equal(fetchCalls, 0);
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log('ok -', name); }
    catch (e) { console.error('ÉCHEC -', name, '\n ', e instanceof Error ? e.message : e); process.exit(1); }
  }
  console.log(`\nverif:demo — ${passed}/${queue.length} OK`);
})();
