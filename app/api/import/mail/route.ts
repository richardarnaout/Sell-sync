import { NextRequest, NextResponse } from 'next/server';
import { importMail, resolveUserId, secretFromHeaders, secretMatches, type ImportDeps, type MailInput } from '../../../lib/importMail';
import { createAdminSupabase } from '../../../lib/supabaseAdmin';
import { extractFromEmail } from '../../../lib/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook appelé par l'Apps Script de chaque Gmail (apps-script/Code.gs).
 * POST { account, messageId, subject, body, receivedDate, html?, from?, hint? }  + en-tête x-import-secret.
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
    hint: str(b?.hint).slice(0, 20),
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
    // Rapprochement « s'est vendu » ↔ « finalisée » : la base donne les candidats, matchSale.ts décide (T-021.2).
    listSoldNotices: async (userId, from, to) => {
      const db = createAdminSupabase();
      let r: { data: any[] | null; error: { message: string } | null } = await db.from('vinted_sold_notices')
        .select('id, date, article, size, price').eq('user_id', userId).eq('used', false)
        .gte('date', from).lte('date', to).limit(200);
      // Colonne price absente (rattrapage-2026-11-18.sql pas encore passé) : on relit sans elle.
      if (r.error && /price/.test(r.error.message)) {
        r = await db.from('vinted_sold_notices').select('id, date, article, size').eq('user_id', userId).eq('used', false)
          .gte('date', from).lte('date', to).limit(200);
      }
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []).map((n) => ({ id: n.id, date: n.date, article: n.article, size: n.size, price: n.price == null ? null : Number(n.price) }));
    },
    listApproxPending: async (userId, from, to) => {
      const { data, error } = await createAdminSupabase().from('pending_sales')
        .select('id, date, article, size, sale_price').eq('user_id', userId).eq('date_approx', true).eq('status', 'en_attente')
        .gte('date', from).lte('date', to).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({ id: p.id, date: p.date, article: p.article, size: p.size, sale_price: p.sale_price == null ? null : Number(p.sale_price) }));
    },
    markNoticeUsed: async (id) => {
      const { error } = await createAdminSupabase().from('vinted_sold_notices').update({ used: true }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    insertSoldNotice: async (row) => {
      const db = createAdminSupabase();
      let { data, error } = await db.from('vinted_sold_notices').insert(row).select('id');
      // Colonne price absente (rattrapage-2026-11-18.sql pas encore passé) : on insère sans le prix.
      if (error && /price/.test(error.message)) {
        const { price: _price, ...sansPrix } = row;
        ({ data, error } = await db.from('vinted_sold_notices').insert(sansPrix).select('id'));
      }
      if (!error) return { status: 'inserted', id: data?.[0]?.id };
      if (error.code === '23505') return { status: 'duplicate' };
      throw new Error(error.message);
    },
    setPendingDate: async (pendingId, date) => {
      const { data, error } = await createAdminSupabase().from('pending_sales').update({ date, date_approx: false })
        .eq('id', pendingId).eq('date_approx', true).eq('status', 'en_attente').select('id');
      if (error) throw new Error(error.message);
      return !!data && data.length > 0;
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
