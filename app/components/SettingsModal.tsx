'use client';

import { X, AlertCircle, CheckCircle, Upload, Download, LogOut } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Réglages : changement de mot de passe. L'état vit dans la page via useSettings (comme avant).
export function useSettings() {
  const [showSettings, setShowSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const open = () => { setShowSettings(true); setSettingsError(''); setSettingsSuccess(false); setNewPassword(''); setConfirmPassword(''); };
  return {
    showSettings, setShowSettings, newPassword, setNewPassword, confirmPassword, setConfirmPassword,
    settingsError, setSettingsError, settingsSuccess, setSettingsSuccess, settingsLoading, setSettingsLoading, open,
  };
}

export default function SettingsModal({ s, onImportCSV, onExportCSV, canExport }: {
  s: ReturnType<typeof useSettings>; onImportCSV: () => void; onExportCSV: () => void; canExport: boolean;
}) {
  const {
    setShowSettings, newPassword, setNewPassword, confirmPassword, setConfirmPassword,
    settingsError, setSettingsError, settingsSuccess, setSettingsSuccess, settingsLoading, setSettingsLoading,
  } = s;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 animate-fade-in">
      <div className="absolute inset-0" style={{ background:'rgba(0,0,0,0.8)', backdropFilter:'blur(4px)' }} onClick={() => setShowSettings(false)} />
      <div className="animate-slide-up sm:animate-scale-in relative rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom:'max(1.5rem, env(safe-area-inset-bottom))', background:'#0f1120', border:'1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-white text-base">Réglages</h3>
          <button onClick={() => setShowSettings(false)} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-white/55 hover:text-white/70 hover:bg-white/5 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'rgba(255,255,255,0.6)' }}>Données</p>
        <div className="flex gap-2 mb-6">
          <button onClick={onImportCSV}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold text-white/70 hover:text-white"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <Upload className="w-3.5 h-3.5" />Importer CSV
          </button>
          {canExport && (
            <button onClick={onExportCSV}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold text-white/70 hover:text-white"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <Download className="w-3.5 h-3.5" />Exporter CSV
            </button>
          )}
        </div>

        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color:'rgba(255,255,255,0.6)' }}>Changer le mot de passe</p>

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

        <button onClick={() => supabase.auth.signOut()}
          className="w-full mt-3 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-sm font-semibold text-white/50 hover:text-white/80"
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
          <LogOut className="w-4 h-4" />Se déconnecter
        </button>
      </div>
    </div>
  );
}
