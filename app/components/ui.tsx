'use client';

import React, { useState } from 'react';
import { Sparkles, Package } from 'lucide-react';
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
      className="shrink-0 px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition-all"
      style={active
        ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
        : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </button>
  );
}

/** Champ de formulaire unique : libellé + champ (44 px mini) + aide ou erreur. L'id est injecté sur l'input/select/textarea enfant. */
export function Field({ label, hint, error, className = '', children }:
  { label:string; hint?:string; error?:string; className?:string; children:React.ReactNode }) {
  const uid = React.useId();
  const only = React.Children.count(children) === 1 && React.isValidElement(children) ? (children as React.ReactElement<any>) : null;
  const isControl = !!only && typeof only.type === 'string' && ['input','select','textarea'].includes(only.type);
  const id = (isControl && only!.props.id) || uid;
  const note = error || hint;
  const control = isControl
    ? React.cloneElement(only!, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? `${id}-note` : undefined })
    : children;
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={isControl ? id : undefined} className="text-xs font-bold uppercase tracking-widest block mb-1.5"
        style={{ color:'rgba(255,255,255,0.6)' }}>{label}</label>
      {control}
      {note && <p id={`${id}-note`} role={error ? 'alert' : undefined} className="text-xs mt-1.5"
        style={{ color: error ? '#fca5a5' : 'rgba(255,255,255,0.55)' }}>{note}</p>}
    </div>
  );
}
export const FormField = Field;

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

// ── Vignette photo unique (T-034.4 / A3) : ratio fixe, repli propre si photo_url vide ou lien mort ──
export function Thumb({ src, name, size = 'md', className = '' }: {
  src?: string | null; name?: string; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const dim = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-20 h-28 sm:w-24 sm:h-32 rounded-xl' : 'w-14 h-[4.5rem] rounded-xl';
  const ok = !!src && failed !== src;
  return (
    <div className={`${dim} shrink-0 overflow-hidden relative flex items-center justify-center ${className}`}
      style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.2)' }}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" loading="lazy" referrerPolicy="no-referrer"
          onError={() => setFailed(src!)}
          ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setFailed(src!); }} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-0.5 px-0.5 text-center" title={name}>
          <Package className={size === 'sm' ? 'w-3.5 h-3.5 text-indigo-300' : 'w-5 h-5 text-indigo-300'} />
          {size !== 'sm' && name && <span className="text-[10px] leading-tight text-white/60 line-clamp-2 break-words">{name}</span>}
        </div>
      )}
    </div>
  );
}

// ── Composants uniques (T-034.4) : bouton, carte, badge, indicateur chiffré ──
type BtnVariant = 'primary' | 'success' | 'ghost' | 'danger' | 'warn';
const BTN: Record<BtnVariant, React.CSSProperties> = {
  primary: { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', boxShadow:'0 4px 18px rgba(99,102,241,0.35)' },
  success: { background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff' },
  ghost:   { background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.08)' },
  danger:  { background:'rgba(248,113,113,0.10)', color:'#fca5a5', border:'1px solid rgba(248,113,113,0.25)' },
  warn:    { background:'rgba(245,158,11,0.10)', color:'#fde68a', border:'1px solid rgba(245,158,11,0.25)' },
};
export function Button({ variant = 'ghost', icon = false, className = '', style, ...rest }:
  { variant?: BtnVariant; icon?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl font-bold text-sm transition-all active:scale-[0.97] disabled:opacity-50 ${icon ? 'min-w-[44px] px-2' : 'px-4'} ${className}`}
      style={{ ...BTN[variant], ...style }} />
  );
}

export function Card({ className = '', style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return <div className={`card rounded-2xl min-w-0 ${className}`} style={style}>{children}</div>;
}

export function Badge({ color = '#c4b5fd', children, title }: { color?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
      style={{ background:`${color}22`, color, border:`1px solid ${color}44` }}>{children}</span>
  );
}
