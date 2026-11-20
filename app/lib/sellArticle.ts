// T-034.3 — Vente d'un article du stock par saisie du prix (plus de liaison avec les mails Vinted).
// Khaled tape le prix de vente Vinted sur l'article : la vente est rattachée à cet article par son geste.
//
// Sans changement de schéma : la vente d'un article porte l'id « achat-<id de l'achat> » dans `sales`.
//  - Double clic / réseau relancé : le 2e insert est refusé par la clé primaire (23505) → aucun doublon.
//  - La vente est la référence : un article est vendu si sa vente « achat-<id> » existe (ou s'il a été
//    vendu par l'ancienne liaison, statut « vendu »). Le statut de l'achat suit, mais un échec réseau
//    entre les deux écritures ne laisse jamais un état visible à moitié (voir sellArticle / cancelArticleSale).
import type { Purchase } from './stock';
import type { Sale } from './sales';

export const ARTICLE_SALE_PREFIX = 'achat-';
export const articleSaleId = (purchaseId: string) => ARTICLE_SALE_PREFIX + purchaseId;
export const purchaseIdOfSale = (saleId: string) =>
  saleId.startsWith(ARTICLE_SALE_PREFIX) ? saleId.slice(ARTICLE_SALE_PREFIX.length) : null;

/** « 12,50 », « 12.5 », « 12 € » → 12.5 ; vide, texte, 0 ou négatif → null. */
export function parsePrice(input: string): number | null {
  const s = input.replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 100000 ? n : null;
}

/** Date du jour en heure locale (today() de sales.ts est en UTC : la veille entre minuit et 1 h/2 h en France). */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date AAAA-MM-JJ valide (calendrier réel). */
export function validDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/** Catégorie devinée depuis le nom (pour l'onglet Analyse) ; « Autre » si rien de sûr. */
export function guessCategory(article: string): string {
  const a = article.toLowerCase();
  if (/\b(robe|ensemble|combinaison)\b/.test(a)) return 'Robes';
  if (/\b(jupe|jean|pantalon|short|legging)\b/.test(a)) return 'Bas';
  if (/\b(manteau|veste|blazer|doudoune|trench)\b/.test(a)) return 'Manteaux';
  if (/\b(top|chemise|pull|t-shirt|tee-shirt|blouse|gilet|cardigan|débardeur|body)\b/.test(a)) return 'Hauts';
  if (/\b(basket|bottine|botte|sandale|escarpin|chaussure)s?\b/.test(a)) return 'Chaussures';
  if (/\b(sac|ceinture|collier|bijou|bonnet|écharpe)\b/.test(a)) return 'Accessoires';
  return 'Autre';
}

export const articleTitle = (p: Pick<Purchase, 'model' | 'article'>) => (p.model ? `${p.model} — ${p.article}` : p.article);

/** Vente créée quand Khaled saisit le prix d'un article. */
export function saleForArticle(p: Purchase, salePrice: number, date: string): Sale {
  return {
    id: articleSaleId(p.id), date, article: articleTitle(p), category: guessCategory(p.article),
    size: p.size, purchasePrice: p.purchasePrice, salePrice, shippingCost: 0, boosterCost: 0,
    productUrl: p.sheinUrl || undefined,
  };
}

/** Marge affichée sur l'article = prix de vente − prix d'achat. */
export const articleMargin = (salePrice: number, purchasePrice: number) => Math.round((salePrice - purchasePrice) * 100) / 100;

/** Répartition du stock : en stock (prix à saisir) / vendus, d'après les ventes existantes. */
export function splitStock(purchases: Purchase[], sales: Pick<Sale, 'id'>[]) {
  const saleIds = new Set(sales.map((s) => s.id));
  const hasSale = (p: Purchase) => saleIds.has(articleSaleId(p.id));
  return {
    inStock: purchases.filter((p) => p.status === 'en_stock' && !hasSale(p)),
    sold: purchases.filter((p) => p.status === 'vendu' || (p.status !== 'ignore' && hasSale(p))),
  };
}

/** Stock immobilisé = somme des prix d'achat des articles en stock. */
export const immobilized = (inStock: Purchase[]) => Math.round(inStock.reduce((a, p) => a + p.purchasePrice, 0) * 100) / 100;

