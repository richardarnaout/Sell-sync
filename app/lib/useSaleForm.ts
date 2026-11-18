import { useState, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { supabase } from './supabaseClient';
import { Sale, FormState, Template, emptyForm, today, saleToDb, templateToDb } from './sales';

// État et actions du formulaire de vente et des modèles (T-022.8 : sortis de page.tsx, comportement inchangé).
// L'état vit dans la page (le hook y est appelé) : il survit à la fermeture du formulaire comme avant.
export function useSaleForm({ sales, setSales, templates, setTemplates, user, setImportMsg }: {
  sales: Sale[]; setSales: Dispatch<SetStateAction<Sale[]>>;
  templates: Template[]; setTemplates: Dispatch<SetStateAction<Template[]>>;
  user: any; setImportMsg: Dispatch<SetStateAction<string | null>>;
}) {
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [editId, setEditId]       = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate]   = useState(false);
  const [templateName, setTemplateName]       = useState('');
  const [templateSearch, setTemplateSearch]   = useState('');
  const [templateImage, setTemplateImage]     = useState<string>('');
  const [templatesOpen, setTemplatesOpen]     = useState(false);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const templateJsonRef = useRef<HTMLInputElement>(null);

  const openForm = useCallback(() => { setEditId(null); setForm(emptyForm()); setFormError(''); setShowForm(true); }, []);
  const openEdit = useCallback((s: Sale) => {
    setEditId(s.id);
    setForm({
      article: s.article, category: s.category, size: s.size, date: s.date,
      purchasePrice: s.purchasePrice ? String(s.purchasePrice) : '',
      salePrice:     String(s.salePrice),
      shippingCost:  s.shippingCost  ? String(s.shippingCost)  : '',
      boosterCost:   s.boosterCost   ? String(s.boosterCost)   : '',
      productUrl:    s.productUrl ?? '',
    });
    setFormError(''); setShowForm(true);
  }, []);
  const closeForm = useCallback(() => { setShowForm(false); setEditId(null); setSavingTemplate(false); setTemplateName(''); setTemplateSearch(''); setTemplateImage(''); }, []);

  const applyTemplate = (t: Template) => {
    setForm(prev => ({
      ...prev,
      article:       t.name,
      category:      t.category,
      size:          t.size,
      purchasePrice: t.purchasePrice,
      shippingCost:  t.shippingCost,
      boosterCost:   t.boosterCost,
      productUrl:    t.productUrl ?? '',
      salePrice:     '',
    }));
    setSavingTemplate(false);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const t: Template = {
      id: Date.now().toString(),
      name:          templateName.trim(),
      category:      form.category,
      size:          form.size,
      purchasePrice: form.purchasePrice,
      shippingCost:  form.shippingCost,
      boosterCost:   form.boosterCost,
      image:         templateImage || undefined,
      productUrl:    form.productUrl.trim() || undefined,
    };
    setTemplates(prev => [...prev, t]);
    setSavingTemplate(false);
    setTemplateName('');
    setTemplateImage('');
    await supabase.from('templates').insert(templateToDb(t, user.id));
  };

  const handleTemplateImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setTemplateImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const deleteTemplate = async (id: string) => {
    const removed = templates.find(t => t.id === id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    const { data, error } = await supabase.from('templates').delete().eq('id', id).select();
    if (error || !data || data.length === 0) {
      if (removed) setTemplates(prev => [...prev, removed]);
      alert(
        error
          ? 'Suppression impossible : ' + error.message
          : "Suppression bloquée par la base (policy RLS DELETE manquante sur la table « templates »). Ajoute-la dans Supabase.",
      );
    }
  };

  const liveProfit =
    (parseFloat(form.salePrice)     || 0) -
    (parseFloat(form.purchasePrice) || 0) -
    (parseFloat(form.shippingCost)  || 0) -
    (parseFloat(form.boosterCost)   || 0);

  const submitSale = async () => {
    const sp = parseFloat(form.salePrice);
    if (!form.article.trim())                    { setFormError("Indique le nom de l'article."); return; }
    if (!form.salePrice || isNaN(sp) || sp <= 0) { setFormError('Indique un prix de vente valide.'); return; }
    const updated = {
      date: form.date || today(), article: form.article.trim(), category: form.category, size: form.size,
      purchasePrice: parseFloat(form.purchasePrice) || 0, salePrice: sp,
      shippingCost:  parseFloat(form.shippingCost)  || 0,
      boosterCost:   parseFloat(form.boosterCost)   || 0,
      productUrl:    form.productUrl.trim() || undefined,
    };
    if (editId) {
      const sale = { ...sales.find(s => s.id === editId)!, ...updated };
      setSales(prev => prev.map(s => s.id === editId ? sale : s));
      await supabase.from('sales').update(saleToDb(sale, user.id)).eq('id', editId);
    } else {
      const newSale: Sale = { id: Date.now().toString(), ...updated };
      setSales(prev => [newSale, ...prev]);
      await supabase.from('sales').insert(saleToDb(newSale, user.id));
    }
    setShowForm(false); setEditId(null);
  };

  const exportTemplates = () => {
    if (!templates.length) return;
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `sellsync_modeles_${today()}.json`; a.click();
  };

  const importTemplates = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse((ev.target?.result as string) ?? '[]');
        if (!Array.isArray(data)) return;
        const imported = data.filter((t: any) => t.id && t.name);
        const currentTemplates = templates;
        const existingNames = new Set(currentTemplates.map(t => t.name.toLowerCase()));
        const news = imported.filter((t: any) => !existingNames.has(t.name.toLowerCase()));
        setTemplates(prev => [...prev, ...news]);
        if (news.length > 0) {
          await supabase.from('templates').insert(news.map((t: Template) => templateToDb(t, user.id)));
        }
        setImportMsg(`${imported.length} modèle${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} !`);
        setTimeout(() => setImportMsg(null), 3000);
      } catch {}
      if (templateJsonRef.current) templateJsonRef.current.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  return {
    templates,
    showForm, form, setForm, formError, editId,
    savingTemplate, setSavingTemplate, templateName, setTemplateName,
    templateSearch, setTemplateSearch, templateImage, setTemplateImage,
    templatesOpen, setTemplatesOpen, imageInputRef, templateJsonRef,
    openForm, openEdit, closeForm, applyTemplate, saveTemplate, handleTemplateImage,
    deleteTemplate, liveProfit, submitSale, exportTemplates, importTemplates,
  };
}
export type SaleFormApi = ReturnType<typeof useSaleForm>;
