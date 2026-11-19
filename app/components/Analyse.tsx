'use client';

import { Sparkles } from 'lucide-react';
import AiTools from './AiTools';
import GoalCoach from './GoalCoach';
import AnalyseCharts from './AnalyseCharts';
import { EmptyState } from './ui';
import Dashboard from './Dashboard';
import MonthPills from './MonthPills';
import { Sale, fmtPlain } from '../lib/sales';
import type { SalesStats } from '../lib/useSalesStats';

// Onglet Analyse : meilleur mois, objectif, suggestions, outils IA, graphiques.
export default function Analyse({ sales, st, goalMonth, setGoalMonth, onEmptyAdd, selectedMonth, setSelectedMonth }: {
  sales: Sale[]; st: SalesStats; selectedMonth: string | null; setSelectedMonth: (k: string | null) => void; goalMonth: string; setGoalMonth: (k: string) => void; onEmptyAdd: () => void;
}) {
  const { bestMonth, goal, suggestions } = st;
  return (
    <div className="animate-fade-in">
      {/* Chiffres clés (ex-tableau de bord du haut), filtrés par le mois choisi */}
      <MonthPills byMonthDesc={st.byMonthDesc} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />
      <Dashboard st={st} />
      {sales.length === 0 ? (
        <EmptyState onAdd={onEmptyAdd} label="Ajoute des ventes pour voir les graphiques" />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Best month highlight */}
          {bestMonth && (
            <div className="rounded-2xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))', border:'1px solid rgba(99,102,241,0.2)' }}>
              <div>
                <p className="text-xs text-white/60 font-semibold uppercase tracking-wide mb-1">Meilleur mois</p>
                <p className="text-white font-bold text-lg">{bestMonth[1].label}</p>
                <p className="text-xs text-white/60 mt-0.5">{bestMonth[1].sales.length} vente{bestMonth[1].sales.length > 1 ? 's' : ''}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl sm:text-3xl font-bold text-indigo-400">+{bestMonth[1].profit.toFixed(2).replace('.',',')} €</p>
                <p className="text-xs text-white/55 mt-1">CA {fmtPlain(bestMonth[1].revenue)}</p>
              </div>
            </div>
          )}

          {/* ── Objectif de vente (coach) ── */}
          {goal && <GoalCoach goal={goal} goalMonth={goalMonth} setGoalMonth={setGoalMonth} />}

          {/* ── Suggestions intelligentes ── */}
          {suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <p className="text-sm font-bold text-white">Suggestions</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background:'rgba(99,102,241,0.15)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.2)' }}>
                  basées sur tes données
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {suggestions.map((s, i) => {
                  const c = {
                    success:{ bg:'rgba(16,185,129,0.08)',  border:'rgba(16,185,129,0.25)', label:'#34d399', dot:'#10b981' },
                    info:   { bg:'rgba(99,102,241,0.08)',  border:'rgba(99,102,241,0.25)', label:'#a5b4fc', dot:'#6366f1' },
                    tip:    { bg:'rgba(6,182,212,0.08)',   border:'rgba(6,182,212,0.25)',  label:'#67e8f9', dot:'#06b6d4' },
                    warning:{ bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.25)', label:'#fcd34d', dot:'#f59e0b' },
                  }[s.type];
                  return (
                    <div key={i} className="shrink-0 w-64 rounded-2xl p-4"
                      style={{ background:c.bg, border:`1px solid ${c.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background:c.dot }} />
                        <p className="text-xs font-bold leading-tight" style={{ color:c.label }}>{s.title}</p>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed">{s.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outils IA */}
          <AiTools month={selectedMonth ?? st.byMonthDesc[0]?.[0] ?? null} hasSales={sales.length > 0} />

          <AnalyseCharts st={st} salesCount={sales.length} />

        </div>
      )}
    </div>
  );
}
