'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Plus, Trash2, TrendingUp, Package, Euro, Download, Upload, X,
  ShoppingBag, Percent, AlertCircle, Pencil, BarChart2,
  List, Sparkles, ArrowUpRight, ArrowDownRight, Tag, CheckCircle, LogOut, Settings,
  Link as LinkIcon, ExternalLink,
} from 'lucide-react';

const supabase = createClient(
  'https://omipwzbkrdtarlcuurhn.supabase.co',
  'sb_publishable_UdqYs50tvp37Kuni-sweTQ_n8i8s9kh'
);

// ── Types ─────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  date: string;
  article: string;
  category: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  shippingCost: number;
  boosterCost: number;
  productUrl?: string;
}

interface FormState {
  article: string; category: string; size: string; date: string;
  purchasePrice: string; salePrice: string; shippingCost: string; boosterCost: string;
  productUrl: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  size: string;
  purchasePrice: string;
  shippingCost: string;
  boosterCost: string;
  image?: string;
  productUrl?: string;
}

const CATEGORIES = ['Hauts','Bas','Robes','Manteaux','Chaussures','Accessoires','Sport','Autre'];
const SIZES      = ['XS','S','M','L','XL','XXL','34','36','38','40','42','44','46','Unique'];

const CAT_COLORS: Record<string,string> = {
  Hauts:'#6366f1', Bas:'#8b5cf6', Robes:'#a78bfa', Manteaux:'#7c3aed',
  Chaussures:'#06b6d4', Accessoires:'#0ea5e9', Sport:'#10b981', Autre:'#64748b',
};
const MONTH_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#a78bfa','#ec4899','#14b8a6'];

function calcProfit(s: Sale) { return s.salePrice - s.purchasePrice - s.shippingCost - s.boosterCost; }

function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}
function fmt(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + ' €'; }
function fmtPlain(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }
function today() { return new Date().toISOString().slice(0, 10); }
function parseDate(str: string) { const [y,m,d] = str.split('-').map(Number); return new Date(y, m-1, d); }

const emptyForm = (): FormState => ({
  article:'', category:'Autre', size:'', date: today(),
  purchasePrice:'', salePrice:'', shippingCost:'', boosterCost:'',
  productUrl:'',
});

// ── DB mapping ────────────────────────────────────────────────────────────

function saleToDb(s: Sale, userId: string) {
  return {
    id: s.id, user_id: userId, date: s.date, article: s.article,
    category: s.category, size: s.size,
    purchase_price: s.purchasePrice, sale_price: s.salePrice,
    shipping_cost: s.shippingCost, booster_cost: s.boosterCost,
    product_url: s.productUrl || null,
  };
}
function dbToSale(row: any): Sale {
  return {
    id: row.id, date: row.date, article: row.article,
    category: row.category, size: row.size || '',
    purchasePrice: Number(row.purchase_price) || 0,
    salePrice: Number(row.sale_price) || 0,
    shippingCost: Number(row.shipping_cost) || 0,
    boosterCost: Number(row.booster_cost) || 0,
    productUrl: row.product_url || undefined,
  };
}
function templateToDb(t: Template, userId: string) {
  return {
    id: t.id, user_id: userId, name: t.name, category: t.category,
    size: t.size, purchase_price: t.purchasePrice,
    shipping_cost: t.shippingCost, booster_cost: t.boosterCost,
    image: t.image || null,
    product_url: t.productUrl || null,
  };
}
function dbToTemplate(row: any): Template {
  return {
    id: row.id, name: row.name, category: row.category,
    size: row.size || '', purchasePrice: row.purchase_price || '',
    shippingCost: row.shipping_cost || '', boosterCost: row.booster_cost || '',
    image: row.image || undefined,
    productUrl: row.product_url || undefined,
  };
}

// ── Animated counter ──────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current; prev.current = target;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setVal(from + (target - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

