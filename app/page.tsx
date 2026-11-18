'use client';

// Page principale : état, chargement Supabase et assemblage des écrans.
// T-022.8 : l'affichage est dans app/components/, les calculs dans app/lib/ (stats.ts, sales.ts, dashboard.ts).
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabaseClient';
import { CheckCircle } from 'lucide-react';
import StockView, { type StockFilter } from './components/StockView';
import TodayView from './components/TodayView';
import AuthScreen from './components/AuthScreen';
import AppNav, { type Tab } from './components/AppNav';
import SalesList, { type SalesFilter } from './components/SalesList';
import Analyse from './components/Analyse';
import SaleForm from './components/SaleForm';
import DeleteConfirm from './components/DeleteConfirm';
import SettingsModal, { useSettings } from './components/SettingsModal';
import { Purchase, PendingSale, dbToPurchase, dbToPending } from './lib/stock';
import { Sale, Template, today, saleToDb, dbToSale, dbToTemplate, parseSalesCSV, salesToCSV } from './lib/sales';
import { useSalesStats } from './lib/useSalesStats';
import { useSaleForm } from './lib/useSaleForm';

// ── Main ──────────────────────────────────────────────────────────────────

export default function VintedAI() {
  const [sales, setSales]         = useState<Sale[]>([]);
  const [mounted, setMounted]     = useState(false);
  const [tab, setTab]             = useState<Tab>('aujourdhui');
  const [salesFilter, setSalesFilter] = useState<SalesFilter>('tout');
  const [stockFilter, setStockFilter] = useState<StockFilter>('stock');
  const [purchases, setPurchases]   = useState<Purchase[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [goalMonth, setGoalMonth]         = useState<string>('');
  const [templates, setTemplates]       = useState<Template[]>([]);
  const csvInputRef   = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const settings = useSettings();

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

  const loadData = useCallback(async () => {
    if (!user) { setSales([]); setTemplates([]); setPurchases([]); setPendingSales([]); setMounted(false); return; }
    const [{ data: salesData }, { data: templatesData }, purchasesRes, pendingRes] = await Promise.all([
      supabase.from('sales').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('templates').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      // Les tables auto-import peuvent ne pas exister encore (migration SQL non passée) → on avale l'erreur.
      supabase.from('purchases').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('pending_sales').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    ]);
    setSales(salesData ? salesData.map(dbToSale) : []);
    setTemplates(templatesData ? templatesData.map(dbToTemplate) : []);
    setPurchases(purchasesRes.data ? purchasesRes.data.map(dbToPurchase) : []);
    setPendingSales(pendingRes.data ? pendingRes.data.map(dbToPending) : []);
    setMounted(true);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Données dérivées (cartes, analyse, objectif) ──
  const st = useSalesStats(sales, purchases, selectedMonth);

  // ── Formulaire de vente + modèles ──
  const sf = useSaleForm({ sales, setSales, templates, setTemplates, user, setImportMsg });
  const { openForm, openEdit } = sf;

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const imported = parseSalesCSV(text);
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

  const exportCSV = () => {
    const blob = new Blob([salesToCSV(sales)], { type:'text/csv;charset=utf-8;' });
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

      <AppNav tab={tab} setTab={setTab} openForm={openForm} onOpenSettings={settings.open}
        toLink={pendingSales.filter(p => p.status === 'en_attente').length} />
      <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />

      <div className="relative w-full px-4 sm:px-6 lg:px-10 pb-36 md:pb-16 md:pl-[15.5rem] lg:pl-[16.5rem] md:pt-6">

        {/* ════════════════ AUJOURD'HUI (accueil) ════════════════ */}
        {tab === 'aujourdhui' && (
          <TodayView userId={user.id} sales={sales} purchases={purchases} pendingSales={pendingSales} st={st}
            onChange={loadData} openEdit={openEdit}
            goStock={() => { setStockFilter('vieux'); setTab('stock'); }} />
        )}

        {/* ════════════════ VENTES ════════════════ */}
        {tab === 'ventes' && (
          <SalesList sales={sales} byMonthDesc={st.byMonthDesc} selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth} openForm={openForm} openEdit={openEdit} setDeleteId={setDeleteId}
            filter={salesFilter} setFilter={setSalesFilter} />
        )}

        {/* ════════════════ STOCK ════════════════ */}
        {tab === 'stock' && (
          <div className="animate-fade-in">
            <StockView userId={user.id} purchases={purchases} onChange={loadData} filter={stockFilter} setFilter={setStockFilter} />
          </div>
        )}

        {/* ════════════════ ANALYSE ════════════════ */}
        {tab === 'analyse' && (
          <Analyse sales={sales} st={st} goalMonth={goalMonth} setGoalMonth={setGoalMonth}
            selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
            onEmptyAdd={() => { setTab('ventes'); openForm(); }} />
        )}
      </div>

      {/* ── Form sheet ── */}
      {sf.showForm && <SaleForm f={sf} />}

      {/* ── Delete confirm ── */}
      {deleteId && <DeleteConfirm deleteId={deleteId} setDeleteId={setDeleteId} sales={sales} setSales={setSales} />}

      {/* ── Settings modal ── */}
      {settings.showSettings && <SettingsModal s={settings} canExport={sales.length > 0} onExportCSV={exportCSV}
        onImportCSV={() => csvInputRef.current?.click()} />}

      {/* ── Toast import ── */}
      {importMsg && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-slide-up flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-white"
          style={{ background:'linear-gradient(135deg,rgba(16,185,129,0.9),rgba(5,150,105,0.9))', boxShadow:'0 8px 24px rgba(16,185,129,0.3)', backdropFilter:'blur(8px)' }}>
          <CheckCircle className="w-4 h-4" />{importMsg}
        </div>
      )}
    </div>
  );
}
