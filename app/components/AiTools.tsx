'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button, Card } from './ui';
import { Sparkles, Wand2, Tag, Copy, Check, Loader2, Euro, Moon } from 'lucide-react';

// Forme minimale d'une vente (structurellement compatible avec l'app).
export interface SaleLike {
  date: string;
  article: string;
  category: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  shippingCost: number;
  boosterCost: number;
}

const CATEGORIES = ['Hauts', 'Bas', 'Robes', 'Manteaux', 'Chaussures', 'Accessoires', 'Sport', 'Autre'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46', 'Unique'];
const CONDITIONS = ['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'Satisfaisant'];

const inputCls =
  'w-full rounded-xl px-3 py-2 min-h-[44px] text-base sm:text-sm text-white bg-white/5 border border-white/10 ' +
  'focus:outline-none focus:border-indigo-400/60 placeholder:text-white/55';

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  // T-034.1 : mode démo (hors production) = réponses fictives, aucun appel serveur ni IA.
  // Condition en toutes lettres : éliminée du build de production (voir lib/demo/flag.ts).
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO === '1') {
    return (await import('../lib/demo/ai')).demoAi(url, body) as Promise<T>;
  }
  // Coupe-circuit : évite une UI bloquée si la fonction serveur traîne (> maxDuration).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 75000);
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error('Connecte-toi pour utiliser les outils IA.');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Session expirée : reconnecte-toi puis réessaie.');
    if (res.status === 429 || data?.error === 'quota') throw new Error('Limite de 30 appels IA atteinte aujourd’hui. Reviens demain.');
    if (res.status === 404) throw new Error('Cet outil IA n’est pas encore disponible sur le serveur.');
    if (res.status === 400 && typeof data?.error === 'string') throw new Error(data.error);
    if (!res.ok) throw new Error('L’IA est indisponible pour le moment. Réessaie dans un instant.');
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Délai dépassé — réessaie (le modèle a mis trop de temps à répondre).');
    }
    if (e instanceof TypeError) throw new Error('Connexion impossible. Vérifie ton réseau.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function CopyBtn({ text, id }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard indisponible */
        }
      }}
      className="shrink-0 inline-flex items-center gap-1 text-xs px-3 min-h-[44px] rounded-lg text-indigo-300/80 hover:text-indigo-300 hover:bg-indigo-500/10 transition"
      title="Copier"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  );
}

