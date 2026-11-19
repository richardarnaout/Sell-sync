'use client';

import type { Dispatch, SetStateAction } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Sale } from '../lib/sales';

// Confirmation de suppression d'une vente (retour arrière si la base refuse).
export default function DeleteConfirm({ deleteId, setDeleteId, sales, setSales }: {
  deleteId: string; setDeleteId: (id: string | null) => void;
  sales: Sale[]; setSales: Dispatch<SetStateAction<Sale[]>>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 animate-fade-in">
      <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)' }} onClick={() => setDeleteId(null)} />
      <div className="animate-slide-up sm:animate-scale-in relative rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm"
        style={{ paddingBottom:'max(1.5rem, env(safe-area-inset-bottom))', background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)' }}>
        <h3 className="font-bold text-white text-base mb-2">Supprimer cette vente ?</h3>
        <p className="text-sm text-white/55 mb-6">Cette action est irréversible.</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteId(null)}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-white/60 hover:text-white transition"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
            Annuler
          </button>
          <button onClick={async () => {
            const id = deleteId;
            const removed = sales.find(s => s.id === id);
            setSales(p => p.filter(s => s.id !== id));
            setDeleteId(null);
            const { data, error } = await supabase.from('sales').delete().eq('id', id).select();
            if (error || !data || data.length === 0) {
              if (removed) setSales(p => [removed, ...p].sort((a, b) => b.date.localeCompare(a.date)));
              alert(
                error
                  ? 'Suppression impossible : ' + error.message
                  : "Suppression bloquée par la base (policy RLS DELETE manquante sur la table « sales »). Ajoute-la dans Supabase.",
              );
            }
          }}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition"
            style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', color:'#fca5a5' }}>
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
