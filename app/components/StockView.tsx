'use client';
import { useState } from 'react';
import { Package, Trash2, EyeOff, Boxes } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Purchase, purchaseToDb } from '../lib/stock';

interface Props {
  userId: string;
  purchases: Purchase[];
  onChange: () => void;
}

const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

export default function StockView({ userId, purchases, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const stock = purchases.filter((p) => p.status === 'en_stock');
  const total = stock.reduce((s, p) => s + p.purchasePrice, 0);

  async function ignore(p: Purchase) {
    setBusy(p.id);
    await supabase.from('purchases').update(purchaseToDb({ ...p, status: 'ignore' }, userId)).eq('id', p.id);
    setBusy(null); onChange();
  }
  async function remove(p: Purchase) {
    setBusy(p.id);
    await supabase.from('purchases').delete().eq('id', p.id);
    setBusy(null); onChange();
  }

  if (stock.length === 0) {
    return (
      <div className="py-16 text-center">
        <Boxes className="w-10 h-10 mx-auto text-white/15 mb-3" />
        <p className="text-white/40 text-sm">Aucun article en stock.</p>
        <p className="text-white/25 text-xs mt-1">Les commandes Shein détectées apparaîtront ici en attendant d'être vendues.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-md">
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">En stock</p>
          <p className="text-2xl font-bold text-white mt-1">{stock.length}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[11px] uppercase tracking-wide text-white/35 font-semibold">Argent immobilisé</p>
          <p className="text-2xl font-bold text-white mt-1">{money(total)}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {stock.map((p) => (
          <div key={p.id} className="p-3 sm:p-4 rounded-xl flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(99,102,241,0.15)' }}>
              <Package className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {p.model && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: 'rgba(139,92,246,0.18)', color: '#c4b5fd' }}>{p.model}</span>
                )}
                <p className="text-sm font-semibold text-white truncate">{p.article}</p>
              </div>
              <p className="text-xs text-white/40 mt-0.5">
                {p.size && <>taille {p.size} · </>}{p.color && <>{p.color} · </>}acheté le {p.date}
              </p>
              {p.sku && <p className="text-[10px] text-white/25 mt-0.5 font-mono">SKU {p.sku}</p>}
            </div>
            <span className="text-sm font-bold text-white/80">{money(p.purchasePrice)}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => ignore(p)} disabled={busy === p.id} title="Pas pour la revente"
                className="p-2 rounded-lg text-white/30 hover:text-white/70 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(p)} disabled={busy === p.id} title="Supprimer"
                className="p-2 rounded-lg text-white/30 hover:text-red-300 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
