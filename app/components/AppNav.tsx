'use client';

import { Plus, ShoppingBag, BarChart2, List, Settings, Boxes, Sun } from 'lucide-react';

export type Tab = 'aujourdhui'|'ventes'|'stock'|'analyse';

const TABS: { id: Tab; label: string; Icon: typeof Sun }[] = [
  { id:'aujourdhui', label:"Aujourd'hui", Icon: Sun },
  { id:'ventes',     label:'Ventes',      Icon: List },
  { id:'stock',      label:'Stock',       Icon: Boxes },
  { id:'analyse',    label:'Analyse',     Icon: BarChart2 },
];
const GRAD = 'linear-gradient(135deg,#6366f1,#8b5cf6)';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
        style={{ background: GRAD, boxShadow:'0 8px 24px rgba(99,102,241,0.4)' }}>
        <ShoppingBag className="w-4 h-4 text-white" />
      </div>
      <div>
        <h1 className="text-base font-bold text-white tracking-tight leading-none">
          Sell<span style={{ background:'linear-gradient(90deg,#6366f1,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Sync</span>
        </h1>
        <p className="text-xs text-white/55 mt-0.5 font-medium tracking-wide">VINTED ACCOUNTING</p>
      </div>
    </div>
  );
}

const Badge = ({ n }: { n: number }) => n > 0 ? (
  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ background:'#10b981' }}>{n}</span>
) : null;

// Navigation : barre latérale (écran ≥ 768 px) ; barre d'onglets en bas + bouton « + » flottant (mobile).
// Import/export CSV et déconnexion sont dans Réglages.
export default function AppNav({ tab, setTab, toLink, openForm, onOpenSettings }: {
  tab: Tab; setTab: (t: Tab) => void; toLink: number; openForm: () => void; onOpenSettings: () => void;
}) {
  return (
    <>
      {/* Barre latérale — desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 z-30 flex-col px-3 py-6 overflow-y-auto"
        style={{ paddingLeft:'max(0.75rem, env(safe-area-inset-left))', width:'calc(14rem + env(safe-area-inset-left))', background:'rgba(11,12,20,0.92)', borderRight:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-2 mb-6"><Logo /></div>
        <button onClick={openForm}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 mb-5 rounded-xl font-bold text-sm text-white active:scale-[0.97] transition-all"
          style={{ background: GRAD, boxShadow:'0 4px 18px rgba(99,102,241,0.4)' }}>
          <Plus className="w-4 h-4" /> Vente manuelle
        </button>
        <nav className="flex flex-col gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
              style={tab === id
                ? { background: GRAD, color:'#fff', boxShadow:'0 2px 12px rgba(99,102,241,0.35)' }
                : { color:'rgba(255,255,255,0.45)' }}>
              <Icon className="w-4 h-4" />{label}
              {id === 'aujourdhui' && <span className="ml-auto"><Badge n={toLink} /></span>}
            </button>
          ))}
        </nav>
        <button onClick={onOpenSettings}
          className="mt-auto flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white/80 transition-all">
          <Settings className="w-4 h-4" />Réglages
        </button>
      </aside>

      {/* Barre du haut — mobile */}
      <header className="md:hidden pt-5 pb-3 flex items-center justify-between">
        <Logo />
        <button onClick={onOpenSettings} title="Réglages" aria-label="Réglages"
          className="flex items-center justify-center w-11 h-11 rounded-xl text-white/60 hover:text-white/80"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Bouton + flottant — mobile */}
      <button onClick={openForm} title="Nouvelle vente" aria-label="Nouvelle vente"
        className="md:hidden fixed right-4 z-30 w-14 h-14 rounded-full flex items-center justify-center text-white active:scale-95 transition-all"
        style={{ bottom:'calc(76px + env(safe-area-inset-bottom))', right:'max(1rem, env(safe-area-inset-right))', background: GRAD, boxShadow:'0 8px 24px rgba(99,102,241,0.5)' }}>
        <Plus className="w-6 h-6" />
      </button>

      {/* Onglets du bas — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex px-2 pt-1.5"
        style={{ paddingBottom:'max(0.5rem, env(safe-area-inset-bottom))', paddingLeft:'max(0.5rem, env(safe-area-inset-left))', paddingRight:'max(0.5rem, env(safe-area-inset-right))', background:'rgba(11,12,20,0.96)', borderTop:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(10px)' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] rounded-xl text-xs font-semibold transition-all"
            style={{ color: tab === id ? '#a5b4fc' : 'rgba(255,255,255,0.6)' }}>
            <Icon className="w-5 h-5" />{label}
            {id === 'aujourdhui' && toLink > 0 && (
              <span className="absolute top-0.5 left-1/2 ml-2 px-1.5 rounded-full text-xs font-bold text-white" style={{ background:'#10b981' }}>{toLink}</span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
