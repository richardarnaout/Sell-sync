import { NextRequest, NextResponse } from 'next/server';
import { importMail, resolveUserId, secretFromHeaders, secretMatches, type ImportDeps, type MailInput } from '../../../lib/importMail';
import { createAdminSupabase } from '../../../lib/supabaseAdmin';
import { extractFromEmail } from '../../../lib/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook appelé par l'Apps Script de chaque Gmail (apps-script/Code.gs).
 * POST { account, messageId, subject, body, receivedDate, html?, from? }  + en-tête x-import-secret.
 * Vinted finalisée → `pending_sales` ; Vinted « s'est vendu » → `vinted_sold_notices` (vraie date) ;
 * Shein confirmation → `purchases` (une ligne par unité). Anti-doublon par contraintes uniques
 * (supabase/import-mail.sql puis supabase/achats-shein.sql).
 * Réponses 200 : inserted | duplicate | ignored (le script pose alors le libellé SellSync).
 * 422 = mail non reconnu (le script ne pose pas le libellé et réessaiera) ; noté dans `mail_rejects`
 * (supabase/mails-non-reconnus.sql) pour l'encart « Mails à vérifier » de l'app.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.IMPORT_SECRET;
  if (!expected) return NextResponse.json({ error: 'IMPORT_SECRET non configuré' }, { status: 500 });
  if (!secretMatches(secretFromHeaders(req.headers), expected)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const mail: MailInput = {
    account: str(b?.account),
    messageId: str(b?.messageId),
    subject: str(b?.subject).slice(0, 500),
    body: str(b?.body).slice(0, 50000),
    html: str(b?.html).slice(0, 400000),
    from: str(b?.from).slice(0, 300),
    receivedDate: /^\d{4}-\d{2}-\d{2}$/.test(str(b?.receivedDate)) ? str(b.receivedDate) : new Date().toISOString().slice(0, 10),
  };
  if (!mail.account || !mail.body.trim()) {
    return NextResponse.json({ error: 'Champs "account" et "body" obligatoires' }, { status: 400 });
  }

  const userId = resolveUserId(mail.account, process.env);
  if (!userId) return NextResponse.json({ error: `Aucun utilisateur SellSync pour ${mail.account}` }, { status: 403 });

  const deps: ImportDeps = {
    // Client créé seulement au moment d'écrire (un mail ignoré ne touche pas la base).
    insertPending: async (row) => {
      const { error } = await createAdminSupabase().from('pending_sales').insert(row);
      if (!error) return 'inserted';
      if (error.code === '23505') return 'duplicate';
      throw new Error(error.message);
    },
    findSoldNotice: async (userId, articleKey, onOrBefore) => {
      const { data, error } = await createAdminSupabase().from('vinted_sold_notices')
        .select('id, date').eq('user_id', userId).eq('article_key', articleKey).eq('used', false)
        .lte('date', onOrBefore).order('date', { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      return data && data[0] ? { id: data[0].id, date: data[0].date } : null;
    },
    markNoticeUsed: async (id) => {
      const { error } = await createAdminSupabase().from('vinted_sold_notices').update({ used: true }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    insertSoldNotice: async (row) => {
      const { data, error } = await createAdminSupabase().from('vinted_sold_notices').insert(row).select('id');
      if (!error) return { status: 'inserted', id: data?.[0]?.id };
      if (error.code === '23505') return { status: 'duplicate' };
      throw new Error(error.message);
    },
    fixPendingDate: async (userId, articleKey, date) => {
      const db = createAdminSupabase();
      const { data, error } = await db.from('pending_sales').select('id')
        .eq('user_id', userId).eq('article_key', articleKey).eq('date_approx', true).eq('status', 'en_attente')
        .gte('date', date).order('date', { ascending: true }).limit(1);
      if (error) throw new Error(error.message);
      if (!data || !data[0]) return false;
      const up = await db.from('pending_sales').update({ date, date_approx: false }).eq('id', data[0].id);
      if (up.error) throw new Error(up.error.message);
      return true;
    },
    insertPurchase: async (row) => {
      const { error } = await createAdminSupabase().from('purchases').insert(row);
      if (!error) return 'inserted';
      if (error.code === '23505') return 'duplicate';
      throw new Error(error.message);
    },
    // Mail non reconnu (422) → table mail_rejects (supabase/mails-non-reconnus.sql), visible dans l'app.
    recordUnparsed: async (row) => {
      const { error } = await createAdminSupabase().rpc('noter_mail_rejete', {
        p_user_id: row.user_id, p_fingerprint: row.mail_fingerprint, p_account: row.source_account,
        p_subject: row.subject, p_received: row.received_date, p_reason: row.reason, p_missing: row.missing,
      });
      if (error) throw new Error(error.message);
    },
    aiFallback: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? async (subject, body, receivedDate) => {
          const r = await extractFromEmail(subject, body, receivedDate);
          const it = r.kind === 'vente' ? r.items[0] : undefined;
          if (!it || !it.article || !(it.price > 0)) return null;
          return {
            article: it.article, size: it.size ?? '', color: it.color ?? '', price: it.price,
            date: r.date ?? receivedDate, transactionNumber: (r.orderNumber ?? '').match(/\d{6,}/)?.[0] ?? '',
          };
        }
      : undefined,
  };

  try {
    const out = await importMail(mail, userId, deps);
    return NextResponse.json(out, { status: out.status === 'unparsed' ? 422 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inattendue' }, { status: 502 });
  }
}
