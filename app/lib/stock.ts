// ── Auto-import : stock (achats Shein) + ventes détectées (Vinted finalisées) ──
// Types, mapping DB et logique d'appariement.

export interface Purchase {
  id: string;
  date: string; // YYYY-MM-DD (date d'achat)
  article: string;
  model: string; // marque/série Shein (Rafferiza, SHEIN Petite, Unadoll...) — utile pour le titre Vinted
  color: string;
  size: string;
  purchasePrice: number;
  sku: string;
  orderNumber: string;
  status: 'en_stock' | 'vendu' | 'ignore';
  photoUrl?: string; // photo du mail Shein (T-021)
  sheinUrl?: string; // lien Shein, saisi à la main (facultatif)
}

export interface PendingSale {
  id: string;
  date: string; // YYYY-MM-DD (date du mail « s'est vendu », sinon du « finalisée »)
  article: string;
  color: string;
  size: string;
  salePrice: number;
  transactionNumber: string;
  status: 'en_attente' | 'traite' | 'ignore';
  rejectedPurchaseIds?: string[]; // achats écartés par la croix ✕ (T-027)
  dateApprox?: boolean; // true = pas de mail « s'est vendu » rapproché : date du « finalisée »
}

// ── Mapping DB (snake_case) ──
export function purchaseToDb(p: Purchase, userId: string) {
  return {
    id: p.id, user_id: userId, date: p.date, article: p.article, model: p.model,
    color: p.color, size: p.size, purchase_price: p.purchasePrice, sku: p.sku,
    order_number: p.orderNumber, status: p.status,
    // Colonnes T-021 envoyées seulement si remplies : l'app marche encore avant la migration SQL.
    ...(p.photoUrl ? { photo_url: p.photoUrl } : {}),
    ...(p.sheinUrl ? { shein_url: p.sheinUrl } : {}),
  };
}
export function dbToPurchase(r: any): Purchase {
  return {
    id: r.id, date: r.date, article: r.article, model: r.model || '',
    color: r.color || '', size: r.size || '',
    purchasePrice: Number(r.purchase_price) || 0, sku: r.sku || '',
    orderNumber: r.order_number || '', status: r.status || 'en_stock',
    photoUrl: r.photo_url || '', sheinUrl: r.shein_url || '',
  };
}
export function pendingToDb(s: PendingSale, userId: string) {
  return {
    id: s.id, user_id: userId, date: s.date, article: s.article, color: s.color,
    size: s.size, sale_price: s.salePrice, transaction_number: s.transactionNumber,
    status: s.status,
  };
}
export function dbToPending(r: any): PendingSale {
  return {
    id: r.id, date: r.date, article: r.article, color: r.color || '', size: r.size || '',
    salePrice: Number(r.sale_price) || 0, transactionNumber: r.transaction_number || '',
    status: r.status || 'en_attente', dateApprox: !!r.date_approx,
    rejectedPurchaseIds: Array.isArray(r.rejected_purchase_ids) ? r.rejected_purchase_ids : [],
  };
}

// ── Validation atomique (T-022.7) : 1 seul appel RPC, 3 écritures en une transaction SQL ──
// Prérequis : supabase/valider-vente.sql exécuté. saleId = clé d'idempotence (un clic = un id).
export async function validerVente(
  pendingId: string, purchaseId: string, article: string, productUrl?: string,
  saleId: string = crypto.randomUUID(),
): Promise<{ ok: boolean; deja_traite: boolean; sale_id: string }> {
  // Import dynamique : le client exige des variables d'env., que les scripts de test n'ont pas.
  const { supabase } = await import('./supabaseClient');
  const { data, error } = await supabase.rpc('valider_vente', {
    p_pending_id: pendingId, p_purchase_id: purchaseId, p_sale_id: saleId,
    p_article: article, p_product_url: productUrl || null,
  });
  if (error) throw error;
  return data as { ok: boolean; deja_traite: boolean; sale_id: string };
}

// ── Appariement vente → achat ──
/** « M / 38 / 10 », « taille M », « m » → « M » : on compare la première taille écrite. */
export function sizeKey(s: string): string {
  return s.replace(/^\s*taille\s+/i, '').split(/[\/(]/)[0].trim().toUpperCase();
}
const sizeEq = (a: string, b: string) =>
  !!a && !!b && sizeKey(a) === sizeKey(b);

/** Articles en stock de la même taille que la vente (plus récents d'abord). */
export function sameSizeStock(sale: PendingSale, stock: Purchase[]): Purchase[] {
  return stock
    .filter((p) => p.status === 'en_stock' && sizeEq(p.size, sale.size))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Candidats d'achat pour une vente : uniquement le stock en cours, même taille d'abord, plus récent ensuite. */
export function rankCandidates(sale: PendingSale, stock: Purchase[]): Purchase[] {
  return stock
    .filter((p) => p.status === 'en_stock')
    .sort((a, b) => {
      const sa = sizeEq(a.size, sale.size) ? 0 : 1;
      const sb = sizeEq(b.size, sale.size) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return b.date.localeCompare(a.date);
    });
}

/** Achat pré-sélectionné : seulement s'il y a UN seul article en stock de la bonne taille (sinon on ne devine pas). */
export function bestGuessId(sale: PendingSale, stock: Purchase[]): string {
  const sameSize = stock.filter((p) => p.status === 'en_stock' && sizeEq(p.size, sale.size));
  return sameSize.length === 1 ? sameSize[0].id : '';
}

// ── Lien Shein d'un article (T-024) ──
// Le mail Shein ne contient pas de lien produit, seulement un lien vers la commande (paramètre billno).
export const SHEIN_ORDER_BASE = 'https://shein.com/onelink/0/order-detail-fr?billno=';

/** Lien à ouvrir pour reconnaître l'article : 1) lien produit saisi à la main, 2) page de la commande, sinon null. */
export function sheinLink(p: Pick<Purchase, 'sheinUrl' | 'orderNumber'>): { url: string; kind: 'product' | 'order' } | null {
  const manual = (p.sheinUrl || '').trim();
  if (/^https?:\/\//i.test(manual)) return { url: manual, kind: 'product' };
  const order = (p.orderNumber || '').trim();
  if (order) return { url: SHEIN_ORDER_BASE + encodeURIComponent(order), kind: 'order' };
  return null;
}

// ── Ancienneté du stock ──
export const STALE_DAYS = 60;
/** Nombre de jours entiers depuis `date` (YYYY-MM-DD) jusqu'à `now` (YYYY-MM-DD). */
export function ageDays(date: string, now: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(0, Math.round((d(now) - d(date)) / 86400000));
}
export const isStale = (p: Pick<Purchase, 'status' | 'date'>, now: string) =>
  p.status === 'en_stock' && ageDays(p.date, now) > STALE_DAYS;
