'use client';

import { ShoppingBag, AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// ── Auth Screen ───────────────────────────────────────────────────────────

export default function AuthScreen() {
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
