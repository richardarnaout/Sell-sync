'use client';
import { useState } from 'react';
import { Package, Trash2, EyeOff, Boxes, Plus, Pencil, ExternalLink, Check, X, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Purchase, purchaseToDb, sheinLink, ageDays, isStale, STALE_DAYS } from '../lib/stock';
import { Sale, saleToDb } from '../lib/sales';
import {
  splitStock, immobilized, parsePrice, validDate, localToday, articleSaleId, articleMargin, checkPhotoUrl,
  sellArticle, updateArticleSale, cancelArticleSale,
} from '../lib/sellArticle';
import { Field, Pill, Thumb, Button, Card, Badge } from './ui';
import { ListingButton } from './AiTools';

export type StockFilter = 'stock'|'vendu'|'vieux';

interface Props {
  userId: string;
  purchases: Purchase[];
  sales: Sale[];
  onChange: () => void;
  filter: StockFilter;
  setFilter: (f: StockFilter) => void;
}

const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
const signed = (n: number) => (n >= 0 ? '+' : '') + money(n);
const toNum = (v: string) => Number(v.replace(',', '.')) || 0;
const inputCls = 'text-base sm:text-sm rounded-lg px-3 py-2 min-h-[44px] text-white outline-none min-w-0 w-full';
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' };
const iconBtn = 'p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/55 hover:text-white/70 transition-all';

const EMPTY_FORM = { article: '', size: '', color: '', price: '', sheinUrl: '', photoUrl: '' };

