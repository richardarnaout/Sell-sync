'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Trash2, Pencil, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { Sale, today, CAT_COLORS, calcProfit, fmt, fmtPlain, parseDate } from '../lib/sales';
import type { MonthEntry } from '../lib/stats';
import { Pill, EmptyState } from './ui';
import MonthPills from './MonthPills';
import { missingPurchase } from '../lib/dashboard';

export type SalesFilter = 'tout'|'jour'|'semaine'|'manquant';

// Filtre de la liste : jour = aujourd'hui, semaine = 7 derniers jours (aujourd'hui compris).
export function matchesFilter(s: Sale, f: SalesFilter, now: string): boolean {
  if (f === 'jour') return s.date === now;
  if (f === 'semaine') { const d = new Date(now + 'T00:00:00'); d.setDate(d.getDate() - 6); const from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return s.date >= from && s.date <= now; }
  if (f === 'manquant') return missingPurchase(s);
  return true;
}

// Onglet Mes ventes : filtre par mois et cartes de vente.
export default function SalesList({ sales, byMonthDesc, selectedMonth, setSelectedMonth, openForm, openEdit, setDeleteId, setSales, filter, setFilter }: {
  sales: Sale[]; byMonthDesc: MonthEntry[];
  selectedMonth: string | null; setSelectedMonth: (k: string | null) => void;
  openForm: () => void; openEdit: (s: Sale) => void; setDeleteId: (id: string) => void;
  setSales: Dispatch<SetStateAction<Sale[]>>;
  filter: SalesFilter; setFilter: (f: SalesFilter) => void;
}) {
  const now = today();
  const [persoErr, setPersoErr] = useState('');

  // Marque (ou démarque) des ventes comme perso : mise à jour locale, retour arrière si la base refuse.
  async function setPersonal(ids: string[], value: boolean) {
    if (ids.length === 0) return;
    setPersoErr('');
    const before = sales;
    setSales(prev => prev.map(s => ids.includes(s.id) ? { ...s, isPersonal: value, ...(value ? { purchasePrice: 0 } : {}) } : s));
    const { error } = await supabase.from('sales').update({ is_personal: value, ...(value ? { purchase_price: 0 } : {}) }).in('id', ids);
    if (error) {
      setSales(before);
      setPersoErr(/is_personal/.test(error.message) ? "Lance d'abord supabase/articles-perso.sql dans Supabase." : error.message);
    }
  }
  const missingIds = sales.filter(missingPurchase).map(s => s.id);
  return (
    <div>
      <MonthPills byMonthDesc={byMonthDesc} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4">
        {([['tout','Tout'],['jour',"Aujourd'hui"],['semaine','Cette semaine'],['manquant',"Prix d'achat manquant"]] as const).map(([k, l]) => (
          <Pill key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Pill>
        ))}
      </div>

      {persoErr && <p className="text-xs text-red-300 mb-3">{persoErr}</p>}
      {filter === 'manquant' && missingIds.length > 0 && (
        <button onClick={() => { if (confirm(`Marquer ${missingIds.length} vente${missingIds.length > 1 ? 's' : ''} sans prix d'achat comme articles perso ?`)) setPersonal(missingIds, true); }}
          className="mb-4 px-4 min-h-[44px] rounded-xl text-sm font-semibold text-indigo-200 hover:text-white transition"
          style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.3)' }}>
          Marquer les {missingIds.length} comme articles perso
        </button>
      )}
      {sales.length === 0 ? (
        <EmptyState onAdd={openForm} />
      ) : (
        <div className="space-y-10">
          {filter !== 'tout' && !byMonthDesc.some(([k, m]) => (!selectedMonth || k === selectedMonth) && m.sales.some((x) => matchesFilter(x, filter, now))) && (
            <p className="text-sm text-white/60 text-center py-10">Aucune vente ne correspond à ce filtre.</p>
          )}
          {byMonthDesc
            .filter(([k]) => !selectedMonth || k === selectedMonth)
            .map(([monthKey, month]) => [monthKey, month, month.sales.filter((x) => matchesFilter(x, filter, now))] as const)
            .filter(([, , list]) => list.length > 0)
            .map(([monthKey, month, list], gi) => (
              <div key={monthKey} className="animate-fade-slide-up" style={{ animationDelay:`${gi*60}ms`, animationFillMode:'both' }}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-4 px-1">
                  <div>
                    <p className="text-xs font-bold text-white/60 uppercase tracking-widest">{month.label}</p>
                    <p className="text-xs text-white/55 mt-0.5">{list.length} vente{list.length > 1 ? 's' : ''} · CA {fmtPlain(month.revenue)}</p>
                  </div>
                  <div className={`text-base font-bold flex items-center gap-1 ${month.profit >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
                    {month.profit >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {(month.profit >= 0 ? '+' : '') + month.profit.toFixed(2).replace('.',',') + ' €'}
                  </div>
                </div>

                {/* Sales grid — 2 colonnes sur desktop, 3 sur grand écran */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((s, i) => {
                    const p = calcProfit(s);
                    const isPos = p >= 0;
                    const margin = s.salePrice > 0 ? Math.min(Math.max((p / s.salePrice) * 100, 0), 100) : 0;
                    return (
                      <div key={s.id}
                        className="card rounded-2xl overflow-hidden animate-fade-slide-up"
                        style={{ animationDelay:`${i * 40}ms`, animationFillMode:'both' }}>
                        <div className="flex">
                          <div className="w-[3px] shrink-0"
                            style={{ background: isPos
                              ? `linear-gradient(180deg, ${CAT_COLORS[s.category] ?? '#6366f1'}, ${CAT_COLORS[s.category] ?? '#6366f1'}88)`
                              : 'linear-gradient(180deg,#f87171,#ef4444)' }} />
                          <div className="flex-1 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <p className="font-semibold text-white text-sm truncate min-w-0">{s.article}</p>
                                  {s.productUrl && (
                                    <a href={s.productUrl} target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      title="Ouvrir le lien du produit"
                                      className="shrink-0 text-indigo-300/70 hover:text-indigo-300 transition p-0.5 rounded">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                                    style={{ background:`${CAT_COLORS[s.category] ?? '#6366f1'}22`, color: CAT_COLORS[s.category] ?? '#818cf8', border:`1px solid ${CAT_COLORS[s.category] ?? '#6366f1'}44` }}>
                                    {s.category}
                                  </span>
                                  {s.isPersonal && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                                      style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.65)', border:'1px solid rgba(255,255,255,0.12)' }}>
                                      Perso
                                    </span>
                                  )}
                                  {s.size && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                                      style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.08)' }}>
                                      {s.size}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-white/55 mt-0.5">
                                  {parseDate(s.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}
                                </p>
                                <div className="flex flex-wrap gap-x-3 mt-2 text-xs text-white/55">
                                  {s.purchasePrice > 0 && <span>Achat <span className="text-white/55">{fmtPlain(s.purchasePrice)}</span></span>}
                                  <span>Vendu <span className="text-white/70 font-semibold">{fmtPlain(s.salePrice)}</span></span>
                                  {s.shippingCost > 0 && <span>Port <span className="text-white/55">−{fmtPlain(s.shippingCost)}</span></span>}
                                  {s.boosterCost  > 0 && <span>Boost <span className="text-white/55">−{fmtPlain(s.boosterCost)}</span></span>}
                                </div>
                                {s.salePrice > 0 && (
                                  <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
                                    <div className="h-full rounded-full bar-animate"
                                      style={{ '--bar-width':`${margin}%`, background: isPos ? `linear-gradient(90deg,${CAT_COLORS[s.category] ?? '#6366f1'},${CAT_COLORS[s.category] ?? '#6366f1'}99)` : 'linear-gradient(90deg,#f87171,#ef4444)' } as React.CSSProperties} />
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                {s.isPersonal ? (
                                  <span className="text-xs font-semibold text-white/50">CA seul</span>
                                ) : (
                                  <span className="text-base font-bold" style={{ color: isPos ? '#818cf8' : '#f87171' }}>
                                    {fmt(p)}
                                  </span>
                                )}
                                {s.purchasePrice > 0 && s.salePrice > 0 && (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: isPos ? 'rgba(99,102,241,0.12)' : 'rgba(248,113,113,0.12)',
                                             color: isPos ? '#a5b4fc' : '#fca5a5',
                                             border:`1px solid ${isPos ? 'rgba(99,102,241,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                                    ×{(s.salePrice / (s.purchasePrice || 1)).toFixed(1)}
                                  </span>
                                )}
                                <div className="flex gap-1">
                                  <button onClick={() => setPersonal([s.id], !s.isPersonal)}
                                    title={s.isPersonal ? "Ce n'est plus un article perso" : "Marquer comme article perso (pas d'achat)"}
                                    className={`px-2 min-h-[32px] rounded-lg text-xs font-bold transition ${s.isPersonal ? 'text-indigo-300 bg-indigo-500/15' : 'text-white/55 hover:text-indigo-300 hover:bg-indigo-500/10'}`}>
                                    Perso
                                  </button>
                                  <button onClick={() => openEdit(s)}
                                    className="p-1.5 rounded-lg text-white/55 hover:text-indigo-400 hover:bg-indigo-500/10 transition">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setDeleteId(s.id)}
                                    className="p-1.5 rounded-lg text-white/55 hover:text-red-400 hover:bg-red-500/10 transition">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
