// Calculs de l'IA « sans IA » (T-031.2) : prix conseillé, stock dormant, bilan du mois.
// Fonctions pures, vérifiées par `npm run verif:ia`. L'IA ne fait JAMAIS de calcul.
import type { Sale } from './sales';
import { totals, missingPurchase, type Totals } from './dashboard';
import { ageDays, type Purchase } from './stock';

export const DORMANT_DAYS = 45;
export const MIN_SIZE_COMPARABLES = 3; // en dessous, on élargit à la catégorie seule

export interface PriceAdvice { median: number; low: number; high: number; n: number; profit: number | null }

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Quantile par interpolation linéaire (q entre 0 et 1) sur un tableau trié. */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Prix conseillé = médiane des ventes comparables (catégorie + taille ; sinon catégorie seule
 * quand il y a moins de 3 comparables avec la taille). Fourchette = 25e et 75e percentile.
 * Bénéfice attendu = médiane − prix d'achat − frais médians des comparables (null sans prix d'achat).
 * Articles perso et ventes à 0 € exclus.
 */
export function suggestPrice(sales: Sale[], category: string, size: string, purchasePrice?: number | null): PriceAdvice {
  const pool = sales.filter(s => !s.isPersonal && s.salePrice > 0 && norm(s.category) === norm(category));
  const sameSize = size ? pool.filter(s => norm(s.size) === norm(size)) : [];
  const comps = sameSize.length >= MIN_SIZE_COMPARABLES ? sameSize : pool;
  if (!comps.length) return { median: 0, low: 0, high: 0, n: 0, profit: null };
  const prices = comps.map(s => s.salePrice).sort((a, b) => a - b);
  const fees = comps.map(s => s.shippingCost + s.boosterCost).sort((a, b) => a - b);
  const median = quantile(prices, 0.5);
  const profit = purchasePrice != null && purchasePrice > 0 ? r2(median - purchasePrice - quantile(fees, 0.5)) : null;
  return { median: r2(median), low: r2(quantile(prices, 0.25)), high: r2(quantile(prices, 0.75)), n: comps.length, profit };
}

export interface DormantItem {
  id: string; article: string; color: string; size: string;
  days: number; purchasePrice: number; action: string;
}

/** Stock en_stock acheté il y a plus de `minDays` jours, du plus ancien au plus récent. */
export function dormantStock(purchases: Purchase[], now: string, minDays = DORMANT_DAYS): DormantItem[] {
  return purchases
    .filter(p => p.status === 'en_stock')
    .map(p => ({ p, days: ageDays(p.date, now) }))
    .filter(x => x.days > minDays)
    .sort((a, b) => b.days - a.days)
    .map(({ p, days }) => ({
      id: p.id, article: p.article, color: p.color, size: p.size, days, purchasePrice: p.purchasePrice,
      action: days > 90 ? 'Baisser le prix de 20 % ou le mettre dans un lot'
        : days > 60 ? 'Baisser le prix de 10 % et remonter l\'annonce'
        : 'Remonter l\'annonce (renouveler photos et titre)',
    }));
}

export interface Couple { category: string; size: string; count: number; profit: number; margin: number }

/** Couples catégorie+taille (ventes de revente avec prix d'achat connu), regroupés. */
function couples(sales: Sale[]): Couple[] {
  const map = new Map<string, { category: string; size: string; count: number; profit: number; revenue: number }>();
  for (const s of sales) {
    if (s.isPersonal || missingPurchase(s)) continue;
    const k = norm(s.category) + '|' + norm(s.size);
    const g = map.get(k) ?? { category: s.category, size: s.size || '—', count: 0, profit: 0, revenue: 0 };
    g.count++; g.profit += s.salePrice - s.purchasePrice - s.shippingCost - s.boosterCost; g.revenue += s.salePrice;
    map.set(k, g);
  }
  return [...map.values()].map(g => ({
    category: g.category, size: g.size, count: g.count, profit: r2(g.profit),
    margin: g.revenue ? Math.round((g.profit / g.revenue) * 100) : 0,
  }));
}

export interface MonthReport { totals: Totals; best: Couple[]; worst: Couple[] }

/** Bilan d'un mois AAAA-MM : totaux (mêmes formules que le tableau de bord) + 3 meilleurs / 3 pires couples. */
export function monthReport(sales: Sale[], month: string): MonthReport {
  const ms = sales.filter(s => s.date.slice(0, 7) === month);
  const c = couples(ms).sort((a, b) => b.profit - a.profit || a.category.localeCompare(b.category));
  const best = c.slice(0, 3);
  const worst = c.slice(best.length).reverse().slice(0, 3); // jamais le même couple des deux côtés
  return { totals: totals(ms), best, worst };
}

/** Catégorie probable d'un achat Shein (les achats n'ont pas de catégorie), par mots-clés ; 'Autre' sinon. */
export function guessCategory(article: string): string {
  const a = article.toLowerCase();
  const rules: [string, RegExp][] = [
    ['Chaussures', /chaussure|basket|botte|sandale|sneaker|escarpin|shoe|boot/],
    ['Robes', /robe|dress|combinaison|jumpsuit/],
    ['Manteaux', /manteau|veste|blouson|doudoune|trench|parka|coat|jacket|blazer/],
    ['Sport', /sport|yoga|running|fitness|training/],
    ['Bas', /pantalon|jean|short|jupe|legging|skirt|pants|trouser|cargo/],
    ['Accessoires', /sac |sac$|ceinture|écharpe|echarpe|bonnet|bijou|lunette|chapeau|casquette|bag|scarf|belt/],
    ['Hauts', /haut|top|t-shirt|tee|pull|chemise|blouse|sweat|gilet|débardeur|debardeur|crop|hoodie|shirt|cardigan|body/],
  ];
  return rules.find(([, re]) => re.test(a))?.[0] ?? 'Autre';
}

/** Date du jour AAAA-MM-JJ (UTC) ; injectable pour les tests. */
export const today = () => new Date().toISOString().slice(0, 10);