// ── Écritures (client Supabase injecté : vrai client, client démo ou faux client de test) ──
type Db = { from: (t: string) => any };
type Err = { message: string; code?: string } | null;
export type SellResult = { ok: true; already: boolean; warning?: string } | { ok: false; error: string };

const netMsg = (e: Err) => `Rien n'a été enregistré : ${e?.message || 'erreur inconnue'}. Vérifie ta connexion puis réessaie.`;

/**
 * Enregistre la vente d'un article. 1) insert de la vente « achat-<id> » (une seule écriture, atomique) ;
 * 2) l'achat passe « vendu ». Si 2) échoue, l'article apparaît quand même vendu (la vente fait foi).
 */
export async function sellArticle(db: Db, userId: string, p: Purchase, salePrice: number, date: string,
  toDb: (s: Sale, userId: string) => Record<string, unknown>): Promise<SellResult> {
  const sale = saleForArticle(p, salePrice, date);
  const ins: { error: Err } = await db.from('sales').insert(toDb(sale, userId));
  let already = false;
  if (ins.error) {
    if (ins.error.code !== '23505') return { ok: false, error: netMsg(ins.error) };
    already = true; // double clic : la vente existe déjà, rien n'est écrit en double
  }
  const up: { error: Err } = await db.from('purchases').update({ status: 'vendu' }).eq('id', p.id).eq('status', 'en_stock');
  return up.error
    ? { ok: true, already, warning: 'Vente enregistrée ; le statut de l’article sera corrigé au prochain enregistrement.' }
    : { ok: true, already };
}

/** Modifie le prix (et la date) de la vente d'un article. */
export async function updateArticleSale(db: Db, purchaseId: string, salePrice: number, date: string): Promise<SellResult> {
  const r: { data: unknown[] | null; error: Err } = await db.from('sales')
    .update({ sale_price: salePrice, date }).eq('id', articleSaleId(purchaseId)).select();
  if (r.error) return { ok: false, error: netMsg(r.error) };
  if (!r.data || r.data.length === 0) return { ok: false, error: 'Vente introuvable : recharge la page.' };
  return { ok: true, already: false };
}

/**
 * Annule la vente d'un article : l'article revient en stock.
 * 1) l'achat repasse « en_stock » (la vente existe encore : l'article reste affiché vendu) ;
 * 2) suppression de la vente. Si 2) échoue, rien ne change à l'écran : on peut réessayer.
 */
export async function cancelArticleSale(db: Db, purchaseId: string): Promise<SellResult> {
  const up: { error: Err } = await db.from('purchases').update({ status: 'en_stock' }).eq('id', purchaseId);
  if (up.error) return { ok: false, error: `Annulation non faite : ${up.error.message}. Réessaie.` };
  const del: { data: unknown[] | null; error: Err } = await db.from('sales').delete().eq('id', articleSaleId(purchaseId)).select();
  if (del.error) return { ok: false, error: `Annulation non faite : ${del.error.message}. L'article reste vendu, réessaie.` };
  return { ok: true, already: !del.data || del.data.length === 0 };
}

// ── Photo saisie à la main (réserve T-033.4 A1) ──
/** Hôtes d'images acceptés : le CDN des photos Shein (le même que l'import mail). */
export const PHOTO_HOSTS = ['img.ltwebstatic.com'];

/** Lien de photo collé par Khaled → URL https d'un hôte autorisé, ou message d'erreur clair. Vide = pas de photo. */
export function checkPhotoUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  let s = input.trim();
  if (!s) return { ok: true, url: '' };
  if (s.startsWith('//')) s = 'https:' + s;
  s = s.replace(/^http:\/\//i, 'https://');
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, error: 'Lien de photo invalide : colle l’adresse complète de l’image (https://img.ltwebstatic.com/…).' }; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) {
    return { ok: false, error: 'Lien de photo refusé : seule une adresse https simple est acceptée.' };
  }
  if (!PHOTO_HOSTS.includes(u.hostname.toLowerCase())) {
    return { ok: false, error: `Lien de photo refusé : seules les images Shein (${PHOTO_HOSTS.join(', ')}) sont acceptées.` };
  }
  return { ok: true, url: u.toString() };
}
