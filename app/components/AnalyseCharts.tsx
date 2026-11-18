'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, Legend } from 'recharts';
import { CAT_COLORS, MONTH_COLORS, fmt, fmtPlain } from '../lib/sales';
import type { SalesStats } from '../lib/useSalesStats';
import { ChartTooltip } from './ui';

// Graphiques de l'onglet Analyse.
export default function AnalyseCharts({ st, salesCount }: { st: SalesStats; salesCount: number }) {
  const { chartMonthly, byCat, monthComparison, topArticles, topSizes, bestPerMonth, byDayOfWeek } = st;
  return (
    <>
      {/* Ligne 1 : CA vs Bénéfice + Tendance bénéfice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="card rounded-2xl p-4 sm:p-5">
          <p className="text-sm font-bold text-white mb-1">Revenus mensuels</p>
          <p className="text-[11px] text-white/30 mb-5">Chiffre d'affaires vs bénéfice</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartMonthly} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="CA" fill="#6366f1" radius={[6,6,0,0]} opacity={0.7} />
              <Bar dataKey="Bénéfice" fill="#a78bfa" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {chartMonthly.length > 1 ? (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Tendance bénéfice</p>
            <p className="text-[11px] text-white/30 mb-5">Évolution mois par mois</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartMonthly}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Bénéfice" stroke="#6366f1" strokeWidth={2.5} fill="url(#profitGrad)" dot={{ fill:'#6366f1', strokeWidth:0, r:4 }} activeDot={{ r:6, fill:'#a78bfa' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="card rounded-2xl p-5 flex items-center justify-center">
            <p className="text-white/20 text-sm">Ajoute des ventes sur plusieurs mois pour voir la tendance</p>
          </div>
        )}
      </div>

      {/* Ligne 2 : Coûts vs CA + Pie catégories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="card rounded-2xl p-4 sm:p-5">
          <p className="text-sm font-bold text-white mb-1">Coûts vs Revenus</p>
          <p className="text-[11px] text-white/30 mb-5">Achats + port + booster</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartMonthly}>
              <defs>
                <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="CA" stroke="#06b6d4" strokeWidth={2} fill="url(#caGrad)" dot={false} />
              <Area type="monotone" dataKey="Coûts" stroke="#f87171" strokeWidth={2} fill="url(#costGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {byCat.length > 0 && (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Par catégorie</p>
            <p className="text-[11px] text-white/30 mb-4">Répartition du chiffre d'affaires</p>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="w-full sm:w-[45%] shrink-0">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={byCat} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} innerRadius={40}>
                      {byCat.map((entry) => (
                        <Cell key={entry.name} fill={CAT_COLORS[entry.name] ?? '#6366f1'} opacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtPlain(Number(v))} contentStyle={{ background:'#12141f', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'white', fontSize:12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:flex-1 space-y-2">
                {byCat.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[c.name] ?? '#6366f1' }} />
                      <span className="text-white/55 font-medium">{c.name}</span>
                      <span className="text-white/20">{c.count}</span>
                    </div>
                    <span className="font-semibold" style={{ color: c.profit >= 0 ? '#a78bfa' : '#f87171' }}>{fmt(c.profit)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Courbes mensuelles comparées ── */}
      {monthComparison.months.length >= 2 && (
        <div className="card rounded-2xl p-4 sm:p-5">
          <p className="text-sm font-bold text-white mb-1">Comparaison mensuelle</p>
          <p className="text-[11px] text-white/30 mb-5">Bénéfice cumulé jour par jour — chaque courbe = un mois</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthComparison.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `J${v}`} interval={4} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize:11, color:'rgba(255,255,255,0.4)', paddingTop:12 }} />
              {monthComparison.months.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} stroke={MONTH_COLORS[i % MONTH_COLORS.length]}
                  strokeWidth={2} dot={false} activeDot={{ r:4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Top articles + Top tailles ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {topArticles.length > 0 && (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Articles les plus vendus</p>
            <p className="text-[11px] text-white/30 mb-4">Top {topArticles.length} par nombre de ventes</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topArticles} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill:'rgba(255,255,255,0.45)', fontSize:10 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Ventes" fill="#6366f1" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {topSizes.length > 0 && (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Tailles les plus vendues</p>
            <p className="text-[11px] text-white/30 mb-4">Répartition par taille</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSizes} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="size" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" name="Ventes" radius={[6,6,0,0]}>
                  {topSizes.map((_, i) => (
                    <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Article phare par mois + Meilleur jour ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {bestPerMonth.length > 0 && (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Article phare par mois</p>
            <p className="text-[11px] text-white/30 mb-4">L'article le plus vendu chaque mois</p>
            <div className="space-y-2">
              {bestPerMonth.slice(0, 8).map(row => (
                <div key={row.month} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-bold text-white/30 w-10 shrink-0">{row.month}</span>
                    <span className="text-xs font-semibold text-white/80 truncate">{row.article}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-[10px] text-white/30">{row.count}×</span>
                    <span className="text-xs font-bold" style={{ color: row.profit >= 0 ? '#a5b4fc' : '#f87171' }}>
                      {(row.profit >= 0 ? '+' : '') + row.profit.toFixed(2).replace('.', ',') + ' €'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {salesCount >= 5 && (
          <div className="card rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-white mb-1">Meilleur jour de la semaine</p>
            <p className="text-[11px] text-white/30 mb-4">Quand tu vends le plus</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDayOfWeek} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="ventes" name="Ventes" radius={[6,6,0,0]}>
                  {byDayOfWeek.map((entry, i) => {
                    const max = Math.max(...byDayOfWeek.map(d => d.ventes));
                    return <Cell key={i} fill={entry.ventes === max && max > 0 ? '#6366f1' : 'rgba(99,102,241,0.3)'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}