// ── Custom tooltip for charts ─────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#12141f', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'10px 14px', minWidth:140 }}>
      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginBottom:6, textTransform:'capitalize' }}>{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ display:'flex', justifyContent:'space-between', gap:16, fontSize:13, fontWeight:600, color: entry.color || '#fff', marginBottom:2 }}>
          <span style={{ color:'rgba(255,255,255,0.5)', fontWeight:400 }}>{entry.name}</span>
          <span>{Number(entry.value).toFixed(2).replace('.', ',')} €</span>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function VintedAI() {
  const [sales, setSales]         = useState<Sale[]>([]);
  const [mounted, setMounted]     = useState(false);
  const [tab, setTab]             = useState<'ventes'|'analyse'>('ventes');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [editId, setEditId]       = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [savingTemplate, setSavingTemplate]   = useState(false);
  const [templateName, setTemplateName]       = useState('');
  const [templateSearch, setTemplateSearch]   = useState('');
  const [templateImage, setTemplateImage]     = useState<string>('');
  const [templatesOpen, setTemplatesOpen]     = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef   = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setSales([]); setTemplates([]); setMounted(false); return; }
    Promise.all([
      supabase.from('sales').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ]).then(([{ data: salesData }, { data: templatesData }]) => {
      setSales(salesData ? salesData.map(dbToSale) : []);
      setTemplates(templatesData ? templatesData.map(dbToTemplate) : []);
      setMounted(true);
    });
  }, [user]);

  // ── Stats (filtrées par mois sélectionné) ──
  const stats = useMemo(() => {
    const filtered = selectedMonth ? sales.filter(x => x.date.slice(0,7) === selectedMonth) : sales;
    if (!filtered.length) return { totalProfit:0, totalRevenue:0, count:0, avgMargin:0, totalCost:0 };
    const totalRevenue = filtered.reduce((s,x) => s + x.salePrice, 0);
    const totalProfit  = filtered.reduce((s,x) => s + calcProfit(x), 0);
    const totalCost    = filtered.reduce((s,x) => s + x.purchasePrice + x.shippingCost + x.boosterCost, 0);
    const margins      = filtered.filter(x => x.salePrice > 0).map(x => (calcProfit(x) / x.salePrice) * 100);
    const avgMargin    = margins.length ? margins.reduce((a,b) => a + b, 0) / margins.length : 0;
    return { totalProfit, totalRevenue, count: filtered.length, avgMargin, totalCost };
  }, [sales, selectedMonth]);

  const animProfit  = useCountUp(stats.totalProfit);
  const animRevenue = useCountUp(stats.totalRevenue);
  const animCount   = useCountUp(stats.count);
  const animMargin  = useCountUp(stats.avgMargin);

  // ── Données par mois ──
  const byMonth = useMemo(() => {
    const map: Record<string,{ label:string; labelShort:string; sales:Sale[]; profit:number; revenue:number; cost:number }> = {};
    for (const s of sales) {
      const key = s.date.slice(0,7);
      if (!map[key]) {
        const d = parseDate(s.date + '-01');
        const label = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
        const labelShort = d.toLocaleDateString('fr-FR', { month:'short', year:'2-digit' });
        map[key] = { label: label.charAt(0).toUpperCase() + label.slice(1), labelShort, sales:[], profit:0, revenue:0, cost:0 };
      }
      map[key].sales.push(s);
      map[key].profit  += calcProfit(s);
      map[key].revenue += s.salePrice;
      map[key].cost    += s.purchasePrice + s.shippingCost + s.boosterCost;
    }
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
  }, [sales]);

  const byMonthDesc = useMemo(() => [...byMonth].reverse(), [byMonth]);

  // ── Données par catégorie pour pie chart ──
  const byCat = useMemo(() => {
    const map: Record<string,{ count:number; profit:number; revenue:number }> = {};
    for (const s of sales) {
      if (!map[s.category]) map[s.category] = { count:0, profit:0, revenue:0 };
      map[s.category].count++;
      map[s.category].profit  += calcProfit(s);
      map[s.category].revenue += s.salePrice;
    }
    return Object.entries(map).map(([name,v]) => ({ name, ...v })).sort((a,b) => b.revenue - a.revenue);
  }, [sales]);

  // ── Courbes mensuelles comparées ──
  const monthComparison = useMemo(() => {
    if (byMonth.length < 2) return { data: [], months: [] as string[] };
    const recent = byMonth.slice(-8);
    const data = Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      const row: Record<string, number | string> = { day };
      for (const [, m] of recent) {
        row[m.labelShort] = parseFloat(
          m.sales.filter(s => parseInt(s.date.slice(8, 10)) <= day)
            .reduce((sum, s) => sum + calcProfit(s), 0).toFixed(2)
        );
      }
      return row;
    });
    return { data, months: recent.map(([, m]) => m.labelShort) };
  }, [byMonth]);

  // ── Top articles ──
  const topArticles = useMemo(() => {
    const map: Record<string, { count: number; profit: number }> = {};
    for (const s of sales) {
      if (!map[s.article]) map[s.article] = { count: 0, profit: 0 };
      map[s.article].count++;
      map[s.article].profit += calcProfit(s);
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, ...v }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  }, [sales]);

  // ── Top tailles ──
  const topSizes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sales) { const sz = s.size || 'N/A'; map[sz] = (map[sz] || 0) + 1; }
    return Object.entries(map).map(([size, count]) => ({ size, count })).sort((a, b) => b.count - a.count);
  }, [sales]);

  // ── Article phare par mois ──
  const bestPerMonth = useMemo(() =>
    [...byMonth].reverse().map(([, month]) => {
      const map: Record<string, { count: number; profit: number }> = {};
      for (const s of month.sales) {
        if (!map[s.article]) map[s.article] = { count: 0, profit: 0 };
        map[s.article].count++;
        map[s.article].profit += calcProfit(s);
      }
      const best = Object.entries(map).sort((a, b) => b[1].count - a[1].count)[0];
      return {
        month: month.labelShort,
        article: best ? (best[0].length > 18 ? best[0].slice(0, 16) + '…' : best[0]) : '—',
        count: best ? best[1].count : 0,
        profit: best ? best[1].profit : 0,
      };
    }), [byMonth]);

  // ── Meilleur jour de la semaine ──
  const byDayOfWeek = useMemo(() => {
    const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const map = DAYS.map(d => ({ day: d, ventes: 0, profit: 0 }));
    for (const s of sales) {
      const dow = (parseDate(s.date).getDay() + 6) % 7;
      map[dow].ventes++;
      map[dow].profit += calcProfit(s);
    }
    return map;
  }, [sales]);

  // ── Suggestions intelligentes ──
  const suggestions = useMemo(() => {
    if (sales.length < 3) return [];
    type SugType = 'success'|'info'|'tip'|'warning';
    const items: { type: SugType; title: string; body: string }[] = [];
    const DAYS_FULL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

    if (topArticles.length > 0 && topArticles[0].count >= 2) {
      const a = topArticles[0];
      items.push({ type:'success', title:'Article phare à relancer',
        body:`"${a.name}" s'est vendu ${a.count} fois — c'est ton best-seller. Pense à en racheter pour continuer à le revendre.` });
    }

    const ratios = Object.entries(sales.reduce((m, s) => {
      if (!m[s.article]) m[s.article] = { p:0, r:0 };
      m[s.article].p += calcProfit(s); m[s.article].r += s.salePrice; return m;
    }, {} as Record<string,{p:number;r:number}>))
    .filter(([, v]) => v.r > 0 && v.p > 0)
    .map(([name, v]) => ({ name: name.length > 22 ? name.slice(0,20)+'…' : name, margin:(v.p/v.r)*100 }))
    .sort((a,b) => b.margin - a.margin);
    if (ratios.length > 0 && ratios[0].margin > 30) {
      items.push({ type:'success', title:'Meilleur ratio de revente',
        body:`"${ratios[0].name}" affiche une marge de ${ratios[0].margin.toFixed(0)}% — ton article le plus rentable au ratio.` });
    }

    const maxV = Math.max(...byDayOfWeek.map(d => d.ventes));
    if (maxV > 0) {
      const bestIdx = byDayOfWeek.findIndex(d => d.ventes === maxV);
      const prevIdx = (bestIdx - 1 + 7) % 7;
      items.push({ type:'tip', title:'Timing idéal pour publier',
        body:`Tu vends le plus le ${DAYS_FULL[bestIdx]}. Publie tes annonces le ${DAYS_FULL[prevIdx]} soir pour capter ce pic de trafic.` });
    }

    if (byCat.length > 0) {
      const c = byCat[0];
      items.push({ type:'info', title:'Catégorie à privilégier',
        body:`Les ${c.name} sont ta meilleure catégorie (${c.count} vente${c.count>1?'s':''}). Continue à sourcer dans cette catégorie en priorité.` });
    }

    if (byMonth.length >= 2) {
      const last = byMonth[byMonth.length-1][1];
      const prev = byMonth[byMonth.length-2][1];
      const diff = last.profit - prev.profit;
      if (diff > 2) items.push({ type:'success', title:'Mois en progression',
        body:`+${diff.toFixed(2).replace('.',',')} € vs ${prev.label}. Belle dynamique, continue sur cette lancée !` });
      else if (diff < -2 && last.sales.length > 0) items.push({ type:'warning', title:'Mois en ralentissement',
        body:`Ce mois-ci tu es en baisse de ${Math.abs(diff).toFixed(2).replace('.',',')} € vs ${prev.label}. Booste ou renouvelle tes annonces.` });
    }

    if (topSizes.length > 0 && topSizes[0].count >= 2) {
      const sz = topSizes[0];
      items.push({ type:'tip', title:'Taille à cibler lors de tes achats',
        body:`La taille ${sz.size} est ta plus vendue (${sz.count} article${sz.count>1?'s':''}). Priorise cette taille quand tu sources.` });
    }

    const rev = sales.reduce((s,x) => s+x.salePrice, 0);
    const prof = sales.reduce((s,x) => s+calcProfit(x), 0);
    const mg = rev > 0 ? (prof/rev)*100 : 0;
    if (sales.length >= 5) {
      if (mg >= 40) items.push({ type:'success', title:'Excellente marge globale',
        body:`Ta marge moyenne de ${mg.toFixed(1)}% est très solide. Tu sais bien acheter et bien revendre.` });
      else if (mg > 0 && mg < 20) items.push({ type:'warning', title:'Marge à améliorer',
        body:`Ta marge moyenne est de ${mg.toFixed(1)}%. Vise des articles plus rares ou négocie mieux tes prix d'achat.` });
    }

    const best = [...sales].sort((a,b) => calcProfit(b)-calcProfit(a))[0];
    const bp = calcProfit(best);
    if (bp > 8) items.push({ type:'success', title:'Ta vente la plus rentable',
      body:`"${best.article.length>22?best.article.slice(0,20)+'…':best.article}" t'a rapporté +${bp.toFixed(2).replace('.',',')} € net — ton record à battre.` });

    return items;
  }, [sales, topArticles, byDayOfWeek, byCat, byMonth, topSizes]);

  // ── Chart data ──
  const chartMonthly = useMemo(() =>
    byMonth.map(([,m]) => ({
      name: m.labelShort,
      'CA': parseFloat(m.revenue.toFixed(2)),
      'Bénéfice': parseFloat(m.profit.toFixed(2)),
      'Coûts': parseFloat(m.cost.toFixed(2)),
    })), [byMonth]);

  // ── Mois le plus rentable ──
  const bestMonth = useMemo(() =>
    byMonth.length ? byMonth.reduce((a,b) => b[1].profit > a[1].profit ? b : a) : null,
  [byMonth]);

  // ── Form logic ──
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

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    supabase.from('templates').delete().eq('id', id);
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

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const imported: Sale[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVRow(lines[i]);
        if (cols.length < 8) continue;
        const [date, article, category, size, pp, sp, ship, boost] = cols;
        const salePrice = parseFloat(sp);
        if (!article || isNaN(salePrice)) continue;
        imported.push({
          id: `imp_${Date.now()}_${i}`,
          date: date || today(),
          article: article.trim(),
          category: category || 'Autre',
          size: size || '',
          purchasePrice: parseFloat(pp) || 0,
          salePrice,
          shippingCost: parseFloat(ship) || 0,
          boosterCost:  parseFloat(boost) || 0,
        });
      }
      if (imported.length > 0) {
        const currentSales = sales;
        const existing = new Set(currentSales.map(s => `${s.date}|${s.article}|${s.salePrice}`));
        const news = imported.filter(s => !existing.has(`${s.date}|${s.article}|${s.salePrice}`));
        setSales(prev => [...news, ...prev]);
        if (news.length > 0) {
          await supabase.from('sales').insert(news.map(s => saleToDb(s, user.id)));
        }
        setImportMsg(`${imported.length} vente${imported.length > 1 ? 's' : ''} importée${imported.length > 1 ? 's' : ''} !`);
        setTimeout(() => setImportMsg(null), 3000);
      }
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  const templateJsonRef = useRef<HTMLInputElement>(null);

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

  const exportCSV = () => {
    const header = 'Date,Article,Catégorie,Taille,Prix achat,Prix vente,Frais port,Booster,Bénéfice\n';
    const rows = sales.map(s =>
      [s.date, `"${s.article}"`, s.category, s.size || '',
       s.purchasePrice, s.salePrice, s.shippingCost, s.boosterCost, calcProfit(s).toFixed(2)].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `sellsync_${today()}.csv`; a.click();
  };

  if (authLoading || (user && !mounted)) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'#0b0c14' }}>
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor:'#6366f1', borderTopColor:'transparent' }} />
    </div>
  );

  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen" style={{ background:'#0b0c14' }}>

      {/* ── Background accents ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.07]"
          style={{ background:'radial-gradient(ellipse, #6366f1 0%, transparent 70%)', filter:'blur(60px)' }} />
        <div className="absolute bottom-1/3 -right-32 w-80 h-80 rounded-full opacity-[0.05]"
          style={{ background:'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', filter:'blur(40px)' }} />
      </div>

      <div className="relative w-full px-4 sm:px-6 lg:px-10 pb-28">

        {/* ── Header ── */}
        <header className="pt-6 sm:pt-8 pb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center animate-float"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 24px rgba(99,102,241,0.4)' }}>
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-none">
                Sell<span style={{ background:'linear-gradient(90deg,#6366f1,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Sync</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-white/30 mt-0.5 font-medium tracking-wide">VINTED ACCOUNTING</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Tabs — desktop uniquement */}
            <div className="hidden sm:flex gap-1 p-1 rounded-xl" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
              {(['ventes','analyse'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={tab === t
                    ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', boxShadow:'0 2px 12px rgba(99,102,241,0.35)' }
                    : { color:'rgba(255,255,255,0.35)' }}>
                  {t === 'ventes' ? <List className="w-3.5 h-3.5" /> : <BarChart2 className="w-3.5 h-3.5" />}
                  {t === 'ventes' ? 'Mes ventes' : 'Analyse'}
                </button>
              ))}
            </div>
            <button onClick={openForm}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97]"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 18px rgba(99,102,241,0.4)' }}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Nouvelle vente</span>
            </button>
            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
            <button onClick={() => csvInputRef.current?.click()} title="Importer CSV"
              className="flex items-center p-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white transition-all"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Import CSV</span>
            </button>
            {sales.length > 0 && (
              <button onClick={exportCSV} title="Exporter CSV"
                className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white transition-all"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                <Download className="w-3.5 h-3.5" /><span className="ml-1">Export CSV</span>
              </button>
            )}
            <button onClick={() => { setShowSettings(true); setSettingsError(''); setSettingsSuccess(false); setNewPassword(''); setConfirmPassword(''); }}
              title="Réglages"
              className="flex items-center p-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-semibold text-white/30 hover:text-white/70 transition-all"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => supabase.auth.signOut()}
              title="Déconnexion"
              className="flex items-center p-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-semibold text-white/30 hover:text-white/70 transition-all"
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Tabs — mobile uniquement, barre pleine largeur */}
        <div className="flex sm:hidden gap-1 p-1 rounded-xl mb-5 mt-1"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
          {(['ventes','analyse'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={tab === t
                ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', boxShadow:'0 2px 12px rgba(99,102,241,0.35)' }
                : { color:'rgba(255,255,255,0.35)' }}>
              {t === 'ventes' ? <List className="w-3.5 h-3.5" /> : <BarChart2 className="w-3.5 h-3.5" />}
              {t === 'ventes' ? 'Mes ventes' : 'Analyse'}
            </button>
          ))}
        </div>

        {/* ── Stats cards — 4 colonnes ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Bénéfice net" value={(animProfit >= 0 ? '+' : '') + animProfit.toFixed(2).replace('.',',') + ' €'}
            delta={stats.totalProfit} accent="#6366f1" icon={<Euro className="w-4 h-4" />} />
          <StatCard label="Chiffre d'affaires" value={animRevenue.toFixed(2).replace('.',',') + ' €'}
            accent="#06b6d4" icon={<TrendingUp className="w-4 h-4" />} />
          <StatCard label="Articles vendus" value={Math.round(animCount).toString()}
            accent="#8b5cf6" icon={<Package className="w-4 h-4" />} />
          <StatCard label="Marge moyenne" value={animMargin.toFixed(1) + ' %'}
            accent="#10b981" icon={<Percent className="w-4 h-4" />} />
        </div>

        {/* ════════════════ TAB VENTES ════════════════ */}
        {tab === 'ventes' && (
          <div>
            {/* Month filter */}
            {byMonthDesc.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-5">
                <Pill active={!selectedMonth} onClick={() => setSelectedMonth(null)}>Tous</Pill>
                {byMonthDesc.map(([k,m]) => (
                  <Pill key={k} active={selectedMonth === k} onClick={() => setSelectedMonth(selectedMonth === k ? null : k)}>
                    {m.label}
                  </Pill>
                ))}
              </div>
            )}

            {sales.length === 0 ? (
              <EmptyState onAdd={openForm} />
            ) : (
              <div className="space-y-10">
                {byMonthDesc
                  .filter(([k]) => !selectedMonth || k === selectedMonth)
                  .map(([monthKey, month], gi) => (
                    <div key={monthKey} className="animate-fade-slide-up" style={{ animationDelay:`${gi*60}ms`, animationFillMode:'both' }}>
                      {/* Month header */}
                      <div className="flex items-center justify-between mb-4 px-1">
                        <div>
                          <p className="text-xs font-bold text-white/60 uppercase tracking-widest">{month.label}</p>
                          <p className="text-[11px] text-white/25 mt-0.5">{month.sales.length} vente{month.sales.length > 1 ? 's' : ''} · CA {fmtPlain(month.revenue)}</p>
                        </div>
                        <div className={`text-base font-bold flex items-center gap-1 ${month.profit >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
                          {month.profit >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          {(month.profit >= 0 ? '+' : '') + month.profit.toFixed(2).replace('.',',') + ' €'}
                        </div>
                      </div>

                      {/* Sales grid — 2 colonnes sur desktop, 3 sur grand écran */}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {month.sales.map((s, i) => {
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
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold text-white text-sm truncate">{s.article}</p>
                                        {s.productUrl && (
                                          <a href={s.productUrl} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            title="Ouvrir le lien du produit"
                                            className="shrink-0 text-indigo-300/70 hover:text-indigo-300 transition p-0.5 rounded">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                        )}
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                                          style={{ background:`${CAT_COLORS[s.category] ?? '#6366f1'}22`, color: CAT_COLORS[s.category] ?? '#818cf8', border:`1px solid ${CAT_COLORS[s.category] ?? '#6366f1'}44` }}>
                                          {s.category}
                                        </span>
                                        {s.size && (
                                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                                            style={{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>
                                            {s.size}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-white/25 mt-0.5">
                                        {parseDate(s.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}
                                      </p>
                                      <div className="flex flex-wrap gap-x-3 mt-2 text-[11px] text-white/35">
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
                                      <span className="text-base font-bold" style={{ color: isPos ? '#818cf8' : '#f87171' }}>
                                        {fmt(p)}
                                      </span>
                                      {s.purchasePrice > 0 && s.salePrice > 0 && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                          style={{ background: isPos ? 'rgba(99,102,241,0.12)' : 'rgba(248,113,113,0.12)',
                                                   color: isPos ? '#a5b4fc' : '#fca5a5',
                                                   border:`1px solid ${isPos ? 'rgba(99,102,241,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                                          ×{(s.salePrice / (s.purchasePrice || 1)).toFixed(1)}
                                        </span>
                                      )}
                                      <div className="flex gap-1">
                                        <button onClick={() => openEdit(s)}
                                          className="p-1.5 rounded-lg text-white/20 hover:text-indigo-400 hover:bg-indigo-500/10 transition">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => setDeleteId(s.id)}
                                          className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition">
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
        )}

        {/* ════════════════ TAB ANALYSE ════════════════ */}
        {tab === 'analyse' && (
          <div className="animate-fade-in">
            {sales.length === 0 ? (
              <EmptyState onAdd={() => { setTab('ventes'); openForm(); }} label="Ajoute des ventes pour voir les graphiques" />
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {/* Best month highlight */}
                {bestMonth && (
                  <div className="rounded-2xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    style={{ background:'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))', border:'1px solid rgba(99,102,241,0.2)' }}>
                    <div>
                      <p className="text-xs text-white/40 font-semibold uppercase tracking-wide mb-1">Meilleur mois</p>
                      <p className="text-white font-bold text-lg">{bestMonth[1].label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{bestMonth[1].sales.length} vente{bestMonth[1].sales.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-2xl sm:text-3xl font-bold text-indigo-400">+{bestMonth[1].profit.toFixed(2).replace('.',',')} €</p>
                      <p className="text-xs text-white/30 mt-1">CA {fmtPlain(bestMonth[1].revenue)}</p>
                    </div>
                  </div>
                )}

                {/* ── Suggestions intelligentes ── */}
                {suggestions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <p className="text-sm font-bold text-white">Suggestions</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background:'rgba(99,102,241,0.15)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.2)' }}>
                        basées sur tes données
                      </span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {suggestions.map((s, i) => {
                        const c = {
                          success:{ bg:'rgba(16,185,129,0.08)',  border:'rgba(16,185,129,0.25)', label:'#34d399', dot:'#10b981' },
                          info:   { bg:'rgba(99,102,241,0.08)',  border:'rgba(99,102,241,0.25)', label:'#a5b4fc', dot:'#6366f1' },
                          tip:    { bg:'rgba(6,182,212,0.08)',   border:'rgba(6,182,212,0.25)',  label:'#67e8f9', dot:'#06b6d4' },
                          warning:{ bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.25)', label:'#fcd34d', dot:'#f59e0b' },
                        }[s.type];
                        return (
                          <div key={i} className="shrink-0 w-64 rounded-2xl p-4"
                            style={{ background:c.bg, border:`1px solid ${c.border}` }}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background:c.dot }} />
                              <p className="text-xs font-bold leading-tight" style={{ color:c.label }}>{s.title}</p>
                            </div>
                            <p className="text-[11px] text-white/50 leading-relaxed">{s.body}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ligne 1 : CA vs Bénéfice + Tendance bénéfice */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                  <div className="card rounded-2xl p-4 sm:p-5">
                    <p className="text-sm font-bold text-white mb-1">Revenus mensuels</p>
                    <p className="text-[11px] text-white/30 mb-5">Chiffre d'affaires vs bénéfice</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartMonthly} barCategoryGap="30%" barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                        <Bar dataKey="CA" fill="#6366f1" radius={[6,6,0,0]} opacity={0.7} />
                        <Bar dataKey="Bénéfice" fill="#a78bfa" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {chartMonthly.length > 1 ? (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Tendance bénéfice</p>
                      <p className="text-[11px] text-white/30 mb-5">Évolution mois par mois</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartMonthly}>
                          <defs>
                            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
                          <Tooltip content={<ChartTooltip />} />
                          <Area type="monotone" dataKey="Bénéfice" stroke="#6366f1" strokeWidth={2.5} fill="url(#profitGrad)" dot={{ fill:'#6366f1', strokeWidth:0, r:4 }} activeDot={{ r:6, fill:'#a78bfa' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="card rounded-2xl p-5 flex items-center justify-center">
                      <p className="text-white/20 text-sm">Ajoute des ventes sur plusieurs mois pour voir la tendance</p>
                    </div>
                  )}
                </div>

                {/* Ligne 2 : Coûts vs CA + Pie catégories */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                  <div className="card rounded-2xl p-4 sm:p-5">
                    <p className="text-sm font-bold text-white mb-1">Coûts vs Revenus</p>
                    <p className="text-[11px] text-white/30 mb-5">Achats + port + booster</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={chartMonthly}>
                        <defs>
                          <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="CA" stroke="#06b6d4" strokeWidth={2} fill="url(#caGrad)" dot={false} />
                        <Area type="monotone" dataKey="Coûts" stroke="#f87171" strokeWidth={2} fill="url(#costGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {byCat.length > 0 && (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Par catégorie</p>
                      <p className="text-[11px] text-white/30 mb-4">Répartition du chiffre d'affaires</p>
                      <div className="flex flex-col sm:flex-row gap-6 items-center">
                        <div className="w-full sm:w-[45%] shrink-0">
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie data={byCat} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} innerRadius={40}>
                                {byCat.map((entry) => (
                                  <Cell key={entry.name} fill={CAT_COLORS[entry.name] ?? '#6366f1'} opacity={0.85} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => fmtPlain(Number(v))} contentStyle={{ background:'#12141f', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'white', fontSize:12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="w-full sm:flex-1 space-y-2">
                          {byCat.map(c => (
                            <div key={c.name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[c.name] ?? '#6366f1' }} />
                                <span className="text-white/55 font-medium">{c.name}</span>
                                <span className="text-white/20">{c.count}</span>
                              </div>
                              <span className="font-semibold" style={{ color: c.profit >= 0 ? '#a78bfa' : '#f87171' }}>{fmt(c.profit)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Courbes mensuelles comparées ── */}
                {monthComparison.months.length >= 2 && (
                  <div className="card rounded-2xl p-4 sm:p-5">
                    <p className="text-sm font-bold text-white mb-1">Comparaison mensuelle</p>
                    <p className="text-[11px] text-white/30 mb-5">Bénéfice cumulé jour par jour — chaque courbe = un mois</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={monthComparison.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false}
                          tickFormatter={v => `J${v}`} interval={4} />
                        <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} width={45} tickFormatter={v => v + '€'} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize:11, color:'rgba(255,255,255,0.4)', paddingTop:12 }} />
                        {monthComparison.months.map((m, i) => (
                          <Line key={m} type="monotone" dataKey={m} stroke={MONTH_COLORS[i % MONTH_COLORS.length]}
                            strokeWidth={2} dot={false} activeDot={{ r:4 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ── Top articles + Top tailles ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                  {topArticles.length > 0 && (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Articles les plus vendus</p>
                      <p className="text-[11px] text-white/30 mb-4">Top {topArticles.length} par nombre de ventes</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topArticles} layout="vertical" barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                          <XAxis type="number" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fill:'rgba(255,255,255,0.45)', fontSize:10 }} axisLine={false} tickLine={false} width={100} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                          <Bar dataKey="count" name="Ventes" fill="#6366f1" radius={[0,6,6,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {topSizes.length > 0 && (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Tailles les plus vendues</p>
                      <p className="text-[11px] text-white/30 mb-4">Répartition par taille</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topSizes} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="size" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                          <Bar dataKey="count" name="Ventes" radius={[6,6,0,0]}>
                            {topSizes.map((_, i) => (
                              <Cell key={i} fill={MONTH_COLORS[i % MONTH_COLORS.length]} opacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* ── Article phare par mois + Meilleur jour ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {bestPerMonth.length > 0 && (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Article phare par mois</p>
                      <p className="text-[11px] text-white/30 mb-4">L'article le plus vendu chaque mois</p>
                      <div className="space-y-2">
                        {bestPerMonth.slice(0, 8).map(row => (
                          <div key={row.month} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                            style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[10px] font-bold text-white/30 w-10 shrink-0">{row.month}</span>
                              <span className="text-xs font-semibold text-white/80 truncate">{row.article}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-[10px] text-white/30">{row.count}×</span>
                              <span className="text-xs font-bold" style={{ color: row.profit >= 0 ? '#a5b4fc' : '#f87171' }}>
                                {(row.profit >= 0 ? '+' : '') + row.profit.toFixed(2).replace('.', ',') + ' €'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {sales.length >= 5 && (
                    <div className="card rounded-2xl p-4 sm:p-5">
                      <p className="text-sm font-bold text-white mb-1">Meilleur jour de la semaine</p>
                      <p className="text-[11px] text-white/30 mb-4">Quand tu vends le plus</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={byDayOfWeek} barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="day" tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize:11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                          <Bar dataKey="ventes" name="Ventes" radius={[6,6,0,0]}>
                            {byDayOfWeek.map((entry, i) => {
                              const max = Math.max(...byDayOfWeek.map(d => d.ventes));
                              return <Cell key={i} fill={entry.ventes === max && max > 0 ? '#6366f1' : 'rgba(99,102,241,0.3)'} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Form sheet ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
          <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)' }} onClick={closeForm} />
          <div className="animate-slide-up relative w-full max-w-xl rounded-t-3xl px-4 sm:px-5 pt-4 pb-12 max-h-[92vh] overflow-y-auto overflow-x-hidden"
            style={{ background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)', borderBottom:'none' }}>

            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background:'rgba(255,255,255,0.15)' }} />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-white">{editId ? 'Modifier la vente' : 'Nouvelle vente'}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/5 transition">
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
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background:'rgba(99,102,241,0.25)', color:'#c4b5fd' }}>{templates.length}</span>
                  )}
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${templatesOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => templateJsonRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition"
                    style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                    <Upload className="w-3 h-3" /> Importer
                  </button>
                  {templates.length > 0 && (
                    <button type="button" onClick={exportTemplates}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition"
                      style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                      <Download className="w-3 h-3" /> Exporter
                    </button>
                  )}
                </div>
              </div>
              {templatesOpen && (
                <div className="mt-3">
                  {templates.length === 0 ? (
                    <p className="text-xs text-white/20 px-1">Aucun modèle enregistré.</p>
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
                          <button onClick={() => setTemplateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition">
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
                                  {t.image && (
                                    <img src={t.image} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                                  )}
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
                          <p className="text-xs text-white/20">Aucun modèle trouvé pour "{templateSearch}"</p>
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
              <FormField label="Article *">
                <input type="text" placeholder="ex : Veste Zara noire" value={form.article}
                  onChange={e => setForm({...form, article:e.target.value})}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm" />
              </FormField>

              <FormField label="Lien produit (optionnel)">
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <input type="url" placeholder="https://..." value={form.productUrl}
                    onChange={e => setForm({...form, productUrl:e.target.value})}
                    className="field-input w-full rounded-xl pl-9 pr-3 py-3 text-sm" />
                </div>
              </FormField>

              <FormField label="Catégorie">
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, category:c})}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                      style={form.category === c
                        ? { background:`${CAT_COLORS[c]}33`, color: CAT_COLORS[c], border:`1px solid ${CAT_COLORS[c]}66` }
                        : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label="Taille">
                <div className="flex flex-wrap gap-2">
                  {SIZES.map(s => (
                    <button key={s} type="button" onClick={() => setForm({...form, size: form.size === s ? '' : s})}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                      style={form.size === s
                        ? { background:'rgba(99,102,241,0.2)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.4)' }
                        : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label="Date de vente">
                <input type="date" value={form.date}
                  onChange={e => setForm({...form, date:e.target.value})}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm" />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Prix de vente * (€)">
                  <input type="number" min="0" step="0.01" placeholder="25,00"
                    value={form.salePrice} onChange={e => setForm({...form, salePrice:e.target.value})}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm" />
                </FormField>
                <FormField label="Prix d'achat (€)">
                  <input type="number" min="0" step="0.01" placeholder="5,00"
                    value={form.purchasePrice} onChange={e => setForm({...form, purchasePrice:e.target.value})}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm" />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Frais de port (€)">
                  <input type="number" min="0" step="0.01" placeholder="3,00"
                    value={form.shippingCost} onChange={e => setForm({...form, shippingCost:e.target.value})}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm" />
                </FormField>
                <FormField label="Booster Vinted (€)">
                  <input type="number" min="0" step="0.01" placeholder="0,00"
                    value={form.boosterCost} onChange={e => setForm({...form, boosterCost:e.target.value})}
                    className="field-input w-full rounded-xl px-4 py-3 text-sm" />
                </FormField>
              </div>

              {form.salePrice && (
                <div className="rounded-2xl px-4 py-4 flex items-center justify-between animate-scale-in"
                  style={{ background: liveProfit >= 0 ? 'rgba(99,102,241,0.08)' : 'rgba(248,113,113,0.08)',
                           border:`1px solid ${liveProfit >= 0 ? 'rgba(99,102,241,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
                  <span className="text-xs text-white/40 font-semibold uppercase tracking-wide">Bénéfice estimé</span>
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
                      style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.35)' }}>
                      <Tag className="w-3.5 h-3.5" /> Sauvegarder comme modèle
                    </button>
                  ) : (
                    <div className="rounded-xl p-3 space-y-2.5" style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color:'rgba(255,255,255,0.3)' }}>Nom du modèle</p>
                      <input type="text" placeholder="ex : T-shirt Shein" value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                        className="field-input w-full rounded-xl px-4 py-2.5 text-sm" autoFocus />

                      <div className="flex items-center gap-3">
                        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleTemplateImage} />
                        {templateImage ? (
                          <div className="flex items-center gap-2">
                            <img src={templateImage} className="w-10 h-10 rounded-xl object-cover" style={{ border:'1px solid rgba(99,102,241,0.3)' }} />
                            <button type="button" onClick={() => { setTemplateImage(''); if (imageInputRef.current) imageInputRef.current.value = ''; }}
                              className="text-xs text-white/30 hover:text-red-400 transition">Supprimer</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => imageInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.35)' }}>
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
                          style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)' }}>
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
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in">
          <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)' }} onClick={() => setDeleteId(null)} />
          <div className="animate-scale-in relative rounded-2xl p-6 w-full max-w-sm"
            style={{ background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="font-bold text-white text-base mb-2">Supprimer cette vente ?</h3>
            <p className="text-sm text-white/35 mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white/40 hover:text-white transition"
                style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
                Annuler
              </button>
              <button onClick={() => {
                const id = deleteId;
                setSales(p => p.filter(s => s.id !== id));
                setDeleteId(null);
                supabase.from('sales').delete().eq('id', id);
              }}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition"
                style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in">
          <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)' }} onClick={() => setShowSettings(false)} />
          <div className="animate-scale-in relative rounded-2xl p-6 w-full max-w-sm"
            style={{ background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-white text-base">Réglages</h3>
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/5 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color:'rgba(255,255,255,0.3)' }}>Changer le mot de passe</p>

            <div className="space-y-3">
              <input
                type="password" placeholder="Nouveau mot de passe" value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="field-input w-full rounded-xl px-4 py-3 text-sm"
              />
              <input
                type="password" placeholder="Confirmer le mot de passe" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="field-input w-full rounded-xl px-4 py-3 text-sm"
              />
            </div>

            {settingsError && (
              <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl mt-3"
                style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5' }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{settingsError}
              </div>
            )}
            {settingsSuccess && (
              <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl mt-3"
                style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', color:'#34d399' }}>
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />Mot de passe mis à jour !
              </div>
            )}

            <button
              onClick={async () => {
                if (!newPassword) { setSettingsError('Entre un nouveau mot de passe.'); return; }
                if (newPassword.length < 6) { setSettingsError('Minimum 6 caractères.'); return; }
                if (newPassword !== confirmPassword) { setSettingsError('Les mots de passe ne correspondent pas.'); return; }
                setSettingsError(''); setSettingsLoading(true);
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                setSettingsLoading(false);
                if (error) setSettingsError(error.message);
                else { setSettingsSuccess(true); setNewPassword(''); setConfirmPassword(''); }
              }}
              disabled={settingsLoading}
              className="w-full mt-4 py-3.5 rounded-xl font-bold text-sm text-white transition active:scale-[0.97] disabled:opacity-60"
              style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 18px rgba(99,102,241,0.4)' }}>
              {settingsLoading
                ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : 'Mettre à jour'}
            </button>
          </div>
        </div>
      )}

      {/* ── Toast import ── */}
      {importMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-slide-up flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-white"
          style={{ background:'linear-gradient(135deg,rgba(16,185,129,0.9),rgba(5,150,105,0.9))', boxShadow:'0 8px 24px rgba(16,185,129,0.3)', backdropFilter:'blur(8px)' }}>
          <CheckCircle className="w-4 h-4" />{importMsg}
        </div>
      )}
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const submit = async () => {
    if (!email || !password) { setError('Remplis tous les champs.'); return; }
    setError(''); setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else setSignupDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background:'#0b0c14' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.07]"
          style={{ background:'radial-gradient(ellipse, #6366f1 0%, transparent 70%)', filter:'blur(60px)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 8px 32px rgba(99,102,241,0.45)' }}>
            <ShoppingBag className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Sell<span style={{ background:'linear-gradient(90deg,#6366f1,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Sync</span>
          </h1>
          <p className="text-xs text-white/30 mt-1 font-medium tracking-widest">VINTED ACCOUNTING</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)' }}>
          {signupDone ? (
            <div className="text-center py-4">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">Compte créé !</p>
              <p className="text-white/40 text-sm">Vérifie ta boîte mail pour confirmer, puis connecte-toi.</p>
              <button onClick={() => { setMode('login'); setSignupDone(false); }}
                className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 transition">
                Aller à la connexion
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background:'rgba(255,255,255,0.04)' }}>
                {(['login','signup'] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(''); }}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={mode === m
                      ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
                      : { color:'rgba(255,255,255,0.35)' }}>
                    {m === 'login' ? 'Connexion' : 'Créer un compte'}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <input
                  type="email" placeholder="Email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm"
                />
                <input
                  type="password" placeholder="Mot de passe" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className="field-input w-full rounded-xl px-4 py-3 text-sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl mt-3"
                  style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5' }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </div>
              )}

              <button onClick={submit} disabled={loading}
                className="w-full mt-4 py-3.5 rounded-xl font-bold text-sm text-white transition active:scale-[0.97] disabled:opacity-60"
                style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 4px 18px rgba(99,102,241,0.4)' }}>
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, delta }: {
  label:string; value:string; accent:string; icon:React.ReactNode; delta?:number;
}) {
  return (
    <div className="card rounded-2xl p-3 sm:p-4 animate-fade-slide-up">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <p className="text-[10px] sm:text-[11px] font-semibold text-white/35 uppercase tracking-wider leading-tight">{label}</p>
        <div className="rounded-xl p-1.5 sm:p-2" style={{ background:`${accent}22`, color:accent }}>{icon}</div>
      </div>
      <p className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: delta !== undefined ? (delta >= 0 ? accent : '#f87171') : accent }}>
        {value}
      </p>
    </div>
  );
}

function Pill({ active, onClick, children }: { active:boolean; onClick:()=>void; children:React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
      style={active
        ? { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
        : { background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.35)', border:'1px solid rgba(255,255,255,0.07)' }}>
      {children}
    </button>
  );
}

function FormField({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-widest block mb-1.5"
        style={{ color:'rgba(255,255,255,0.3)' }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ onAdd, label }: { onAdd:()=>void; label?:string }) {
  return (
    <div className="card rounded-3xl p-12 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center animate-float"
        style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)' }}>
        <Sparkles className="w-7 h-7" style={{ color:'#818cf8' }} />
      </div>
      <p className="font-semibold text-white/70 text-sm">{label ?? 'Aucune vente pour l\'instant'}</p>
      <p className="text-white/25 text-xs mt-2">Appuie sur le bouton + pour commencer</p>
    </div>
  );
}
