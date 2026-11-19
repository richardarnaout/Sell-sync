'use client';
import { useEffect, useState } from 'react';
import { MailWarning, Check } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

/**
 * Encart « Mails à vérifier » : mails que l'import automatique n'a pas su lire (webhook en 422),
 * notés dans `mail_rejects` (supabase/mails-non-reconnus.sql). Tant que la table n'existe pas
 * en base, l'encart reste simplement caché.
 */
interface MailReject {
  id: string;
  subject: string | null;
  source_account: string | null;
  received_date: string | null;
  reason: string;
  missing: string[] | null;
  attempts: number;
}

export default function MailsAVerifier({ userId, refreshKey }: { userId: string; refreshKey?: unknown }) {
  const [mails, setMails] = useState<MailReject[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('mail_rejects')
      .select('id, subject, source_account, received_date, reason, missing, attempts')
      .eq('user_id', userId).eq('status', 'a_verifier')
      .order('last_seen_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!alive) return;
        setMails(error ? [] : ((data ?? []) as MailReject[])); // table absente → rien à afficher
      });
    return () => { alive = false; };
  }, [userId, refreshKey]);

  async function markSeen(id: string) {
    setBusy(id); setErr('');
    try {
      const r = await supabase.from('mail_rejects').update({ status: 'vu' }).eq('id', id);
      if (r.error) throw r.error;
      setMails((m) => m.filter((x) => x.id !== id));
    } catch (e: any) { setErr(e?.message || 'Erreur.'); }
    finally { setBusy(null); }
  }

  if (mails.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <div className="px-4 sm:px-5 py-3 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.12)' }}>
        <MailWarning className="w-4 h-4 text-amber-300" />
        <span className="text-sm font-bold text-white">
          {mails.length} mail{mails.length > 1 ? 's' : ''} à vérifier — non importé{mails.length > 1 ? 's' : ''}, à saisir à la main
        </span>
      </div>
      <div className="p-3 sm:p-4 space-y-2">
        {err && <p className="text-xs text-red-300 px-1">{err}</p>}
        {mails.map((m) => (
          <div key={m.id} className="p-3 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="min-w-0 flex-1 break-words">
              <p className="text-sm font-semibold text-white">{m.subject || '(sans objet)'}</p>
              <p className="text-xs text-white/50 mt-0.5">
                {m.received_date ? `reçu le ${m.received_date}` : 'date inconnue'}
                {m.source_account ? ` · ${m.source_account}` : ''}
                {m.attempts > 1 ? ` · ${m.attempts} essais` : ''}
              </p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                {m.reason}{m.missing && m.missing.length ? ` (manque : ${m.missing.join(', ')})` : ''}
              </p>
            </div>
            <button onClick={() => markSeen(m.id)} disabled={busy === m.id} title="Retirer de la liste"
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg font-semibold text-sm text-white/60 hover:text-white transition-all disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Check className="w-3.5 h-3.5" /> Vu
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
