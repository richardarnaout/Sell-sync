'use client';

import { useState } from 'react';
import { Sparkles, Wand2, Tag, Copy, Check, Loader2, Euro } from 'lucide-react';

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
  'w-full rounded-xl px-3 py-2 text-sm text-white bg-white/5 border border-white/10 ' +
  'focus:outline-none focus:border-indigo-400/60 placeholder:text-white/25';

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  // Coupe-circuit : évite une UI bloquée si la fonction serveur traîne (> maxDuration).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 75000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Erreur du serveur.');
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Délai dépassé — réessaie (le modèle a mis trop de temps à répondre).');
    }
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
      className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-indigo-300/80 hover:text-indigo-300 hover:bg-indigo-500/10 transition"
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
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

interface ListingResult {
  title: string;
  description: string;
  keywords: string[];
}
interface PriceResult {
  suggested: number;
  min: number;
  max: number;
  reasoning: string;
}

export default function AiTools({ sales }: { sales: SaleLike[] }) {
  // ── Analyste IA ──
  const [anLoading, setAnLoading] = useState(false);
  const [anReport, setAnReport] = useState('');
  const [anError, setAnError] = useState('');

  async function runAnalyst() {
    setAnLoading(true);
    setAnError('');
    setAnReport('');
    try {
      const { report } = await postJSON<{ report: string }>('/api/ai/analyst', { sales });
      setAnReport(report);
    } catch (e) {
      setAnError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setAnLoading(false);
    }
  }

  // ── Générateur d'annonce ──
  const [lForm, setLForm] = useState({ article: '', category: 'Autre', size: '', brand: '', condition: '' });
  const [lLoading, setLLoading] = useState(false);
  const [lResult, setLResult] = useState<ListingResult | null>(null);
  const [lError, setLError] = useState('');

  async function runListing() {
    if (!lForm.article.trim()) {
      setLError("Indique au moins l'article.");
      return;
    }
    setLLoading(true);
    setLError('');
    setLResult(null);
    try {
      setLResult(await postJSON<ListingResult>('/api/ai/listing', lForm));
    } catch (e) {
      setLError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setLLoading(false);
    }
  }

  // ── Prix optimal ──
  const [pForm, setPForm] = useState({ article: '', category: 'Autre', size: '', brand: '', purchasePrice: '' });
  const [pLoading, setPLoading] = useState(false);
  const [pResult, setPResult] = useState<PriceResult | null>(null);
  const [pError, setPError] = useState('');

  async function runPrice() {
    if (!pForm.article.trim()) {
      setPError("Indique au moins l'article.");
      return;
    }
    setPLoading(true);
    setPError('');
    setPResult(null);
    try {
      setPResult(
        await postJSON<PriceResult>('/api/ai/price', {
          ...pForm,
          purchasePrice: pForm.purchasePrice ? Number(pForm.purchasePrice) : undefined,
          sales,
        }),
      );
    } catch (e) {
      setPError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setPLoading(false);
    }
  }

  const fmtEur = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Analyste IA ── */}
      <div className="card rounded-2xl p-4 sm:p-5">
        <SectionTitle
          icon={<Sparkles className="w-4 h-4 text-indigo-400" />}
          title="Analyste IA"
          badge="IA"
        />
        <p className="text-[11px] text-white/30 mb-4 -mt-2">
          Analyse stratégique de tout ton historique : ce qui marche, quoi sourcer, comment vendre plus.
        </p>
        <button
          type="button"
          onClick={runAnalyst}
          disabled={anLoading || sales.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          {anLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {anLoading ? 'Analyse en cours…' : 'Lancer l’analyse IA'}
        </button>
        {sales.length === 0 && (
          <p className="text-xs text-white/30 mt-3">Ajoute quelques ventes pour activer l’analyse.</p>
        )}
        {anError && <p className="text-xs text-red-400 mt-3">{anError}</p>}
        {anReport && (
          <div
            className="mt-4 rounded-xl p-4 text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap"
            style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}
          >
            {anReport}
          </div>
        )}
      </div>

      {/* ── Générateur d'annonce ── */}
      <div className="card rounded-2xl p-4 sm:p-5">
        <SectionTitle icon={<Wand2 className="w-4 h-4 text-cyan-400" />} title="Générateur d'annonce Vinted" badge="IA" />
        <p className="text-[11px] text-white/30 mb-4 -mt-2">
          Titre + description + mots-clés optimisés pour la recherche Vinted.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input
            className={inputCls + ' sm:col-span-2'}
            placeholder="Article (ex: jean Levi's 501 bleu)"
            value={lForm.article}
            onChange={(e) => setLForm({ ...lForm, article: e.target.value })}
          />
          <select className={inputCls} value={lForm.category} onChange={(e) => setLForm({ ...lForm, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-slate-900">
                {c}
              </option>
            ))}
          </select>
          <select className={inputCls} value={lForm.size} onChange={(e) => setLForm({ ...lForm, size: e.target.value })}>
            <option value="" className="bg-slate-900">
              Taille…
            </option>
            {SIZES.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {s}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="Marque (optionnel)"
            value={lForm.brand}
            onChange={(e) => setLForm({ ...lForm, brand: e.target.value })}
          />
          <select className={inputCls} value={lForm.condition} onChange={(e) => setLForm({ ...lForm, condition: e.target.value })}>
            <option value="" className="bg-slate-900">
              État…
            </option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c} className="bg-slate-900">
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={runListing}
          disabled={lLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg,#06b6d4,#0ea5e9)' }}
        >
          {lLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {lLoading ? 'Génération…' : 'Générer l’annonce'}
        </button>
        {lError && <p className="text-xs text-red-400 mt-3">{lError}</p>}
        {lResult && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wide text-white/35 font-semibold">Titre</p>
                <CopyBtn text={lResult.title} id="ltitle" />
              </div>
              <p className="text-sm text-white font-semibold mt-1">{lResult.title}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wide text-white/35 font-semibold">Description</p>
                <CopyBtn text={lResult.description} id="ldesc" />
              </div>
              <p className="text-[13px] text-white/75 mt-1 whitespace-pre-wrap leading-relaxed">{lResult.description}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-[10px] uppercase tracking-wide text-white/35 font-semibold">Mots-clés</p>
                <CopyBtn text={lResult.keywords.join(' ')} id="lkw" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lResult.keywords.map((k, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.25)' }}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Prix optimal ── */}
      <div className="card rounded-2xl p-4 sm:p-5">
        <SectionTitle icon={<Tag className="w-4 h-4 text-emerald-400" />} title="Prix de vente optimal" badge="IA" />
        <p className="text-[11px] text-white/30 mb-4 -mt-2">
          Prix conseillé d'après tes ventes passées similaires.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input
            className={inputCls + ' sm:col-span-2'}
            placeholder="Article à vendre"
            value={pForm.article}
            onChange={(e) => setPForm({ ...pForm, article: e.target.value })}
          />
          <select className={inputCls} value={pForm.category} onChange={(e) => setPForm({ ...pForm, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-slate-900">
                {c}
              </option>
            ))}
          </select>
          <select className={inputCls} value={pForm.size} onChange={(e) => setPForm({ ...pForm, size: e.target.value })}>
            <option value="" className="bg-slate-900">
              Taille…
            </option>
            {SIZES.map((s) => (
              <option key={s} value={s} className="bg-slate-900">
                {s}
              </option>
            ))}
          </select>
          <input
            className={inputCls}
            placeholder="Marque (optionnel)"
            value={pForm.brand}
            onChange={(e) => setPForm({ ...pForm, brand: e.target.value })}
          />
          <input
            className={inputCls}
            type="number"
            inputMode="decimal"
            placeholder="Prix d'achat € (optionnel)"
            value={pForm.purchasePrice}
            onChange={(e) => setPForm({ ...pForm, purchasePrice: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={runPrice}
          disabled={pLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
        >
          {pLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Euro className="w-4 h-4" />}
          {pLoading ? 'Calcul…' : 'Conseiller un prix'}
        </button>
        {pError && <p className="text-xs text-red-400 mt-3">{pError}</p>}
        {pResult && (
          <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div className="flex items-end gap-3 flex-wrap">
              <p className="text-3xl font-bold text-emerald-400">{fmtEur(pResult.suggested)}</p>
              <p className="text-xs text-white/40 mb-1">
                fourchette {fmtEur(pResult.min)} – {fmtEur(pResult.max)}
              </p>
            </div>
            <p className="text-[13px] text-white/70 mt-2 leading-relaxed">{pResult.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}
