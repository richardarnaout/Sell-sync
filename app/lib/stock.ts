// ── Auto-import : stock (achats Shein) + ventes détectées (Vinted finalisées) ──
// Types, mapping DB, logique d'appariement et données d'exemple pour le test.

export interface Purchase {
  id: string;
  date: string; // YYYY-MM-DD (date d'achat)
  article: string;
  color: string;
  size: string;
  purchasePrice: number;
  sku: string;
  orderNumber: string;
  status: 'en_stock' | 'vendu' | 'ignore';
}

export interface PendingSale {
  id: string;
  date: string; // YYYY-MM-DD (date de vente finalisée)
  article: string;
  color: string;
  size: string;
  salePrice: number;
  transactionNumber: string;
  status: 'en_attente' | 'traite' | 'ignore';
}

// ── Mapping DB (snake_case) ──
export function purchaseToDb(p: Purchase, userId: string) {
  return {
    id: p.id, user_id: userId, date: p.date, article: p.article, color: p.color,
    size: p.size, purchase_price: p.purchasePrice, sku: p.sku,
    order_number: p.orderNumber, status: p.status,
  };
}
export function dbToPurchase(r: any): Purchase {
  return {
    id: r.id, date: r.date, article: r.article, color: r.color || '', size: r.size || '',
    purchasePrice: Number(r.purchase_price) || 0, sku: r.sku || '',
    orderNumber: r.order_number || '', status: r.status || 'en_stock',
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
    status: r.status || 'en_attente',
  };
}

// ── Appariement vente → achat ──
const sizeEq = (a: string, b: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

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

// ── Données d'exemple = tes VRAIS mails déjà extraits (backtest 2026-07-23) ──
// Sert à tester le flux complet sur le preview, sans dépendre de l'ingestion Gmail.
export function sampleData(): { purchases: Omit<Purchase, 'id'>[]; pending: Omit<PendingSale, 'id'>[] } {
  return {
    purchases: [
      { date: '2026-07-15', article: 'Robe tube ajustée froncée de couleur unie', color: 'Jaune citron', size: 'S', purchasePrice: 22.76, sku: 'sz25061793992493144', orderNumber: 'USO18828W0000002CB6', status: 'en_stock' },
      { date: '2026-07-15', article: "Robe d'été élégante avec laçage dos nu (Unadoll)", color: 'Bleu marine', size: 'M', purchasePrice: 11.72, sku: 'sz251210180466917581137', orderNumber: 'USO18828W0000002CB6', status: 'en_stock' },
      { date: '2026-07-15', article: 'Ceinture en PU à boucle', color: 'Noir', size: '130', purchasePrice: 0, sku: 'sc2401218075474815', orderNumber: 'USO18828W0000002CB6', status: 'en_stock' },
      { date: '2026-07-15', article: 'Ventilateur de poche pliable', color: 'Blanc', size: '', purchasePrice: 6.87, sku: 'sh25012498813422316', orderNumber: 'USO18828W0000002CB6', status: 'en_stock' },
    ],
    pending: [
      { date: '2026-07-18', article: 'Robe Violetta Tifany', color: 'lila', size: 'M', salePrice: 29, transactionNumber: '20886805143', status: 'en_attente' },
    ],
  };
}
