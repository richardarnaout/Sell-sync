// Types, constantes, formats et conversions base <-> app des ventes et modèles (T-022.8 : sortis de page.tsx).

export interface Sale {
  id: string;
  date: string;
  article: string;
  category: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  shippingCost: number;
  boosterCost: number;
  productUrl?: string;
  isPersonal?: boolean; // article perso (seconde main, pas d'achat Shein) : T-028
}

export interface FormState {
  article: string; category: string; size: string; date: string;
  purchasePrice: string; salePrice: string; shippingCost: string; boosterCost: string;
  productUrl: string;
  isPersonal: boolean;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  size: string;
  purchasePrice: string;
  shippingCost: string;
  boosterCost: string;
  image?: string;
  productUrl?: string;
}

export const CATEGORIES = ['Hauts','Bas','Robes','Manteaux','Chaussures','Accessoires','Sport','Autre'];
export const SIZES      = ['XS','S','M','L','XL','XXL','34','36','38','40','42','44','46','Unique'];

export const CAT_COLORS: Record<string,string> = {
  Hauts:'#6366f1', Bas:'#8b5cf6', Robes:'#a78bfa', Manteaux:'#7c3aed',
  Chaussures:'#06b6d4', Accessoires:'#0ea5e9', Sport:'#10b981', Autre:'#64748b',
};
export const MONTH_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#a78bfa','#ec4899','#14b8a6'];

// Article perso : pas de bénéfice calculé (CA seul), la marge de revente n'est pas faussée par un coût 0.
export function calcProfit(s: Sale) { if (s.isPersonal) return 0; return s.salePrice - s.purchasePrice - s.shippingCost - s.boosterCost; }

export function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}
export function fmt(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + ' €'; }
export function fmtPlain(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }
export function today() { return new Date().toISOString().slice(0, 10); }
export function parseDate(str: string) { const [y,m,d] = str.split('-').map(Number); return new Date(y, m-1, d); }

export const emptyForm = (): FormState => ({
  article:'', category:'Autre', size:'', date: today(),
  purchasePrice:'', salePrice:'', shippingCost:'', boosterCost:'',
  productUrl:'', isPersonal:false,
});

// ── DB mapping ────────────────────────────────────────────────────────────

export function saleToDb(s: Sale, userId: string) {
  return {
    id: s.id, user_id: userId, date: s.date, article: s.article,
    category: s.category, size: s.size,
    purchase_price: s.purchasePrice, sale_price: s.salePrice,
    shipping_cost: s.shippingCost, booster_cost: s.boosterCost,
    product_url: s.productUrl || null,
    // Colonne is_personal (supabase/articles-perso.sql) : n'est envoyée que si elle sert, pour ne rien casser avant le SQL.
    ...(s.isPersonal !== undefined ? { is_personal: s.isPersonal } : {}),
  };
}
export function dbToSale(row: any): Sale {
  return {
    id: row.id, date: row.date, article: row.article,
    category: row.category, size: row.size || '',
    purchasePrice: Number(row.purchase_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    shippingCost: Number(row.shipping_cost) || 0,
    boosterCost: Number(row.booster_cost) || 0,
    productUrl: row.product_url || undefined,
    isPersonal: row.is_personal === true ? true : undefined,
  };
}
export function templateToDb(t: Template, userId: string) {
  return {
    id: t.id, user_id: userId, name: t.name, category: t.category,
    size: t.size, purchase_price: t.purchasePrice,
    shipping_cost: t.shippingCost, booster_cost: t.boosterCost,
    image: t.image || null,
    product_url: t.productUrl || null,
  };
}
export function dbToTemplate(row: any): Template {
  return {
    id: row.id, name: row.name, category: row.category,
    size: row.size || '', purchasePrice: row.purchase_price || '',
    shippingCost: row.shipping_cost || '', boosterCost: row.booster_cost || '',
    image: row.image || undefined,
    productUrl: row.product_url || undefined,
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────

/** Lignes CSV (en-tête ignorée) → ventes (ids `imp_<Date.now()>_<ligne>`). */
export function parseSalesCSV(text: string): Sale[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const imported: Sale[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVRow(lines[i]);
    if (cols.length < 8) continue;
    const [date, article, category, size, pp, sp, ship, boost] = cols;
    const salePrice = parseFloat(sp);
    if (!article || isNaN(salePrice)) continue;
    imported.push({
      id: `imp_${Date.now()}_${i}`,
      date: date || today(),
      article: article.trim(),
      category: category || 'Autre',
      size: size || '',
      purchasePrice: parseFloat(pp) || 0,
      salePrice,
      shippingCost: parseFloat(ship) || 0,
      boosterCost:  parseFloat(boost) || 0,
    });
  }
  return imported;
}

export function salesToCSV(sales: Sale[]): string {
  const header = 'Date,Article,Catégorie,Taille,Prix achat,Prix vente,Frais port,Booster,Bénéfice\n';
  const rows = sales.map(s =>
    [s.date, `"${s.article}"`, s.category, s.size || '',
     s.purchasePrice, s.salePrice, s.shippingCost, s.boosterCost, calcProfit(s).toFixed(2)].join(',')
  ).join('\n');
  return header + rows;
}
