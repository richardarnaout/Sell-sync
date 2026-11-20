'use client';

import { Plus, Download, Upload, X, AlertCircle, Pencil, Tag, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { CATEGORIES, SIZES, CAT_COLORS, fmt } from '../lib/sales';
import type { SaleFormApi } from '../lib/useSaleForm';
import { Field, Thumb } from './ui';

// Feuille « Nouvelle vente / Modifier la vente » avec les modèles enregistrés.
export default function SaleForm({ f }: { f: SaleFormApi }) {
  const {
    templates, form, setForm, formError, editId, savingTemplate, setSavingTemplate, templateName,
    setTemplateName, templateSearch, setTemplateSearch, templateImage, setTemplateImage,
    templatesOpen, setTemplatesOpen, imageInputRef, templateJsonRef, closeForm, applyTemplate,
    saveTemplate, handleTemplateImage, deleteTemplate, liveProfit, submitSale, exportTemplates,
    importTemplates,
  } = f;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
      <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)' }} onClick={closeForm} />
      <div className="animate-slide-up relative w-full max-w-xl rounded-t-3xl px-4 sm:px-5 pt-4 pb-12 max-h-[92dvh] overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom:'max(3rem, calc(1.5rem + env(safe-area-inset-bottom)))', background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)', borderBottom:'none' }}>

        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background:'rgba(255,255,255,0.15)' }} />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-white">{editId ? 'Modifier la vente' : 'Nouvelle vente'}</h2>
          <button onClick={closeForm} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-white/55 hover:text-white/70 hover:bg-white/5 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modèles ── */}
        <input ref={templateJsonRef} type="file" accept=".json" className="hidden" onChange={importTemplates} />
        <div className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <button
              type="button"
              onClick={() => setTemplatesOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', color:'#a5b4fc' }}
            >
              <Tag className="w-3.5 h-3.5" />
              Mes modèles enregistrés
              {templates.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background:'rgba(99,102,241,0.25)', color:'#c4b5fd' }}>{templates.length}</span>
              )}
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${templatesOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => templateJsonRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)' }}>
                <Upload className="w-3 h-3" /> Importer
              </button>
              {templates.length > 0 && (
                <button type="button" onClick={exportTemplates}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)' }}>
                  <Download className="w-3 h-3" /> Exporter
                </button>
              )}
            </div>
          </div>
          {templatesOpen && (
            <div className="mt-3">
              {templates.length === 0 ? (
                <p className="text-xs text-white/55 px-1">Aucun modèle enregistré.</p>
              ) : (
                <>
                  <div className="relative mb-3">
                    <input
                      type="text"
                      placeholder="Rechercher un modèle..."
                      value={templateSearch}
                      onChange={e => setTemplateSearch(e.target.value)}
                      className="field-input w-full rounded-xl pl-8 pr-4 py-2 text-xs"
                    />
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color:'rgba(255,255,255,0.25)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="8" strokeWidth="2"/><path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    {templateSearch && (
                      <button onClick={() => setTemplateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/60 transition">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {(() => {
                    const filtered = templates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()));
                    return filtered.length > 0 ? (
                      <div className="flex gap-2 flex-wrap">
                        {filtered.map(t => (
                          <div key={t.id} className="flex items-center gap-1 pr-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                            style={{ background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', color:'#a5b4fc', paddingLeft: t.image ? '4px' : '12px' }}>
                            <button onClick={() => { applyTemplate(t); setTemplateSearch(''); setTemplatesOpen(false); }} className="flex items-center gap-2 hover:text-white transition">
                              {t.image && <Thumb src={t.image} name={t.name} size="sm" />}
                              <span>{t.name}</span>
                              {t.purchasePrice && <span className="opacity-50 font-normal">{t.purchasePrice}€</span>}
                            </button>
                            {t.productUrl && (
                              <a href={t.productUrl} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Ouvrir le lien du produit"
                                className="ml-1 opacity-50 hover:opacity-100 hover:text-white transition p-0.5 rounded">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            <button onClick={() => deleteTemplate(t.id)}
                              className="ml-1 opacity-30 hover:opacity-80 hover:text-red-400 transition p-0.5 rounded">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/55">Aucun modèle trouvé pour "{templateSearch}"</p>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {formError && (
          <div className="flex items-center gap-2 text-xs px-4 py-3 rounded-xl mb-4"
            style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5' }}>
            <AlertCircle className="w-4 h-4 shrink-0" />{formError}
          </div>
        )}

        <div className="space-y-5">
          <Field label="Article *">
            <input type="text" placeholder="ex : Veste Zara noire" value={form.article}
              onChange={e => setForm({...form, article:e.target.value})}
              className="field-input w-full rounded-xl px-4 py-3 text-sm" />
          </Field>

          <Field label="Lien produit (optionnel)">
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/55" />
              <input type="url" placeholder="https://..." value={form.productUrl}
                onChange={e => setForm({...form, productUrl:e.target.value})}
                className="field-input w-full rounded-xl pl-9 pr-3 py-3 text-sm" />
            </div>
          </Field>

          <Field label="Catégorie">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setForm({...form, category:c})}
                  className="px-3 py-1.5 min-w-[44px] rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={form.category === c
                    ? { background:`${CAT_COLORS[c]}33`, color: CAT_COLORS[c], border:`1px solid ${CAT_COLORS[c]}66` }
                    : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.08)' }}>
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Taille">
            <div className="flex flex-wrap gap-2">
              {SIZES.map(s => (
                <button key={s} type="button" onClick={() => setForm({...form, size: form.size === s ? '' : s})}
                  className="px-3 py-1.5 min-w-[44px] rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={form.size === s
                    ? { background:'rgba(99,102,241,0.2)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.4)' }
                    : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.08)' }}>
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Date de vente">
            <input type="date" value={form.date}
              onChange={e => setForm({...form, date:e.target.value})}
              className="field-input w-full rounded-xl px-4 py-3 text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix de vente * (€)">
              <input type="number" min="0" step="0.01" placeholder="25,00"
                value={form.salePrice} onChange={e => setForm({...form, salePrice:e.target.value})}
                className="field-input w-full rounded-xl px-4 py-3 text-sm" />
            </Field>
            <Field label="Prix d'achat (€)">
              <input type="number" min="0" step="0.01" placeholder={form.isPersonal ? 'Sans objet' : '5,00'}
                disabled={form.isPersonal}
                value={form.isPersonal ? '' : form.purchasePrice} onChange={e => setForm({...form, purchasePrice:e.target.value})}
                className="field-input w-full rounded-xl px-4 py-3 text-sm disabled:opacity-40" />
            </Field>
          </div>

          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-sm text-white/70">
            <input type="checkbox" checked={form.isPersonal}
              onChange={e => setForm({...form, isPersonal:e.target.checked, purchasePrice: e.target.checked ? '' : form.purchasePrice})}
              className="w-5 h-5 accent-indigo-500" />
            <span>Article perso (pas d'achat) <span className="text-white/55">— compté dans le CA, pas dans la marge</span></span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frais de port (€)">
              <input type="number" min="0" step="0.01" placeholder="3,00"
                value={form.shippingCost} onChange={e => setForm({...form, shippingCost:e.target.value})}
                className="field-input w-full rounded-xl px-4 py-3 text-sm" />
            </Field>
            <Field label="Booster Vinted (€)">
              <input type="number" min="0" step="0.01" placeholder="0,00"
                value={form.boosterCost} onChange={e => setForm({...form, boosterCost:e.target.value})}
                className="field-input w-full rounded-xl px-4 py-3 text-sm" />
            </Field>
          </div>

          {form.salePrice && (
            <div className="rounded-2xl px-4 py-4 flex items-center justify-between animate-scale-in"
              style={{ background: liveProfit >= 0 ? 'rgba(99,102,241,0.08)' : 'rgba(248,113,113,0.08)',
                       border:`1px solid ${liveProfit >= 0 ? 'rgba(99,102,241,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
              <span className="text-xs text-white/60 font-semibold uppercase tracking-wide">Bénéfice estimé</span>
              <span className="text-2xl font-bold" style={{ color: liveProfit >= 0 ? '#818cf8' : '#f87171' }}>
                {fmt(liveProfit)}
              </span>
            </div>
          )}

          {/* ── Sauvegarder comme modèle ── */}
          {!editId && (
            <div>
              {!savingTemplate ? (
                <button type="button" onClick={() => { setSavingTemplate(true); setTemplateName(form.article); }}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)' }}>
                  <Tag className="w-3.5 h-3.5" /> Sauvegarder comme modèle
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-2.5" style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)' }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.6)' }}>Nom du modèle</p>
                  <input type="text" placeholder="ex : T-shirt Shein" value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                    className="field-input w-full rounded-xl px-4 py-2.5 text-sm" autoFocus />

                  <div className="flex items-center gap-3">
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleTemplateImage} />
                    {templateImage ? (
                      <div className="flex items-center gap-2">
                        <Thumb src={templateImage} name={templateName} size="md" />
                        <button type="button" onClick={() => { setTemplateImage(''); if (imageInputRef.current) imageInputRef.current.value = ''; }}
                          className="text-xs text-white/55 hover:text-red-400 transition">Supprimer</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => imageInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                        style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)' }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Ajouter une photo (optionnel)
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={saveTemplate}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition"
                      style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                      Sauvegarder
                    </button>
                    <button type="button" onClick={() => { setSavingTemplate(false); setTemplateImage(''); }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold transition"
                      style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.6)' }}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button type="button" onClick={submitSale}
            className="w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition active:scale-[0.97] text-white text-sm"
            style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 20px rgba(99,102,241,0.4)' }}>
            {editId ? <><Pencil className="w-4 h-4" />Enregistrer les modifications</> : <><Plus className="w-4 h-4" />Enregistrer la vente</>}
          </button>
        </div>
      </div>
    </div>
  );
}
