// Calculs purs de l'onglet Analyse et des cartes (T-022.8 : sortis de page.tsx, logique inchangée).
// Vérifiés par `npm run verif:stats`.
import { Sale, calcProfit, parseDate } from './sales';
import { totals } from './dashboard';

export interface MonthBucket { label: string; labelShort: string; sales: Sale[]; profit: number; revenue: number; cost: number }
export type MonthEntry = [string, MonthBucket];
export type SugType = 'success'|'info'|'tip'|'warning';
export interface Suggestion { type: SugType; title: string; body: string }

/** Cartes du haut, filtrées par mois sélectionné (null = tout). */
export function headlineStats(sales: Sale[], selectedMonth: string | null) {
  const filtered = selectedMonth ? sales.filter(x => x.date.slice(0,7) === selectedMonth) : sales;
  const t = totals(filtered);
  const totalCost    = filtered.reduce((s,x) => s + x.purchasePrice + x.shippingCost + x.boosterCost, 0);
  const avgSalePrice = filtered.length ? t.revenue / filtered.length : 0;
  // Marge = bénéfice total ÷ CA total (T-022.4) ; ventes sans prix d'achat exclues du bénéfice.
  return { totalProfit: t.profit, totalRevenue: t.revenue, count: t.count, avgMargin: t.margin, totalCost, avgSalePrice, missing: t.missing };
}
export type HeadlineStats = ReturnType<typeof headlineStats>;

/** Ventes regroupées par mois (clé AAAA-MM), ordre chronologique. */
export function groupByMonth(sales: Sale[]): MonthEntry[] {
  const map: Record<string, MonthBucket> = {};
  for (const s of sales) {
    const key = s.date.slice(0,7);
    if (!map[key]) {
      const d = parseDate(s.date + '-01');
      const label = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
      const labelShort = d.toLocaleDateString('fr-FR', { month:'short', year:'2-digit' });
      map[key] = { label: label.charAt(0).toUpperCase() + label.slice(1), labelShort, sales:[], profit:0, revenue:0, cost:0 };
    }
    map[key].sales.push(s);
    map[key].profit  += calcProfit(s);
    map[key].revenue += s.salePrice;
    map[key].cost    += s.purchasePrice + s.shippingCost + s.boosterCost;
  }
  return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
}

/** Par catégorie (camembert), CA décroissant. */
export function byCategory(sales: Sale[]) {
  const map: Record<string,{ count:number; profit:number; revenue:number }> = {};
  for (const s of sales) {
    if (!map[s.category]) map[s.category] = { count:0, profit:0, revenue:0 };
    map[s.category].count++;
    map[s.category].profit  += calcProfit(s);
    map[s.category].revenue += s.salePrice;
  }
  return Object.entries(map).map(([name,v]) => ({ name, ...v })).sort((a,b) => b.revenue - a.revenue);
}

/** Bénéfice cumulé jour par jour des 8 derniers mois. */
export function compareMonths(byMonth: MonthEntry[]) {
  if (byMonth.length < 2) return { data: [], months: [] as string[] };
  const recent = byMonth.slice(-8);
  const data = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    const row: Record<string, number | string> = { day };
    for (const [, m] of recent) {
      row[m.labelShort] = parseFloat(
        m.sales.filter(s => parseInt(s.date.slice(8, 10)) <= day)
          .reduce((sum, s) => sum + calcProfit(s), 0).toFixed(2)
      );
    }
    return row;
  });
  return { data, months: recent.map(([, m]) => m.labelShort) };
}

export function topArticles(sales: Sale[]) {
  const map: Record<string, { count: number; profit: number }> = {};
  for (const s of sales) {
    if (!map[s.article]) map[s.article] = { count: 0, profit: 0 };
    map[s.article].count++;
    map[s.article].profit += calcProfit(s);
  }
  return Object.entries(map)
    .map(([name, v]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, ...v }))
    .sort((a, b) => b.count - a.count).slice(0, 8);
}

export function topSizes(sales: Sale[]) {
  const map: Record<string, number> = {};
  for (const s of sales) { const sz = s.size || 'N/A'; map[sz] = (map[sz] || 0) + 1; }
  return Object.entries(map).map(([size, count]) => ({ size, count })).sort((a, b) => b.count - a.count);
}

