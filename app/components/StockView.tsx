'use client';
import { useState } from 'react';
import { Package, Trash2, EyeOff, Boxes, Plus, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Purchase, purchaseToDb, sheinLink, ageDays, isStale, STALE_DAYS } from '../lib/stock';
import { Pill } from './ui';
import { ListingButton } from './AiTools';

export type StockFilter = 'stock'|'vendu'|'vieux';

interface Props {
  userId: string;
  purchases: Purchase[];
  onChange: () => void;
  filter: StockFilter;
  setFilter: (f: StockFilter) => void;
}

const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
const toNum = (v: string) => Number(v.replace(',', '.')) || 0;
const inputCls = 'text-base sm:text-sm rounded-lg px-3 py-2 min-h-[44px] text-white outline-none min-w-0 w-full';
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' };

const EMPTY_FORM = { article: '', size: '', color: '', price: '', sheinUrl: '' };

export default function StockView({ userId, purchases, onChange, filter, setFilter }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ price: '', sheinUrl: '' });
  const now = new Date().toISOString().slice(0, 10);
  const inStock = purchases.filter((p) => p.status === 'en_stock');
  const total = inStock.reduce((s, p) => s + p.purchasePrice, 0);
  const stale = inStock.filter((p) => isStale(p, now));
  const sold = purchases.filter((p) => p.status === 'vendu');
  const stock = filter === 'vendu' ? sold : filter === 'vieux' ? stale : inStock;

  async function ignore(p: Purchase) {
    setBusy(p.id);
    await supabase.from('purchases').update({ status: 'ignore' }).eq('id', p.id);
    setBusy(null); onChange();
  }
  async function remove(p: Purchase) {
    setBusy(p.id);
    await supabase.from('purchases').delete().eq('id', p.id);
    setBusy(null); onChange();
  }

  // Saisie manuelle d'un achat (hors mail Shein) : prix d'achat + lien Shein facultatif.
  async function addPurchase() {
    if (!form.article.trim()) { setErr('Indique au moins le nom de l\'article.'); return; }
    setBusy('new'); setErr('');
    const row = purchaseToDb({
      id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), article: form.article.trim(),
      model: '', color: form.color.trim(), size: form.size.trim(), purchasePrice: toNum(form.price),
      sku: '', orderNumber: '', status: 'en_stock', sheinUrl: form.sheinUrl.trim(),
    }, userId);
    const r = await supabase.from('purchases').insert(row);
    setBusy(null);
    if (r.error) { setErr(r.error.message); return; }
    setForm(EMPTY_FORM); setAdding(false); onChange();
  }

  async function saveEdit(p: Purchase) {
    setBusy(p.id); setErr('');
    const r = await supabase.from('purchases')
      .update({ purchase_price: toNum(edit.price), shein_url: edit.sheinUrl.trim() || null }).eq('id', p.id);
    setBusy(null);
    if (r.error) { setErr(r.error.message); return; }
    setEditId(null); onChange();
  }

  const addForm = (
    <div className="mb-5">
      {!adding ? (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-sm font-semibold text-white/70 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Plus className="w-4 h-4" /> Ajouter un achat à la main
        </button>
      ) : (
        <div className="p-3 rounded-xl grid grid-cols-2 sm:grid-cols-6 gap-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <input className={`${inputCls} col-span-2`} style={inputStyle} placeholder="Article"
            value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="Taille"
            value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="Couleur"
            value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="Prix d'achat €" inputMode="decimal"
            value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="Coller le lien produit Shein"
            value={form.sheinUrl} onChange={(e) => setForm({ ...form, sheinUrl: e.target.value })} />
          <div className="col-span-2 sm:col-span-6 flex gap-2">
            <button onClick={addPurchase} disabled={busy === 'new'}
              className="px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              {busy === 'new' ? '…' : 'Ajouter'}
            </button>
            <button onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
              className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-white/50 hover:text-white/80">Annuler</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
    </div>
  );

  const chips = (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-4">
      <Pill active={filter === 'stock'} onClick={() => setFilter('stock')}>En stock ({inStock.length})</Pill>
      <Pill active={filter === 'vendu'} onClick={() => setFilter('vendu')}>Vendus ({sold.length})</Pill>
      <Pill active={filter === 'vieux'} onClick={() => setFilter('vieux')}>Invendus &gt; {STALE_DAYS} j ({stale.length})</Pill>
    </div>
  );

  if (stock.length === 0) {
    return (
      <div>
        {addForm}
        {chips}
        <div className="py-16 text-center">
          <Boxes className="w-10 h-10 mx-auto text-white/55 mb-3" />
          <p className="text-white/60 text-sm">{filter === 'stock' ? 'Aucun article en stock.' : filter === 'vendu' ? 'Aucun article vendu.' : `Aucun article en stock depuis plus de ${STALE_DAYS} jours.`}</p>
          {filter === 'stock' && <p className="text-white/55 text-xs mt-1">Les commandes Shein détectées apparaîtront ici en attendant d'être vendues.</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-md min-w-0">
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">En stock</p>
          <p className="text-2xl font-bold text-white mt-1">{inStock.length}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">Argent immobilisé</p>
          <p className="text-2xl font-bold text-white mt-1">{money(total)}</p>
        </div>
      </div>

      {addForm}
      {chips}

      <div className="space-y-2.5">
        {stock.map((p) => (
          <div key={p.id} className="p-3 sm:p-4 rounded-xl flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer"
                className="w-14 h-20 object-cover rounded-lg shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(99,102,241,0.15)' }}>
                <Package className="w-4 h-4 text-indigo-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {p.model && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: 'rgba(139,92,246,0.18)', color: '#c4b5fd' }}>{p.model}</span>
                )}
                <p className="text-sm font-semibold text-white truncate">{p.article}</p>
                {(() => { const l = sheinLink(p); return l && (
                  <a href={l.url} target="_blank" rel="noopener noreferrer"
                    title={l.kind === 'order' ? 'Voir la commande Shein (lien produit non renseigné)' : 'Voir sur Shein'}
                    className="flex items-center gap-1 text-xs text-indigo-300/80 hover:text-indigo-200 shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />{l.kind === 'order' ? 'Commande' : 'Voir sur Shein'}
                  </a>
                ); })()}
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                {p.size && <>taille {p.size} · </>}{p.color && <>{p.color} · </>}acheté le {p.date}
                {p.status === 'en_stock' && (() => { const d = ageDays(p.date, now); const c = d > STALE_DAYS ? '#fca5a5' : d > 30 ? '#fcd34d' : '#6ee7b7'; return <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: c + '22', color: c }}>{d} j</span>; })()}
              </p>
              {p.sku && <p className="text-xs text-white/55 mt-0.5 font-mono">SKU {p.sku}{p.orderNumber && <> · commande {p.orderNumber}</>}</p>}
              {editId === p.id && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input className={`${inputCls} !w-28`} style={inputStyle} placeholder="Prix €" inputMode="decimal"
                    value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <input className={`${inputCls} flex-1 basis-40`} style={inputStyle} placeholder="Coller le lien produit Shein"
                    value={edit.sheinUrl} onChange={(e) => setEdit({ ...edit, sheinUrl: e.target.value })} />
                  <button onClick={() => saveEdit(p)} disabled={busy === p.id} title="Enregistrer"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-emerald-300" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditId(null)} title="Annuler"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/60" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <span className="text-sm font-bold text-white/80">{money(p.purchasePrice)}</span>
            {p.status === 'en_stock' && <div className="flex items-center gap-1.5 ml-auto">
              <ListingButton purchaseId={p.id} />
              <button onClick={() => { setEditId(p.id); setEdit({ price: String(p.purchasePrice), sheinUrl: p.sheinUrl || '' }); }}
                disabled={busy === p.id} title="Modifier le prix / le lien Shein"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/55 hover:text-white/70 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => ignore(p)} disabled={busy === p.id} title="Pas pour la revente"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/55 hover:text-white/70 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(p)} disabled={busy === p.id} title="Supprimer"
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/55 hover:text-red-300 transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
