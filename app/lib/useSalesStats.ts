import { useMemo } from 'react';
import { Sale } from './sales';
import { Purchase } from './stock';
import { monthTable, immobilised, yearCounter } from './dashboard';
import {
  headlineStats, groupByMonth, byCategory, compareMonths, topArticles, topSizes,
  bestPerMonth, byDayOfWeek, buildSuggestions, chartMonthly, bestMonth, computeGoal,
} from './stats';
import { useCountUp } from './useCountUp';

// Toutes les données dérivées affichées (mémorisées) ; les calculs sont dans stats.ts / dashboard.ts.
export function useSalesStats(sales: Sale[], purchases: Purchase[], selectedMonth: string | null) {
  const stats     = useMemo(() => headlineStats(sales, selectedMonth), [sales, selectedMonth]);
  const stockImmo = useMemo(() => immobilised(purchases), [purchases]);
  const yearCnt   = useMemo(() => yearCounter(sales, new Date().getFullYear()), [sales]);
  const monthRows = useMemo(() => monthTable(sales), [sales]);

  const anim = {
    profit:  useCountUp(stats.totalProfit),
    revenue: useCountUp(stats.totalRevenue),
    count:   useCountUp(stats.count),
    margin:  useCountUp(stats.avgMargin),
    avgSale: useCountUp(stats.avgSalePrice),
  };

  const byMonth         = useMemo(() => groupByMonth(sales), [sales]);
  const byMonthDesc     = useMemo(() => [...byMonth].reverse(), [byMonth]);
  const byCat           = useMemo(() => byCategory(sales), [sales]);
  const monthComparison = useMemo(() => compareMonths(byMonth), [byMonth]);
  const topArts         = useMemo(() => topArticles(sales), [sales]);
  const sizes           = useMemo(() => topSizes(sales), [sales]);
  const bestPerMo       = useMemo(() => bestPerMonth(byMonth), [byMonth]);
  const byDow           = useMemo(() => byDayOfWeek(sales), [sales]);
  const suggestions     = useMemo(() => buildSuggestions(sales, topArts, byDow, byCat, byMonth, sizes),
    [sales, topArts, byDow, byCat, byMonth, sizes]);
  const chart           = useMemo(() => chartMonthly(byMonth), [byMonth]);
  const best            = useMemo(() => bestMonth(byMonth), [byMonth]);
  const goal            = useMemo(() => computeGoal(byMonth, sales), [byMonth, sales]);

  return {
    stats, stockImmo, yearCnt, monthRows, anim,
    byMonthDesc, byCat, monthComparison, topArticles: topArts, topSizes: sizes,
    bestPerMonth: bestPerMo, byDayOfWeek: byDow, suggestions, chartMonthly: chart, bestMonth: best, goal,
  };
}
export type SalesStats = ReturnType<typeof useSalesStats>;
