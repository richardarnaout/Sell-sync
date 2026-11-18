'use client';

import { TrendingUp, Package, Euro, Percent, Tag } from 'lucide-react';
import { THRESHOLD_SALES, THRESHOLD_REVENUE } from '../lib/dashboard';
import type { SalesStats } from '../lib/useSalesStats';
import { StatCard } from './ui';

// Cartes du haut, stock immobilisé, seuils annuels et récap par mois.
export default function Dashboard({ st }: { st: SalesStats }) {
  const { stats, stockImmo, yearCnt, monthRows } = st;
  const { profit: animProfit, revenue: animRevenue, count: animCount, margin: animMargin, avgSale: animAvgSale } = st.anim;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard label="Bénéfice net" value={(animProfit >= 0 ? '+' : '') + animProfit.toFixed(2).replace('.',',') + ' €'}
          delta={stats.totalProfit} accent="#6366f1" icon={<Euro className="w-4 h-4" />} />
        <StatCard label="Chiffre d'affaires" value={animRevenue.toFixed(2).replace('.',',') + ' €'}
          accent="#06b6d4" icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Articles vendus" value={Math.round(animCount).toString()}
          accent="#8b5cf6" icon={<Package className="w-4 h-4" />} />
        <StatCard label="Marge (bénéfice ÷ CA)" value={animMargin.toFixed(1) + ' %'}
          accent="#10b981" icon={<Percent className="w-4 h-4" />} />
        <StatCard label="Moyenne de vente" value={animAvgSale.toFixed(2).replace('.',',') + ' €'}
          accent="#f59e0b" icon={<Tag className="w-4 h-4" />} />
      </div>

      {/* ── T-022.4 : stock immobilisé, compteur annuel, récap par mois ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="p-4 rounded-2xl" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">Stock immobilisé</p>
          <p className="text-2xl font-bold text-white mt-1">{stockImmo.total.toFixed(2).replace('.',',')} €</p>
          <p className="text-xs text-white/40 mt-1">{stockImmo.count} article{stockImmo.count > 1 ? 's' : ''} en stock, non vendu{stockImmo.count > 1 ? 's' : ''} (prix d'achat)</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">Seuils de déclaration {yearCnt.year} (indicateur)</p>
          {[
            { label:`${yearCnt.count} / ${THRESHOLD_SALES} ventes`, pct: yearCnt.salesPct },
            { label:`${yearCnt.revenue.toFixed(0)} / ${THRESHOLD_REVENUE} € de CA`, pct: yearCnt.revenuePct },
          ].map(b => (
            <div key={b.label} className="mt-2">
              <p className="text-xs text-white/60 mb-1">{b.label}</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width:`${b.pct}%`, background: b.pct >= 100 ? '#f59e0b' : '#6366f1' }} />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-white/30 mt-2">Repère par année civile, sans valeur de conseil fiscal.</p>
        </div>
      </div>
      {stats.perso.count > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="p-4 rounded-2xl" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">Revente (achats Shein)</p>
            <p className="text-sm text-white/80 mt-1">CA {stats.resale.revenue.toFixed(2).replace('.',',')} € · bénéfice <span className="font-bold">{stats.resale.profit.toFixed(2).replace('.',',')} €</span> · marge {stats.resale.margin.toFixed(1)} %</p>
            <p className="text-xs text-white/40 mt-1">{stats.resale.count} vente{stats.resale.count > 1 ? 's' : ''}</p>
          </div>
          <div className="p-4 rounded-2xl" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">Ventes perso</p>
            <p className="text-sm text-white/80 mt-1">CA {stats.perso.revenue.toFixed(2).replace('.',',')} €</p>
            <p className="text-xs text-white/40 mt-1">{stats.perso.count} vente{stats.perso.count > 1 ? 's' : ''}, sans marge</p>
          </div>
        </div>
      )}
      {stats.missing > 0 && (
        <p className="text-xs text-amber-300/90 mb-4">
          {stats.missing} vente{stats.missing > 1 ? 's' : ''} : prix d'achat manquant — exclue{stats.missing > 1 ? 's' : ''} du bénéfice et de la marge.
        </p>
      )}
      {monthRows.length > 0 && (
        <div className="mb-6 sm:mb-8 rounded-2xl overflow-hidden" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div className="grid grid-cols-5 gap-2 px-3 sm:px-4 py-2 text-[10px] sm:text-[11px] uppercase tracking-wide text-white/35 font-semibold">
            <span>Mois</span><span className="text-right">Ventes</span><span className="text-right">CA</span><span className="text-right">Bénéf.</span><span className="text-right">Marge</span>
          </div>
          {monthRows.map(m => (
            <div key={m.key} className="grid grid-cols-5 gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-white/80 border-t" style={{ borderColor:'rgba(255,255,255,0.05)' }}>
              <span className="truncate">{m.key}</span>
              <span className="text-right">{m.count}</span>
              <span className="text-right">{m.revenue.toFixed(0)} €</span>
              <span className={`text-right font-semibold ${m.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{m.profit.toFixed(0)} €</span>
              <span className="text-right">{m.margin.toFixed(0)} %{m.missing > 0 && <span title="prix d'achat manquant" className="text-amber-300"> *</span>}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
