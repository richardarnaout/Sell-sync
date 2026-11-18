'use client';
import { useState } from 'react';
import { Sparkles, X, Package, Clock, Link2, ExternalLink, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import {
  Purchase, PendingSale, validerVente, rankCandidates, sameSizeStock, sheinLink, bestGuessId,
} from '../lib/stock';
import MailsAVerifier from './MailsAVerifier';

interface Props {
  userId: string;
  purchases: Purchase[];
  pendingSales: PendingSale[];
  onChange: () => void; // recharge stock + ventes en attente + ventes dans page.tsx
}

const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

export default function ReviewQueue({ userId, purchases, pendingSales, onChange }: Props) {
  const waiting = pendingSales.filter((s) => s.status === 'en_attente');
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  // 1 clic sur un article du stock : UN seul appel SQL (valider_vente) crée la vente, sort l'article
  // du stock et clôt la vente en attente — tout ou rien. Bénéfice = prix de vente − prix d'achat.
  async function confirm(sale: PendingSale, purchaseId: string) {
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (!purchase) { setErr('Choisis d\'abord l\'article correspondant.'); return; }
    setBusy(sale.id); setErr('');
    try {
      // Le modèle Shein (Rafferiza, Unadoll...) se glisse en tête du titre — retouchable ensuite.
      const article = purchase.model ? `${purchase.model} — ${sale.article}` : sale.article;
      await validerVente(sale.id, purchase.id, article, purchase.sheinUrl);
      onChange();
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de l\'enregistrement.');
    } finally { setBusy(null); }
  }

  // "Aucune" : on ignore cette vente détectée, tu la géreras à la main.
  async function ignoreSale(sale: PendingSale) {
    setBusy(sale.id); setErr('');
    try {
      const r = await supabase.from('pending_sales').update({ status: 'ignore' }).eq('id', sale.id);
      if (r.error) throw r.error;
      onChange();
    } catch (e: any) { setErr(e?.message || 'Erreur.'); }
    finally { setBusy(null); }
  }

  // Croix ✕ : cet achat ne correspond pas → il ne revient plus pour cette vente (stocké en base).
  async function setRejected(sale: PendingSale, ids: string[]) {
    setBusy(sale.id); setErr('');
    try {
      const r = await supabase.from('pending_sales').update({ rejected_purchase_ids: ids }).eq('id', sale.id);
      if (r.error) throw r.error;
      onChange();
    } catch (e: any) {
      setErr(/rejected_purchase_ids/.test(e?.message || '')
        ? "Lance d'abord supabase/suggestions-ecartees.sql dans Supabase." : (e?.message || 'Erreur.'));
    } finally { setBusy(null); }
  }

  // Les mails non reconnus s'affichent toujours, même sans vente à relier.
  const mailsAVerifier = <MailsAVerifier userId={userId} refreshKey={pendingSales} />;
  if (waiting.length === 0) return <div className="empty:hidden">{mailsAVerifier}</div>;

  return (
    <div className="space-y-4">
    {mailsAVerifier}
    <div className="rounded-2xl overflow-hidden"
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
          const rejected = sale.rejectedPurchaseIds || [];
          const visible = purchases.filter((p) => !rejected.includes(p.id));
          const same = sameSizeStock(sale, visible);
          const all = rankCandidates(sale, visible);
          const candidates = showAll[sale.id] || same.length === 0 ? all : same;
          const hiddenCount = all.length - candidates.length;
          return (
            <div key={sale.id} className="p-3 sm:p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* La vente */}
              <div className="flex items-center gap-2 flex-wrap mb-3 min-w-0 break-words">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>VENDU</span>
                <span className="text-sm font-bold text-white">{sale.article}</span>
                {sale.size && <span className="text-xs text-white/50">taille {sale.size}</span>}
                {sale.color && <span className="text-xs text-white/40">· {sale.color}</span>}
                <span className="text-xs text-white/40 flex items-center gap-1">
                  · le {sale.date}
                  {sale.dateApprox && (
                    <span title="Mail « Ton article s'est vendu » non trouvé : date de la transaction finalisée"
                      className="flex items-center gap-0.5 text-amber-300/80"><Clock className="w-3 h-3" /> date approx.</span>
                  )}
                </span>
                <span className="text-sm font-bold text-emerald-300 ml-auto">{money(sale.salePrice)}</span>
              </div>

              {/* Articles du stock : 1 clic pour relier */}
              {candidates.length === 0 ? (
                <p className="text-xs text-white/40 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> {(sale.rejectedPurchaseIds?.length || 0) > 0 ? 'Plus de suggestion — rouvre les suggestions écartées ci-dessous.' : 'Aucun article en stock — ajoute la vente à la main.'}
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-white/40 mb-2">
                    {same.length > 0 && !showAll[sale.id]
                      ? `Stock en taille ${sale.size} — quel article as-tu vendu ?`
                      : "Tout le stock — quel article as-tu vendu ?"}
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {candidates.map((p) => {
                      const profit = sale.salePrice - p.purchasePrice;
                      const link = sheinLink(p);
                      const best = bestGuessId(sale, visible) === p.id;
                      return (
                        <div key={p.id} className="flex items-start gap-3 p-2 rounded-lg min-w-0"
                          style={{ background: 'rgba(255,255,255,0.04)', border: best ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(255,255,255,0.08)' }}>
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photoUrl} alt={p.article} loading="lazy" referrerPolicy="no-referrer"
                              className="w-16 h-24 object-cover rounded-md shrink-0" />
                          ) : (
                            <div className="w-16 h-24 rounded-md flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(99,102,241,0.15)' }}>
                              <Package className="w-4 h-4 text-indigo-300" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1 relative">
                            <button onClick={() => setRejected(sale, [...rejected, p.id])} disabled={busy === sale.id}
                              title="Ce n'est pas cet article : ne plus me le proposer pour cette vente" aria-label="Écarter cette suggestion"
                              className="absolute -top-1 -right-1 w-11 h-11 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 disabled:opacity-40">
                              <X className="w-4 h-4" />
                            </button>
                            {best && <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide mb-0.5">Meilleure correspondance</p>}
                            <p className="text-sm font-semibold text-white line-clamp-2 break-words pr-10">
                              {p.model ? `[${p.model}] ` : ''}{p.article}
                            </p>
                            <p className="text-[11px] text-white/40 mt-0.5">
                              {p.size || '?'}{p.color ? ` · ${p.color}` : ''} · payé {money(p.purchasePrice)}
                            </p>
                            <p className="text-[11px] text-white/50 mt-0.5">
                              Bénéfice : <span className={`font-bold ${profit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(profit)}</span>
                            </p>
                            <div className="flex items-center gap-2 flex-wrap mt-2">
                              <button onClick={() => confirm(sale, p.id)} disabled={busy === sale.id}
                                title="Relier cette vente à cet article"
                                className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg font-bold text-sm text-white active:scale-[0.97] transition-all disabled:opacity-40"
                                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                                <Link2 className="w-3.5 h-3.5" /> Relier
                              </button>
                              {link ? (
                                <a href={link.url} target="_blank" rel="noopener noreferrer"
                                  title={link.kind === 'order' ? 'Le mail ne contient pas le lien produit : ouvre la commande Shein' : 'Ouvrir la fiche Shein'}
                                  className="flex items-center gap-1 px-2 min-h-[44px] text-xs font-semibold text-indigo-300 hover:text-indigo-200">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  {link.kind === 'order' ? 'Voir la commande Shein' : 'Voir sur Shein'}
                                </a>
                              ) : (
                                <span className="text-[11px] text-white/30">Pas de lien Shein : à coller dans Stock</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hiddenCount > 0 && (
                    <button onClick={() => setShowAll((v) => ({ ...v, [sale.id]: true }))}
                      className="text-xs text-indigo-300 hover:text-indigo-200 mt-2 min-h-[44px] px-1">
                      Voir aussi les {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} article{hiddenCount > 1 ? 's' : ''} du stock
                    </button>
                  )}
                </>
              )}

              {rejected.length > 0 && (
                <button onClick={() => setRejected(sale, [])} disabled={busy === sale.id}
                  className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 mt-2 min-h-[44px] px-1 disabled:opacity-40">
                  <Undo2 className="w-3.5 h-3.5" /> Voir les suggestions écartées ({rejected.length})
                </button>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => ignoreSale(sale)} disabled={busy === sale.id}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg font-semibold text-sm text-white/50 hover:text-white/80 transition-all disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <X className="w-3.5 h-3.5" /> Aucun de ces articles
                </button>
                {busy === sale.id && <span className="text-xs text-white/40">Enregistrement…</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
