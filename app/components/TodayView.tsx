'use client';

import { TrendingUp, TrendingDown, AlertTriangle, Pencil, Boxes, Tag } from 'lucide-react';
import MailsAVerifier from './MailsAVerifier';
import { Button, Card, Badge } from './ui';
import { Sale, today, fmt, fmtPlain, calcProfit } from '../lib/sales';
import { Purchase, isStale, STALE_DAYS } from '../lib/stock';
import { splitStock } from '../lib/sellArticle';
import type { StockFilter } from './StockView';
import { totals, salesOfMonth, prevMonthKey, evolutionPct, dailyProfit, missingPurchase } from '../lib/dashboard';
import type { SalesStats } from '../lib/useSalesStats';

const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

// Accueil : ce qui demande un geste (mails Shein à vérifier, prix de vente à saisir), puis le résultat du mois.
// T-034.3 : plus de file « ventes à relier » (liaison supprimée).
export default function TodayView({ userId, sales, purchases, st, openEdit, goStock }: {
  userId: string; sales: Sale[]; purchases: Purchase[]; st: SalesStats;
  openEdit: (s: Sale) => void; goStock: (f?: StockFilter) => void;
}) {
  const now = today();
  const monthKey = now.slice(0, 7);
  const cur = totals(salesOfMonth(sales, monthKey));
  const prev = totals(salesOfMonth(sales, prevMonthKey(monthKey)));
  const evo = evolutionPct(cur.revenue, prev.revenue);
  const daysInMonth = new Date(+monthKey.slice(0, 4), +monthKey.slice(5, 7), 0).getDate();
  const lastDay = Math.min(+now.slice(8, 10), daysInMonth);
  const daily = dailyProfit(sales, monthKey, lastDay);
  const maxAbs = Math.max(1, ...daily.map((d) => Math.abs(d.profit)));
  const goal = st.goal;
  const goalPct = goal ? Math.min(100, (cur.count / goal.targetCount) * 100) : 0;
  const todays = sales.filter((s) => s.date === now);
  const { inStock } = splitStock(purchases, sales);
  const stale = inStock.filter((p) => isStale(p, now));
  const staleTotal = stale.reduce((a, p) => a + p.purchasePrice, 0);
  const y = st.yearCnt;

  const hero = (
    <Card className="p-5" style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.16),rgba(139,92,246,0.10))', border:'1px solid rgba(99,102,241,0.28)' }}>
      <p className="text-xs uppercase tracking-wide text-white/45 font-semibold">Bénéfice net du mois</p>
      <p className="text-3xl sm:text-4xl font-bold mt-1 tracking-tight" style={{ color: cur.profit >= 0 ? '#a5b4fc' : '#f87171' }}>
        {(cur.profit >= 0 ? '+' : '') + eur(cur.profit)}
      </p>
      {goal && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-white/55 mb-1">
            <span>Objectif : {cur.count} / {goal.targetCount} ventes</span><span>{goalPct.toFixed(0)} %</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full" style={{ width:`${goalPct}%`, background:'linear-gradient(90deg,#6366f1,#a78bfa)' }} />
          </div>
        </div>
      )}
      {cur.perso.count > 0 && <p className="text-xs text-white/55 mt-3">Revente {eur(cur.resale.revenue)} (marge {cur.resale.margin.toFixed(0)} %) · perso {eur(cur.perso.revenue)} ({cur.perso.count} vente{cur.perso.count > 1 ? 's' : ''}, sans marge).</p>}
      {cur.missing > 0 && <p className="text-xs text-amber-300/90 mt-3">{cur.missing} vente{cur.missing > 1 ? 's' : ''} sans prix d'achat : exclue{cur.missing > 1 ? 's' : ''} du bénéfice.</p>}
    </Card>
  );

  const secondary = (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">CA du mois</p>
        <p className="text-xl font-bold text-white mt-1 truncate">{eur(cur.revenue)}</p>
        {evo !== null ? (
          <p className={`text-xs mt-1 flex items-center gap-1 ${evo >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {evo >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{evo >= 0 ? '+' : ''}{evo.toFixed(0)} % vs mois dernier
          </p>
        ) : <p className="text-xs text-white/55 mt-1">{cur.count} vente{cur.count > 1 ? 's' : ''}</p>}
      </Card>
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">Seuil {y.year}</p>
        <p className="text-sm font-bold text-white mt-1">{y.count} / 30 ventes</p>
        <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background:'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full" style={{ width:`${y.salesPct}%`, background: y.salesPct >= 100 ? '#f59e0b' : '#6366f1' }} />
        </div>
        <p className="text-xs text-white/50 mt-1.5">{y.revenue.toFixed(0)} / 2000 € de CA</p>
      </Card>
    </div>
  );

  const todayList = (
    <Card className="p-4">
      <p className="text-sm font-bold text-white mb-3">Ventes du jour <span className="text-white/55 font-medium">({todays.length})</span></p>
      {todays.length === 0 ? <p className="text-xs text-white/55">Aucune vente enregistrée aujourd'hui.</p> : (
        <div className="space-y-2">
          {todays.map((s) => (
            <div key={s.id} className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{s.article}</p>
                <p className="text-xs text-white/60">Vendu {fmtPlain(s.salePrice)}{s.size ? ` · ${s.size}` : ''}</p>
              </div>
              {s.isPersonal
                ? <Badge color="#cbd5e1">perso</Badge>
                : missingPurchase(s)
                ? <Badge color="#fca5a5">à compléter</Badge>
                : <span className="text-sm font-bold shrink-0" style={{ color: calcProfit(s) >= 0 ? '#818cf8' : '#f87171' }}>{fmt(calcProfit(s))}</span>}
              <Button icon onClick={() => openEdit(s)} aria-label="Modifier la vente" title="Modifier la vente" className="shrink-0">
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const chart = (
    <Card className="p-4">
      <p className="text-sm font-bold text-white mb-3">Bénéfice par jour <span className="text-white/55 font-medium">(mois en cours)</span></p>
      <div className="flex items-end gap-[2px] h-20" role="img" aria-label="Bénéfice par jour du mois en cours">
        {daily.map((d) => (
          <div key={d.day} title={`${d.day} : ${eur(d.profit)}`} className="flex-1 min-w-0 rounded-sm"
            style={{ height: `${Math.max(d.profit === 0 ? 3 : 8, (Math.abs(d.profit) / maxAbs) * 100)}%`,
              background: d.profit < 0 ? '#ef4444' : d.profit === 0 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(180deg,#8b5cf6,#6366f1)' }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-white/55 mt-1"><span>1</span><span>{lastDay}</span></div>
    </Card>
  );

  const toPrice = inStock.length > 0 && (
    <button onClick={() => goStock('stock')} className="w-full text-left rounded-2xl p-4 flex items-center gap-3 min-h-[44px]"
      style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.25)' }}>
      <Tag className="w-5 h-5 text-emerald-300 shrink-0" />
      <span className="text-sm text-white/80 min-w-0">
        <b className="text-emerald-200">{inStock.length} article{inStock.length > 1 ? 's' : ''} Shein</b> en stock : saisis le prix de vente Vinted quand {inStock.length > 1 ? 'ils partent' : 'il part'}
      </span>
      <Boxes className="hidden sm:block w-4 h-4 text-white/55 ml-auto shrink-0" />
    </button>
  );

  const alerts = stale.length > 0 && (
    <button onClick={() => goStock('vieux')} className="w-full text-left rounded-2xl p-4 flex items-center gap-3 min-h-[44px]"
      style={{ background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.25)' }}>
      <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
      <span className="text-sm text-white/80 min-w-0">
        <b className="text-amber-200">{stale.length} article{stale.length > 1 ? 's' : ''}</b> en stock depuis plus de {STALE_DAYS} jours ({eur(staleTotal)} immobilisés)
      </span>
      <Boxes className="hidden sm:block w-4 h-4 text-white/55 ml-auto shrink-0" />
    </button>
  );

  // Mobile : une colonne dans l'ordre hero, CA/seuil, mails à vérifier + prix à saisir, ventes du jour, graphe, alertes.
  // Desktop (xl) : action à gauche, vue d'ensemble à droite (les colonnes ne sont des blocs qu'à partir de xl).
  const col = 'contents xl:flex xl:flex-col xl:gap-4 min-w-0';
  return (
    <div className="animate-fade-in grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 xl:gap-6">
      <div className={col}>
        <div className="order-3 xl:order-none min-w-0 flex flex-col gap-4"><MailsAVerifier userId={userId} />{toPrice}</div>
        <div className="order-4 xl:order-none">{todayList}</div>
        {alerts && <div className="order-6 xl:order-none">{alerts}</div>}
      </div>
      <div className={col}>
        <div className="order-1 xl:order-none">{hero}</div>
        <div className="order-2 xl:order-none">{secondary}</div>
        <div className="order-5 xl:order-none">{chart}</div>
      </div>
    </div>
  );
}