/** Article le plus vendu de chaque mois, le plus récent en premier. */
export function bestPerMonth(byMonth: MonthEntry[]) {
  return [...byMonth].reverse().map(([, month]) => {
    const map: Record<string, { count: number; profit: number }> = {};
    for (const s of month.sales) {
      if (!map[s.article]) map[s.article] = { count: 0, profit: 0 };
      map[s.article].count++;
      map[s.article].profit += calcProfit(s);
    }
    const best = Object.entries(map).sort((a, b) => b[1].count - a[1].count)[0];
    return {
      month: month.labelShort,
      article: best ? (best[0].length > 18 ? best[0].slice(0, 16) + '…' : best[0]) : '—',
      count: best ? best[1].count : 0,
      profit: best ? best[1].profit : 0,
    };
  });
}

/** Ventes et bénéfice par jour de semaine (lundi en premier). */
export function byDayOfWeek(sales: Sale[]) {
  const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const map = DAYS.map(d => ({ day: d, ventes: 0, profit: 0 }));
  for (const s of sales) {
    const dow = (parseDate(s.date).getDay() + 6) % 7;
    map[dow].ventes++;
    map[dow].profit += calcProfit(s);
  }
  return map;
}

export function buildSuggestions(
  sales: Sale[],
  arts: ReturnType<typeof topArticles>,
  days: ReturnType<typeof byDayOfWeek>,
  cats: ReturnType<typeof byCategory>,
  byMonth: MonthEntry[],
  sizes: ReturnType<typeof topSizes>,
): Suggestion[] {
  if (sales.length < 3) return [];
  const items: Suggestion[] = [];
  const DAYS_FULL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

  if (arts.length > 0 && arts[0].count >= 2) {
    const a = arts[0];
    items.push({ type:'success', title:'Article phare à relancer',
      body:`"${a.name}" s'est vendu ${a.count} fois — c'est ton best-seller. Pense à en racheter pour continuer à le revendre.` });
  }

  const ratios = Object.entries(sales.reduce((m, s) => {
    if (!m[s.article]) m[s.article] = { p:0, r:0 };
    m[s.article].p += calcProfit(s); m[s.article].r += s.salePrice; return m;
  }, {} as Record<string,{p:number;r:number}>))
  .filter(([, v]) => v.r > 0 && v.p > 0)
  .map(([name, v]) => ({ name: name.length > 22 ? name.slice(0,20)+'…' : name, margin:(v.p/v.r)*100 }))
  .sort((a,b) => b.margin - a.margin);
  if (ratios.length > 0 && ratios[0].margin > 30) {
    items.push({ type:'success', title:'Meilleur ratio de revente',
      body:`"${ratios[0].name}" affiche une marge de ${ratios[0].margin.toFixed(0)}% — ton article le plus rentable au ratio.` });
  }

  const maxV = Math.max(...days.map(d => d.ventes));
  if (maxV > 0) {
    const bestIdx = days.findIndex(d => d.ventes === maxV);
    const prevIdx = (bestIdx - 1 + 7) % 7;
    items.push({ type:'tip', title:'Timing idéal pour publier',
      body:`Tu vends le plus le ${DAYS_FULL[bestIdx]}. Publie tes annonces le ${DAYS_FULL[prevIdx]} soir pour capter ce pic de trafic.` });
  }

  if (cats.length > 0) {
    const c = cats[0];
    items.push({ type:'info', title:'Catégorie à privilégier',
      body:`Les ${c.name} sont ta meilleure catégorie (${c.count} vente${c.count>1?'s':''}). Continue à sourcer dans cette catégorie en priorité.` });
  }

  if (byMonth.length >= 2) {
    const last = byMonth[byMonth.length-1][1];
    const prev = byMonth[byMonth.length-2][1];
    const diff = last.profit - prev.profit;
    if (diff > 2) items.push({ type:'success', title:'Mois en progression',
      body:`+${diff.toFixed(2).replace('.',',')} € vs ${prev.label}. Belle dynamique, continue sur cette lancée !` });
    else if (diff < -2 && last.sales.length > 0) items.push({ type:'warning', title:'Mois en ralentissement',
      body:`Ce mois-ci tu es en baisse de ${Math.abs(diff).toFixed(2).replace('.',',')} € vs ${prev.label}. Booste ou renouvelle tes annonces.` });
  }

  if (sizes.length > 0 && sizes[0].count >= 2) {
    const sz = sizes[0];
    items.push({ type:'tip', title:'Taille à cibler lors de tes achats',
      body:`La taille ${sz.size} est ta plus vendue (${sz.count} article${sz.count>1?'s':''}). Priorise cette taille quand tu sources.` });
  }

  const mg = totals(sales).margin;
  if (sales.length >= 5) {
    if (mg >= 40) items.push({ type:'success', title:'Excellente marge globale',
      body:`Ta marge moyenne de ${mg.toFixed(1)}% est très solide. Tu sais bien acheter et bien revendre.` });
    else if (mg > 0 && mg < 20) items.push({ type:'warning', title:'Marge à améliorer',
      body:`Ta marge moyenne est de ${mg.toFixed(1)}%. Vise des articles plus rares ou négocie mieux tes prix d'achat.` });
  }

  const best = [...sales].sort((a,b) => calcProfit(b)-calcProfit(a))[0];
  const bp = calcProfit(best);
  if (bp > 8) items.push({ type:'success', title:'Ta vente la plus rentable',
    body:`"${best.article.length>22?best.article.slice(0,20)+'…':best.article}" t'a rapporté +${bp.toFixed(2).replace('.',',')} € net — ton record à battre.` });

  return items;
}