function SectionTitle({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <p className="text-sm font-bold text-white">{title}</p>
      {badge && (
        <span
          className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

interface PriceInfo { median: number; low: number; high: number; n: number; profit: number | null }
interface ListingResult { title: string; description: string; keywords: string[]; price: PriceInfo }
interface AnalystRow { article?: string; category?: string; size?: string; profit?: number; days?: number }
interface AnalystResult {
  totals: { count?: number; revenue?: number; profit?: number; margin?: number };
  best: AnalystRow[]; worst: AnalystRow[]; dormant: AnalystRow[]; comment: string;
}

const fmtEur = (n: number | null | undefined) => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
const box = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' };

function PriceBox({ p }: { p: PriceInfo }) {
  if (!p.n) return <p className="text-[13px] text-white/70">Pas encore de vente comparable pour cette catégorie : aucun prix conseillé.</p>;
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
      <div className="flex items-end gap-3 flex-wrap">
        <p className="text-3xl font-bold text-emerald-400">{fmtEur(p.median)}</p>
        <p className="text-xs text-white/60 mb-1">fourchette {fmtEur(p.low)} – {fmtEur(p.high)}</p>
      </div>
      <p className="text-[13px] text-white/70 mt-2">
        {p.profit != null && <>Bénéfice estimé <b className={p.profit >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmtEur(p.profit)}</b> · </>}
        d’après {p.n} vente{p.n > 1 ? 's' : ''} similaire{p.n > 1 ? 's' : ''}
      </p>
    </div>
  );
}

function Field({ label, text, children }: { label: string; text: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={box}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs uppercase tracking-wide text-white/55 font-semibold">{label}</p>
        <CopyBtn text={text} id={label} />
      </div>
      {children}
    </div>
  );
}

// Annonce d'un article du Stock (bouton « Créer l'annonce »).
export function ListingButton({ purchaseId }: { purchaseId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<ListingResult | null>(null);
  const [error, setError] = useState('');

  async function run() {
    setOpen(true); setLoading(true); setError(''); setRes(null);
    try { setRes(await postJSON<ListingResult>('/api/ai/listing', { purchase_id: purchaseId })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setLoading(false); }
  }

  return (
    <>
      <button type="button" onClick={run} disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold text-cyan-200 disabled:opacity-60"
        style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        Créer l’annonce
      </button>
      {open && (
        <div className="basis-full w-full space-y-2 mt-1">
          {loading && <p className="text-xs text-white/60">Rédaction de l’annonce…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {res && (
            <>
              <Field label="Titre" text={res.title}><p className="text-sm text-white font-semibold">{res.title}</p></Field>
              <Field label="Description" text={res.description}>
                <p className="text-[13px] text-white/75 whitespace-pre-wrap leading-relaxed">{res.description}</p>
              </Field>
              <Field label="Mots-clés" text={res.keywords.join(' ')}>
                <div className="flex flex-wrap gap-1.5">
                  {res.keywords.map((k, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.25)' }}>{k}</span>
                  ))}
                </div>
              </Field>
              {res.price && <PriceBox p={res.price} />}
            </>
          )}
          {!loading && <Button type="button" onClick={() => setOpen(false)}>Fermer</Button>}
        </div>
      )}
    </>
  );
}

function RowList({ rows, empty, right }: { rows: AnalystRow[]; empty: string; right: (r: AnalystRow) => string }) {
  if (!rows?.length) return <p className="text-xs text-white/55">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-[13px] text-white/80">
          <span className="min-w-0 truncate">{r.article || r.category || '—'}{r.size ? ` · ${r.size}` : ''}</span>
          <span className="shrink-0 font-semibold text-white">{right(r)}</span>
        </li>
      ))}
    </ul>
  );
}

// Analyse : bilan du mois + stock qui dort + prix conseillé (contrat T-031.2).
export default function AiTools({ month, hasSales }: { month: string | null; hasSales: boolean }) {
  const [anLoading, setAnLoading] = useState(false);
  const [an, setAn] = useState<AnalystResult | null>(null);
  const [anError, setAnError] = useState('');

  async function runAnalyst() {
    if (!month) return;
    setAnLoading(true); setAnError(''); setAn(null);
    try { setAn(await postJSON<AnalystResult>('/api/ai/analyst', { month })); }
    catch (e) { setAnError(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setAnLoading(false); }
  }

  const [pForm, setPForm] = useState({ category: 'Autre', size: '', purchasePrice: '' });
  const [pLoading, setPLoading] = useState(false);
  const [pResult, setPResult] = useState<PriceInfo | null>(null);
  const [pError, setPError] = useState('');

  async function runPrice() {
    setPLoading(true); setPError(''); setPResult(null);
    try {
      setPResult(await postJSON<PriceInfo>('/api/ai/price', {
        category: pForm.category, size: pForm.size,
        ...(pForm.purchasePrice ? { purchase_price: Number(pForm.purchasePrice.replace(',', '.')) } : {}),
      }));
    } catch (e) { setPError(e instanceof Error ? e.message : 'Erreur.'); }
    finally { setPLoading(false); }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={<Sparkles className="w-4 h-4 text-indigo-400" />} title="Bilan du mois" badge="IA" />
        <p className="text-xs text-white/55 mb-4 -mt-2">
          Chiffres calculés sur tes ventes, commentaire en 5 lignes : meilleures et pires ventes, stock qui dort.
        </p>
        <Button variant="primary" type="button" onClick={runAnalyst} disabled={anLoading || !hasSales || !month}
          >
          {anLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {anLoading ? 'Analyse en cours…' : 'Faire le bilan'}
        </Button>
        {!hasSales && <p className="text-xs text-white/55 mt-3">Ajoute quelques ventes pour activer le bilan.</p>}
        {anError && <p className="text-xs text-red-400 mt-3">{anError}</p>}
        {an && (
          <div className="mt-4 space-y-3">
            {an.comment && (
              <div className="rounded-xl p-4 text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>{an.comment}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={box}>
                <p className="text-xs uppercase tracking-wide text-white/55 font-semibold mb-2">Meilleures ventes</p>
                <RowList rows={an.best} empty="Rien à signaler." right={(r) => fmtEur(r.profit)} />
              </div>
              <div className="rounded-xl p-3" style={box}>
                <p className="text-xs uppercase tracking-wide text-white/55 font-semibold mb-2">Moins rentables</p>
                <RowList rows={an.worst} empty="Rien à signaler." right={(r) => fmtEur(r.profit)} />
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-amber-300 font-semibold mb-2">
                <Moon className="w-4 h-4" /> Stock qui dort (&gt; 45 jours)
              </p>
              <RowList rows={an.dormant} empty="Aucun article ne dort." right={(r) => (r.days != null ? `${r.days} j` : '')} />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle icon={<Tag className="w-4 h-4 text-emerald-400" />} title="Prix conseillé" badge="d’après tes ventes" />
        <p className="text-xs text-white/55 mb-4 -mt-2">Médiane de tes ventes passées de même catégorie et taille.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <select className={inputCls} value={pForm.category} onChange={(e) => setPForm({ ...pForm, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
          </select>
          <select className={inputCls} value={pForm.size} onChange={(e) => setPForm({ ...pForm, size: e.target.value })}>
            <option value="" className="bg-slate-900">Taille…</option>
            {SIZES.map((s) => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
          </select>
          <input className={inputCls} type="number" inputMode="decimal" placeholder="Prix d'achat € (optionnel)"
            value={pForm.purchasePrice} onChange={(e) => setPForm({ ...pForm, purchasePrice: e.target.value })} />
        </div>
        <Button variant="success" type="button" onClick={runPrice} disabled={pLoading}
          >
          {pLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
          {pLoading ? 'Calcul…' : 'Conseiller un prix'}
        </Button>
        {pError && <p className="text-xs text-red-400 mt-3">{pError}</p>}
        {pResult && <div className="mt-4"><PriceBox p={pResult} /></div>}
      </Card>
    </div>
  );
}
