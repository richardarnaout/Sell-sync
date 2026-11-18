'use client';

import { Target, CalendarDays } from 'lucide-react';
import { fmtPlain } from '../lib/sales';
import type { Goal } from '../lib/stats';

// ── Barre de progression d'objectif (avec repère de régularité) ────────────

function GoalBar({ label, current, target, expected, render, suffix, past }: {
  label: string; current: number; target: number; expected: number;
  render: (n: number) => string; suffix?: string; past?: boolean;
}) {
  const sfx     = suffix ?? '';
  const pct     = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const expPct  = target > 0 ? Math.min(100, (expected / target) * 100) : 0;
  const reached = current >= target - 1e-9;
  const onTrack = current >= expected - 1e-9;

  let accent: string, status: { text: string; color: string };
  if (past) {
    accent = reached ? '#10b981' : '#ef4444';
    status = reached
      ? { text: 'Quota tenu ✓', color: '#34d399' }
      : { text: 'Sous le quota', color: '#fca5a5' };
  } else {
    accent = reached ? '#10b981' : onTrack ? '#6366f1' : '#f59e0b';
    status = reached
      ? { text: 'Quota atteint 🎉', color: '#34d399' }
      : onTrack
        ? { text: 'Dans les temps', color: '#a5b4fc' }
        : { text: 'En retard', color: '#fcd34d' };
  }

  const footer = past
    ? (reached ? `+${render(current - target)}${sfx} au-dessus du quota 💪` : `${render(target - current)}${sfx} sous le quota`)
    : (reached ? `+${render(current - target)}${sfx} au-dessus du quota 💪`
               : `Encore ${render(Math.max(0, target - current))}${sfx} · repère du jour : ${render(expected)}${sfx}`);

  return (
    <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
          <p className="text-white font-bold text-lg leading-none">
            {render(current)}<span className="text-white/30 text-sm font-medium"> / {render(target)}{sfx}</span>
          </p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ color: status.color, background: `${accent}1a`, border: `1px solid ${accent}40` }}>
          {status.text}
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: accent }} />
        {!past && !reached && expPct > 0 && expPct < 100 && (
          <div className="absolute top-[-2px] bottom-[-2px] w-0.5 rounded-full" style={{ left: `${expPct}%`, background: 'rgba(255,255,255,0.55)' }} />
        )}
      </div>
      <p className="text-[10px] text-white/35 mt-1.5">{footer}</p>
    </div>
  );
}

// ── Objectif de vente (coach) ──

export default function GoalCoach({ goal, goalMonth, setGoalMonth }: {
  goal: Goal; goalMonth: string; setGoalMonth: (k: string) => void;
}) {
  const fmtInt = (n: number) => String(Math.round(n));
  const fmtEur = (n: number) => n.toFixed(0);
  // Mois affiché : sélection valide, sinon mois en cours, sinon le plus récent
  const selKey = goal.months.find(m => m.key === goalMonth)?.key
    ?? (goal.months.find(m => m.isCurrent)?.key ?? goal.months[0].key);
  const sel = goal.months.find(m => m.key === selKey)!;
  const isCur = sel.isCurrent;
  const remCount = Math.max(0, goal.targetCount - sel.count);
  const remRev   = Math.max(0, goal.targetRev - sel.revenue);
  const headline = isCur
    ? (sel.met
        ? `🔥 Quota de ${sel.label} déjà tenu — tu es au-dessus de ta moyenne, continue !`
        : `Pour rester régulier ce mois-ci : encore ${remCount} vente${remCount > 1 ? 's' : ''} et ${fmtPlain(remRev)} pour atteindre ta moyenne.`)
    : (sel.met
        ? `✓ En ${sel.label}, tu as tenu ton quota de régularité. Beau mois !`
        : `En ${sel.label}, tu es resté sous ta moyenne : ${sel.count} vente${sel.count > 1 ? 's' : ''} et ${fmtPlain(sel.revenue)}.`);
  return (
    <div className="rounded-2xl px-4 sm:px-6 py-5"
      style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(99,102,241,0.08))', border: '1px solid rgba(16,185,129,0.2)' }}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Target className="w-4 h-4 text-emerald-400" />
        <p className="text-sm font-bold text-white">Objectif de vente</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.2)' }}>
          quota = ta moyenne
        </span>
      </div>
      <p className="text-xs text-white/55 leading-relaxed mb-1">
        Ton quota minimum de régularité = ta moyenne sur tes {goal.monthsCount} mois&nbsp;:
        <span className="text-white font-semibold"> {goal.targetCount} vente{goal.targetCount > 1 ? 's' : ''}</span> et
        <span className="text-white font-semibold"> {fmtPlain(goal.targetRev)}</span> par mois
        <span className="text-white/35"> (≈ {goal.weekCountTarget} vente{goal.weekCountTarget > 1 ? 's' : ''} et {fmtPlain(goal.weekRevTarget)} / semaine)</span>.
      </p>
      <p className="text-[10px] text-white/35 mb-4">« Montant vendu » = la somme de tes prix de vente sur la période (ton chiffre d'affaires).</p>

      {/* Sélecteur de mois */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
        {goal.months.map(m => {
          const active = m.key === selKey;
          return (
            <button key={m.key} onClick={() => setGoalMonth(m.key)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={active
                ? { background: 'rgba(16,185,129,0.18)', color: '#fff', border: '1px solid rgba(16,185,129,0.4)' }
                : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: m.isCurrent ? '#6366f1' : m.met ? '#10b981' : '#ef4444' }} />
              {m.labelShort}{m.isCurrent ? ' · en cours' : ''}
            </button>
          );
        })}
      </div>

      {/* Résultat du mois sélectionné */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <CalendarDays className="w-3.5 h-3.5 text-white/40" />
        <p className="text-[11px] font-bold text-white/70 uppercase tracking-wide">{sel.label}{isCur ? ' · en cours' : ''}</p>
      </div>
      <p className="text-xs text-white/55 leading-relaxed mb-3">{headline}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <GoalBar label="Ventes" current={sel.count} target={goal.targetCount} expected={isCur ? goal.expCount : goal.targetCount} render={fmtInt} past={!isCur} />
        <GoalBar label="Montant vendu" current={sel.revenue} target={goal.targetRev} expected={isCur ? goal.expRev : goal.targetRev} render={fmtEur} suffix=" €" past={!isCur} />
      </div>

      {/* Semaine en cours (seulement quand on regarde le mois courant) */}
      {isCur && (
        <>
          <div className="flex items-center gap-1.5 mb-2.5 mt-4">
            <CalendarDays className="w-3.5 h-3.5 text-white/40" />
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-wide">Cette semaine</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GoalBar label="Ventes" current={goal.weekCount} target={goal.weekCountTarget} expected={goal.expWeekCount} render={fmtInt} />
            <GoalBar label="Montant vendu" current={goal.weekRev} target={goal.weekRevTarget} expected={goal.expWeekRev} render={fmtEur} suffix=" €" />
          </div>
          <p className="text-[10px] text-white/30 mt-3">
            Le trait clair sur chaque barre = là où tu devrais être aujourd'hui pour tenir ton rythme régulier.
          </p>
        </>
      )}
    </div>
  );
}
