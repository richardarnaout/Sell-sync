'use client';
import { useState } from 'react';
import { Sparkles, Check, X, Link2, Package, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import {
  Purchase, PendingSale, purchaseToDb, pendingToDb,
  rankCandidates, bestGuessId, sampleData,
} from '../lib/stock';

interface Props {
  userId: string;
  purchases: Purchase[];
  pendingSales: PendingSale[];
  onChange: () => void; // recharge stock + ventes en attente + ventes dans page.tsx
}

const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

export default function ReviewQueue({ userId, purchases, pendingSales, onChange }: Props) {
  const waiting = pendingSales.filter((s) => s.status === 'en_attente');
  const stock = purchases.filter((p) => p.status === 'en_stock');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [seeding, setSeeding] = useState(false);

  const pick = (saleId: string, purchaseId: string) =>
    setChosen((c) => ({ ...c, [saleId]: purchaseId }));

  // Valide un appariement : crée la vente (achat + vente), sort l'article du stock,
  // marque la vente en attente comme traitée.
  async function confirm(sale: PendingSale) {
    const purchaseId = chosen[sale.id] ?? bestGuessId(sale, purchases);
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (!purchase) { setErr('Choisis d\'abord l\'article correspondant.'); return; }
    setBusy(sale.id); setErr('');
    try {
      // Le modèle Shein (Rafferiza, Unadoll...) se glisse en tête du titre — retouchable ensuite.
      const article = purchase.model ? `${purchase.model} — ${sale.article}` : sale.article;
      const saleRow = {
        id: crypto.randomUUID(), user_id: userId, date: sale.date,
        article, category: 'Autre', size: purchase.size || sale.size,
        purchase_price: purchase.purchasePrice, sale_price: sale.salePrice,
        shipping_cost: 0, booster_cost: 0, product_url: null,
      };
      const r1 = await supabase.from('sales').insert(saleRow).select();
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('purchases')
        .update(purchaseToDb({ ...purchase, status: 'vendu' }, userId)).eq('id', purchase.id);
      if (r2.error) throw r2.error;
      const r3 = await supabase.from('pending_sales')
        .update(pendingToDb({ ...sale, status: 'traite' }, userId)).eq('id', sale.id);
      if (r3.error) throw r3.error;
      onChange();
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de l\'enregistrement.');
    } finally { setBusy(null); }
  }

  // "Aucune" : on ignore cette vente détectée, tu la géreras à la main.
  async function ignoreSale(sale: PendingSale) {
    setBusy(sale.id); setErr('');
    try {
      const r = await supabase.from('pending_sales')
        .update(pendingToDb({ ...sale, status: 'ignore' }, userId)).eq('id', sale.id);
      if (r.error) throw r.error;
      onChange();
    } catch (e: any) { setErr(e?.message || 'Erreur.'); }
    finally { setBusy(null); }
  }

  async function loadSamples() {
    setSeeding(true); setErr('');
    try {
      const s = sampleData();
      const p1 = await supabase.from('purchases')
        .insert(s.purchases.map((p) => purchaseToDb({ ...p, id: crypto.randomUUID() }, userId)));
      if (p1.error) throw p1.error;
      const p2 = await supabase.from('pending_sales')
        .insert(s.pending.map((p) => pendingToDb({ ...p, id: crypto.randomUUID() }, userId)));
      if (p2.error) throw p2.error;
      onChange();
    } catch (e: any) { setErr(e?.message || 'Erreur au chargement des exemples.'); }
    finally { setSeeding(false); }
  }

  // Rien à réviser : proposer le chargement des exemples si la base est vide.
  if (waiting.length === 0) {
    if (purchases.length === 0 && pendingSales.length === 0) {
      return (
        <div className="mb-6 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center gap-2.5 text-sm text-white/70">
            <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
            <span>Teste l'auto-import avec tes vrais mails déjà extraits (4 achats Shein + 1 vente Vinted).</span>
          </div>
          <button onClick={loadSamples} disabled={seeding}
            className="shrink-0 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}>
            {seeding ? 'Chargement…' : 'Charger mes exemples'}
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}>
      <div className="px-4 sm:px-5 py-3 flex items-center gap-2"
        style={{ background: 'rgba(99,102,241,0.12)' }}>
        <Sparkles className="w-4 h-4 text-indigo-300" />
        <span className="text-sm font-bold text-white">
          {waiting.length} vente{waiting.length > 1 ? 's' : ''} détectée{waiting.length > 1 ? 's' : ''} — relie à ton stock
        </span>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {err && <p className="text-xs text-red-300 px-1">{err}</p>}
        {waiting.map((sale) => {
          const candidates = rankCandidates(sale, purchases);
          const selected = chosen[sale.id] ?? bestGuessId(sale, purchases);
          return (
            <div key={sale.id} className="p-3 sm:p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* La vente */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>VENDU</span>
                <span className="text-sm font-bold text-white">{sale.article}</span>
                {sale.size && <span className="text-xs text-white/50">taille {sale.size}</span>}
                {sale.color && <span className="text-xs text-white/40">· {sale.color}</span>}
                <span className="text-sm font-bold text-emerald-300 ml-auto">{money(sale.salePrice)}</span>
              </div>

              {/* Choix de l'achat correspondant */}
              {candidates.length === 0 ? (
                <p className="text-xs text-white/40 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Aucun article en stock — ajoute la vente à la main.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-white/30 shrink-0" />
                  <select value={selected} onChange={(e) => pick(sale.id, e.target.value)}
                    className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <option value="" style={{ background: '#1e1b2e' }}>— choisir l'article acheté —</option>
                    {candidates.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: '#1e1b2e' }}>
                        {p.model ? `[${p.model}] ` : ''}{p.article} · {p.size || '?'} · {p.color} · payé {money(p.purchasePrice)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Aperçu du bénéfice */}
              {selected && (() => {
                const p = purchases.find((x) => x.id === selected);
                if (!p) return null;
                const profit = sale.salePrice - p.purchasePrice;
                return (
                  <p className="text-xs text-white/50 mt-2 pl-6">
                    Bénéfice estimé : <span className="font-bold text-white">{money(profit)}</span>
                    <span className="text-white/30"> ({money(sale.salePrice)} − {money(p.purchasePrice)})</span>
                  </p>
                );
              })()}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => confirm(sale)} disabled={!selected || busy === sale.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm text-white transition-all active:scale-[0.97] disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                  <Check className="w-4 h-4" /> {busy === sale.id ? '…' : 'Confirmer'}
                </button>
                <button onClick={() => ignoreSale(sale)} disabled={busy === sale.id}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm text-white/50 hover:text-white/80 transition-all disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <X className="w-3.5 h-3.5" /> Aucune
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