export function chartMonthly(byMonth: MonthEntry[]) {
  return byMonth.map(([,m]) => ({
    name: m.labelShort,
    'CA': parseFloat(m.revenue.toFixed(2)),
    'Bénéfice': parseFloat(m.profit.toFixed(2)),
    'Coûts': parseFloat(m.cost.toFixed(2)),
  }));
}

export function bestMonth(byMonth: MonthEntry[]): MonthEntry | null {
  return byMonth.length ? byMonth.reduce((a,b) => b[1].profit > a[1].profit ? b : a) : null;
}

// ── Objectif de vente (coach) ──
// Quota = ta MOYENNE depuis le début (tous tes mois). C'est le minimum de
// régularité à tenir chaque mois. Aucune majoration : viser sa moyenne.
export function computeGoal(byMonth: MonthEntry[], sales: Sale[], now: Date = new Date()) {
  if (!byMonth.length) return null;
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const curKey = ymd(now).slice(0, 7);

  // Moyenne sur tout l'historique
  const avgCount = byMonth.reduce((s, [, m]) => s + m.sales.length, 0) / byMonth.length;
  const avgRev   = byMonth.reduce((s, [, m]) => s + m.revenue, 0) / byMonth.length;
  const targetCount = Math.max(1, Math.round(avgCount));
  const targetRev   = Math.max(5, Math.round(avgRev / 5) * 5);

  // Cible hebdo (le mois calendaire fait ~daysInMonth/7 semaines)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const weeksInMonth = daysInMonth / 7;
  const weekCountTarget = Math.max(1, Math.round(targetCount / weeksInMonth));
  const weekRevTarget   = Math.max(5, Math.round((targetRev / weeksInMonth) / 5) * 5);

  // Un objet par mois actif : résultat vs quota (le plus récent en premier)
  const months = [...byMonth].reverse().map(([key, m]) => ({
    key, label: m.label, labelShort: m.labelShort,
    count: m.sales.length, revenue: m.revenue,
    met: m.sales.length >= targetCount && m.revenue >= targetRev,
    isCurrent: key === curKey,
  }));

  // Rythme attendu sur le mois en cours = part du mois écoulée × quota
  const monthElapsed = now.getDate() / daysInMonth;

  // Réalisé sur la semaine en cours (lundi → dimanche, dates locales)
  const dow = (now.getDay() + 6) % 7; // 0 = lundi
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekStartStr = ymd(weekStart);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const weekEndStr = ymd(weekEnd);
  let weekCount = 0, weekRev = 0;
  for (const s of sales) {
    if (s.date >= weekStartStr && s.date < weekEndStr) { weekCount++; weekRev += s.salePrice; }
  }
  const weekElapsed = (dow + 1) / 7;

  return {
    targetCount, targetRev, curKey, months,
    expCount: targetCount * monthElapsed, expRev: targetRev * monthElapsed,
    weekCountTarget, weekRevTarget, weekCount, weekRev,
    expWeekCount: weekCountTarget * weekElapsed, expWeekRev: weekRevTarget * weekElapsed,
    monthsCount: byMonth.length,
  };
}
export type Goal = NonNullable<ReturnType<typeof computeGoal>>;
