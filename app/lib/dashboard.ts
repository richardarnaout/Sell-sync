// Calculs du tableau de bord (T-022.4) — fonctions pures, vérifiables par script.
// Bénéfice = prix de vente − prix d'achat − frais (port, booster).
// Vente sans prix d'achat (0 ou vide) = « prix d'achat manquant » : exclue du bénéfice et de la marge.

export interface SaleLite {
  date: string; // YYYY-MM-DD
  salePrice: number; purchasePrice: number; shippingCost: number; boosterCost: number;
}

export const THRESHOLD_SALES = 30;      // seuil de déclaration plateformes (nb de ventes / année civile)
export const THRESHOLD_REVENUE = 2000;  // seuil de déclaration plateformes (CA € / année civile)

export const missingPurchase = (s: SaleLite) => !(s.purchasePrice > 0);
export const saleProfit = (s: SaleLite) => s.salePrice - s.purchasePrice - s.shippingCost - s.boosterCost;

export interface Totals { count: number; revenue: number; profit: number; margin: number; missing: number; }

// Marge = bénéfice total ÷ CA total (sur les ventes dont le prix d'achat est connu), jamais une moyenne de marges.
export function totals(sales: SaleLite[]): Totals {
  let revenue = 0, profit = 0, knownRevenue = 0, missing = 0;
  for (const s of sales) {
    revenue += s.salePrice;
    if (missingPurchase(s)) { missing++; continue; }
    profit += saleProfit(s); knownRevenue += s.salePrice;
  }
  return { count: sales.length, revenue, profit, margin: knownRevenue > 0 ? (profit / knownRevenue) * 100 : 0, missing };
}

export function monthTable(sales: SaleLite[]): (Totals & { key: string })[] {
  const groups: Record<string, SaleLite[]> = {};
  for (const s of sales) (groups[s.date.slice(0, 7)] ||= []).push(s);
  return Object.keys(groups).sort().reverse().map((key) => ({ key, ...totals(groups[key]) }));
}

// Stock immobilisé = somme des prix d'achat des articles encore en stock (non vendus).
export function immobilised(purchases: { status: string; purchasePrice: number }[]) {
  const stock = purchases.filter((p) => p.status === 'en_stock');
  return { count: stock.length, total: stock.reduce((a, p) => a + p.purchasePrice, 0) };
}

// Indicateur par année civile : ventes et CA face aux seuils (information, pas un conseil fiscal).
export function yearCounter(sales: SaleLite[], year: number) {
  const ys = sales.filter((s) => s.date.slice(0, 4) === String(year));
  const revenue = ys.reduce((a, s) => a + s.salePrice, 0);
  return { year, count: ys.length, revenue,
    salesPct: Math.min(100, (ys.length / THRESHOLD_SALES) * 100),
    revenuePct: Math.min(100, (revenue / THRESHOLD_REVENUE) * 100) };
}

// ── Accueil « Aujourd'hui » (T-024) ──
/** Mois précédent d'une clé AAAA-MM. */
export function prevMonthKey(key: string): string {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
export const salesOfMonth = <T extends SaleLite>(sales: T[], key: string) => sales.filter((s) => s.date.slice(0, 7) === key);
/** Évolution en % du CA vs mois précédent ; null si le mois précédent est vide. */
export function evolutionPct(cur: number, prev: number): number | null {
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}
/** Bénéfice par jour (1..jusqu'à `lastDay`) d'un mois ; ventes sans prix d'achat comptées 0. */
export function dailyProfit(sales: SaleLite[], key: string, lastDay: number): { day: number; profit: number }[] {
  const out = Array.from({ length: lastDay }, (_, i) => ({ day: i + 1, profit: 0 }));
  for (const s of salesOfMonth(sales, key)) {
    const d = +s.date.slice(8, 10);
    if (d >= 1 && d <= lastDay && !missingPurchase(s)) out[d - 1].profit += saleProfit(s);
  }
  return out;
}
