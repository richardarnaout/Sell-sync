'use client';

import { Sparkles } from 'lucide-react';
// Petits composants partagés (T-022.8 : sortis de page.tsx).

// ── Custom tooltip for charts ─────────────────────────────────────────────

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#12141f', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'10px 14px', minWidth:140 }}>
      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:6, textTransform:'capitalize' }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ display:'flex', justifyContent:'space-between', gap:16, fontSize:13, fontWeight:600, color: entry.color || '#fff', marginBottom:2 }}>
          <span style={{ color:'rgba(255,255,255,0.5)', fontWeight:400 }}>{entry.name}</span>
          <span>{Number(entry.value).toFixed(2).replace('.', ',')} €</span>
        </div>
      ))}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

export function StatCard({ label, value, accent, icon, delta }: {
  label:string; value:string; accent:string; icon:React.ReactNode; delta?:number;
}) {
  return (
    <div className="card rounded-2xl p-3 sm:p-4 animate-fade-slide-up">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <p className="text-xs sm:text-xs font-semibold text-white/55 uppercase tracking-wider leading-tight">{label}</p>
        <div className="rounded-xl p-1.5 sm:p-2" style={{ background:`${accent}22`, color:accent }}>{icon}</div>
      </div>
      <p className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: delta !== undefined ? (delta >= 0 ? accent : '#f87171') : accent }}>
        {value}
      </p>
    </div>
  );
}

export function Pill({ active, onClick, children }: { active:boolean; onClick:()=>void; children:React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
      style={active
        ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
        : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </button>
  );
}

export function FormField({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-widest block mb-1.5"
        style={{ color:'rgba(255,255,255,0.6)' }}>{label}</label>
      {children}
    </div>
  );
}

export function EmptyState({ onAdd, label }: { onAdd:()=>void; label?:string }) {
  return (
    <div className="card rounded-3xl p-12 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center animate-float"
        style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)' }}>
        <Sparkles className="w-7 h-7" style={{ color:'#818cf8' }} />
      </div>
      <p className="font-semibold text-white/70 text-sm">{label ?? 'Aucune vente pour l\'instant'}</p>
      <p className="text-white/55 text-xs mt-2">Appuie sur le bouton + pour commencer</p>
    </div>
  );
}