// T-034.3 : plus de liaison avec les mails Vinted. Chaque article en stock a sa saisie « Prix de vente Vinted » ;
// « Enregistrer » crée la vente rattachée à l'article et le sort du stock. Vendus : modifier le prix ou annuler.
export default function StockView({ userId, purchases, sales, onChange, filter, setFilter }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [rowErr, setRowErr] = useState<{ id: string; msg: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ price: '', sheinUrl: '', photoUrl: '' });
  const [sell, setSell] = useState<Record<string, { price: string; date: string }>>({});
  const [saleEditId, setSaleEditId] = useState<string | null>(null);
  const now = localToday();
  const { inStock, sold } = splitStock(purchases, sales);
  const total = immobilized(inStock);
  const stale = inStock.filter((p) => isStale(p, now));
  const stock = filter === 'vendu' ? sold : filter === 'vieux' ? stale : inStock;
  const saleOf = (p: Purchase) => sales.find((s) => s.id === articleSaleId(p.id));
  const sellState = (id: string) => sell[id] ?? { price: '', date: now };
  const setSellState = (id: string, v: Partial<{ price: string; date: string }>) => {
    setSell((m) => ({ ...m, [id]: { ...(m[id] ?? { price: '', date: now }), ...v } }));
    setRowErr((e) => (e?.id === id ? null : e));
  };
  const fail = (id: string, msg: string) => setRowErr({ id, msg });

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

  // Saisie du prix de vente Vinted → vente rattachée à l'article (double clic sans doublon : même id de vente).
  async function saveSale(p: Purchase) {
    if (busy) return;
    const st = sellState(p.id);
    const price = parsePrice(st.price);
    if (price === null) { fail(p.id, 'Prix de vente invalide : un nombre supérieur à 0 (virgule ou point).'); return; }
    if (!validDate(st.date)) { fail(p.id, 'Date de vente invalide.'); return; }
    setBusy(p.id); setRowErr(null);
    const r = await sellArticle(supabase, userId, p, price, st.date, saleToDb);
    setBusy(null);
    if (!r.ok) { fail(p.id, r.error); return; }
    setSell((m) => { const n = { ...m }; delete n[p.id]; return n; });
    if (r.warning) fail(p.id, r.warning);
    onChange();
  }

  async function saveSaleEdit(p: Purchase) {
    if (busy) return;
    const st = sellState(p.id);
    const price = parsePrice(st.price);
    if (price === null) { fail(p.id, 'Prix de vente invalide : un nombre supérieur à 0 (virgule ou point).'); return; }
    if (!validDate(st.date)) { fail(p.id, 'Date de vente invalide.'); return; }
    setBusy(p.id); setRowErr(null);
    const r = await updateArticleSale(supabase, p.id, price, st.date);
    setBusy(null);
    if (!r.ok) { fail(p.id, r.error); return; }
    setSaleEditId(null); onChange();
  }

  async function cancelSale(p: Purchase) {
    if (busy) return;
    if (!confirm('Annuler cette vente ? L’article revient en stock et la vente est retirée.')) return;
    setBusy(p.id); setRowErr(null);
    const r = await cancelArticleSale(supabase, p.id);
    setBusy(null);
    if (!r.ok) { fail(p.id, r.error); return; }
    onChange();
  }

  // Saisie manuelle d'un achat (hors mail Shein) : prix d'achat, lien Shein et lien de photo facultatifs.
  async function addPurchase() {
    if (!form.article.trim()) { setErr('Indique au moins le nom de l\'article.'); return; }
    const photo = checkPhotoUrl(form.photoUrl);
    if (!photo.ok) { setErr(photo.error); return; }
    setBusy('new'); setErr('');
    const row = purchaseToDb({
      id: crypto.randomUUID(), date: now, article: form.article.trim(),
      model: '', color: form.color.trim(), size: form.size.trim(), purchasePrice: toNum(form.price),
      sku: '', orderNumber: '', status: 'en_stock', sheinUrl: form.sheinUrl.trim(), photoUrl: photo.url,
    }, userId);
    const r = await supabase.from('purchases').insert(row);
    setBusy(null);
    if (r.error) { setErr(r.error.message); return; }
    setForm(EMPTY_FORM); setAdding(false); onChange();
  }

  async function saveEdit(p: Purchase) {
    // Photo : n'est revérifiée et réécrite que si Khaled l'a changée (la photo importée reste telle quelle sinon).
    const photoChanged = edit.photoUrl.trim() !== (p.photoUrl || '');
    const photo = photoChanged ? checkPhotoUrl(edit.photoUrl) : { ok: true as const, url: p.photoUrl || '' };
    if (!photo.ok) { fail(p.id, photo.error); return; }
    setBusy(p.id); setRowErr(null);
    const r = await supabase.from('purchases')
      .update({ purchase_price: toNum(edit.price), shein_url: edit.sheinUrl.trim() || null, ...(photoChanged ? { photo_url: photo.url || null } : {}) })
      .eq('id', p.id);
    setBusy(null);
    if (r.error) { fail(p.id, r.error.message); return; }
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
          <Field label="Article" className="col-span-2"><input className={`${inputCls} col-span-2`} style={inputStyle} placeholder="Article"
            value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} /></Field>
          <Field label="Taille"><input className={inputCls} style={inputStyle} placeholder="Taille"
            value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></Field>
          <Field label="Couleur"><input className={inputCls} style={inputStyle} placeholder="Couleur"
            value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Field label="Prix d'achat (€)"><input className={inputCls} style={inputStyle} placeholder="Prix d'achat €" inputMode="decimal"
            value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Lien produit Shein"><input className={inputCls} style={inputStyle} placeholder="Coller le lien produit Shein"
            value={form.sheinUrl} onChange={(e) => setForm({ ...form, sheinUrl: e.target.value })} /></Field>
          <Field label="Photo (facultatif)" className="col-span-2 sm:col-span-6"><input className={`${inputCls} `} style={inputStyle} inputMode="url"
            placeholder="Lien de la photo (facultatif) : https://img.ltwebstatic.com/…" aria-label="Lien de la photo"
            value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} /></Field>
          <div className="col-span-2 sm:col-span-6 flex gap-2">
            <button onClick={addPurchase} disabled={busy === 'new'}
              className="px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              {busy === 'new' ? '…' : 'Ajouter'}
            </button>
            <button onClick={() => { setAdding(false); setForm(EMPTY_FORM); setErr(''); }}
              className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-white/50 hover:text-white/80">Annuler</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-300 mt-2" role="alert">{err}</p>}
    </div>
  );

  const chips = (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-4">
      <Pill active={filter === 'stock'} onClick={() => setFilter('stock')}>En stock ({inStock.length})</Pill>
      <Pill active={filter === 'vendu'} onClick={() => setFilter('vendu')}>Vendus ({sold.length})</Pill>
      <Pill active={filter === 'vieux'} onClick={() => setFilter('vieux')}>Invendus &gt; {STALE_DAYS} j ({stale.length})</Pill>
    </div>
  );

  // Saisie du prix (article en stock) ou du nouveau prix (vente à modifier).
  const priceForm = (p: Purchase, mode: 'sell' | 'edit') => {
    const st = sellState(p.id);
    const price = parsePrice(st.price);
    return (
      <div className="grid grid-cols-2 sm:flex gap-2 mt-2 sm:flex-wrap items-center" data-sale-form={p.id}>
        <input className={`${inputCls} !w-full sm:!w-36`} style={inputStyle} inputMode="decimal" enterKeyHint="done"
          placeholder="Prix de vente €" aria-label={`Prix de vente Vinted de ${p.article}`}
          value={st.price} onChange={(e) => setSellState(p.id, { price: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') (mode === 'sell' ? saveSale(p) : saveSaleEdit(p)); }} />
        <input type="date" className={`${inputCls} !w-full sm:!w-40`} style={inputStyle} aria-label="Date de vente"
          value={st.date} max={now} onChange={(e) => setSellState(p.id, { date: e.target.value })} />
        <Button variant="success" onClick={() => (mode === 'sell' ? saveSale(p) : saveSaleEdit(p))} disabled={busy === p.id}
          className="col-span-2 w-full sm:w-auto">
          {busy === p.id ? '…' : 'Enregistrer'}
        </Button>
        {mode === 'edit' && (
          <button onClick={() => { setSaleEditId(null); setRowErr(null); }}
            className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-white/50 hover:text-white/80">Annuler</button>
        )}
        {price !== null && (
          <span className="text-xs font-semibold" style={{ color: articleMargin(price, p.purchasePrice) >= 0 ? '#6ee7b7' : '#fca5a5' }}>
            marge {signed(articleMargin(price, p.purchasePrice))}
          </span>
        )}
      </div>
    );
  };

  if (stock.length === 0) {
    return (
      <div>
        {addForm}
        {chips}
        <div className="py-16 text-center">
          <Boxes className="w-10 h-10 mx-auto text-white/55 mb-3" />
          <p className="text-white/60 text-sm">{filter === 'stock' ? 'Aucun article en stock.' : filter === 'vendu' ? 'Aucun article vendu.' : `Aucun article en stock depuis plus de ${STALE_DAYS} jours.`}</p>
          {filter === 'stock' && <p className="text-white/55 text-xs mt-1">Les commandes Shein détectées apparaîtront ici ; tu saisiras leur prix de vente Vinted quand elles partent.</p>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-md min-w-0">
        <Card className="p-4" style={inStock.length ? { borderColor: 'rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.10)' } : undefined}>
          <p className="text-xs uppercase tracking-wide text-white/60 font-semibold">Prix à saisir</p>
          <p className="text-3xl font-bold mt-1" style={{ color: inStock.length ? '#a5b4fc' : '#fff' }}>{inStock.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">Argent immobilisé</p>
          <p className="text-2xl font-bold text-white mt-1">{money(total)}</p>
        </Card>
      </div>

      {addForm}
      {chips}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5 items-start">
        {stock.map((p) => {
          const isSold = filter === 'vendu';
          const s = isSold ? saleOf(p) : undefined;
          return (
          <Card key={p.id} className="p-3 sm:p-4 flex items-start gap-3 flex-wrap">
            <Thumb src={p.photoUrl} name={p.article} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {p.model && (
                  <Badge>{p.model}</Badge>
                )}
                <p className="text-sm font-semibold text-white truncate">{p.article}</p>
                {(() => { const l = sheinLink(p); return l && (
                  <a href={l.url} target="_blank" rel="noopener noreferrer"
                    title={l.kind === 'order' ? 'Voir la commande Shein (lien produit non renseigné)' : 'Voir sur Shein'}
                    className="flex items-center gap-1 min-h-[44px] text-xs text-indigo-300/80 hover:text-indigo-200 shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />{l.kind === 'order' ? 'Commande' : 'Voir sur Shein'}
                  </a>
                ); })()}
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                {p.size && <>taille {p.size} · </>}{p.color && <>{p.color} · </>}acheté le {p.date}
                {!isSold && (() => { const d = ageDays(p.date, now); const c = d > STALE_DAYS ? '#fca5a5' : d > 30 ? '#fcd34d' : '#6ee7b7'; return <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: c + '22', color: c }}>{d} j</span>; })()}
              </p>
              {p.sku && <p className="text-xs text-white/55 mt-0.5 font-mono">SKU {p.sku}{p.orderNumber && <> · commande {p.orderNumber}</>}</p>}
              {isSold && (s ? (
                <p className="text-xs text-white/70 mt-1">
                  Vendu <b className="text-white">{money(s.salePrice)}</b> le {s.date} · marge{' '}
                  <b style={{ color: articleMargin(s.salePrice, p.purchasePrice) >= 0 ? '#6ee7b7' : '#fca5a5' }}>{signed(articleMargin(s.salePrice, p.purchasePrice))}</b>
                </p>
              ) : (
                <p className="text-xs text-white/55 mt-1">Vendu via l’ancienne liaison : prix et marge dans l’onglet Ventes.</p>
              ))}
            </div>
            <span className="text-sm font-bold text-white/80" title="Prix d'achat">{money(p.purchasePrice)}</span>
            <div className="w-full basis-full min-w-0 empty:hidden">
              {!isSold && editId !== p.id && priceForm(p, 'sell')}
              {isSold && s && saleEditId === p.id && priceForm(p, 'edit')}
              {editId === p.id && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input className={`${inputCls} !w-28`} style={inputStyle} placeholder="Prix d'achat €" inputMode="decimal" aria-label="Prix d'achat"
                    value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                  <input className={`${inputCls} flex-1 basis-40`} style={inputStyle} placeholder="Coller le lien produit Shein"
                    value={edit.sheinUrl} onChange={(e) => setEdit({ ...edit, sheinUrl: e.target.value })} />
                  <input className={`${inputCls} basis-full`} style={inputStyle} inputMode="url" aria-label="Lien de la photo"
                    placeholder="Lien de la photo : https://img.ltwebstatic.com/…"
                    value={edit.photoUrl} onChange={(e) => setEdit({ ...edit, photoUrl: e.target.value })} />
                  <button onClick={() => saveEdit(p)} disabled={busy === p.id} title="Enregistrer"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-emerald-300" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setEditId(null); setRowErr(null); }} title="Annuler"
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/60" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {rowErr?.id === p.id && <p className="text-xs text-red-300 mt-2" role="alert">{rowErr.msg}</p>}
            </div>
            {!isSold && <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-end">
              <ListingButton purchaseId={p.id} />
              <button onClick={() => { setEditId(p.id); setRowErr(null); setEdit({ price: String(p.purchasePrice), sheinUrl: p.sheinUrl || '', photoUrl: p.photoUrl || '' }); }}
                disabled={busy === p.id} title="Modifier le prix d'achat, le lien Shein ou la photo"
                className={iconBtn} style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => ignore(p)} disabled={busy === p.id} title="Pas pour la revente"
                className={iconBtn} style={{ background: 'rgba(255,255,255,0.04)' }}>
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(p)} disabled={busy === p.id} title="Supprimer"
                className={`${iconBtn} hover:!text-red-300`} style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>}
            {isSold && s && saleEditId !== p.id && <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-end">
              <button onClick={() => { setSaleEditId(p.id); setRowErr(null); setSellState(p.id, { price: String(s.salePrice).replace('.', ','), date: s.date }); }}
                disabled={busy === p.id} title="Modifier le prix de vente"
                className={iconBtn} style={{ background: 'rgba(255,255,255,0.04)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => cancelSale(p)} disabled={busy === p.id} title="Annuler la vente (l'article revient en stock)"
                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold text-amber-200 disabled:opacity-60"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <Undo2 className="w-3.5 h-3.5" /> Annuler la vente
              </button>
            </div>}
          </Card>
          );
        })}
      </div>
    </div>
  );
}
