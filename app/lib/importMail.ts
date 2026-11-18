import { createHash, timingSafeEqual } from 'crypto';
import { parseVintedFinalized, isFinalizedMail, isSoldMail, parseVintedSold, articleKey, type VintedSale } from './parseVinted';
import { parseSheinOrder, isSheinOrderMail, type SheinOrder } from './parseShein';

/**
 * Logique du webhook, sans dépendance réseau. Trois sortes de mails :
 *  - Vinted « transaction finalisée » → vente en attente (pending_sales) ;
 *  - Vinted « Ton article s'est vendu » → avis de vente (vinted_sold_notices) qui fixe la vraie date ;
 *  - Shein « Confirmation de votre commande » → stock (purchases), une ligne par unité.
 * la base et Gemini sont injectés (`deps`), ce qui permet de la tester avec des faux.
 */

export interface MailInput {
  account: string; // adresse Gmail qui a reçu le mail
  messageId: string; // id Gmail du message (stable) ; peut être vide
  subject: string;
  body: string; // texte brut du mail
  receivedDate: string; // YYYY-MM-DD
  html?: string; // HTML du mail (Shein seulement : photos)
  from?: string; // expéditeur
}

export interface PendingRow {
  user_id: string;
  date: string;
  article: string;
  color: string | null;
  size: string | null;
  sale_price: number;
  transaction_number: string | null;
  mail_fingerprint: string;
  source_account: string;
  status: 'en_attente';
  article_key: string;
  date_approx: boolean; // true = pas de mail « s'est vendu » trouvé : date du « finalisée »
}

export interface SoldNoticeRow {
  user_id: string;
  date: string; // date du mail « s'est vendu » = vraie date de vente
  article: string;
  article_key: string;
  size: string | null;
  mail_fingerprint: string;
  source_account: string;
}

export interface PurchaseRow {
  user_id: string;
  date: string;
  article: string;
  model: string | null;
  color: string | null;
  size: string | null;
  purchase_price: number;
  sku: string;
  order_number: string;
  unit_index: number; // 1..quantité : une ligne par unité (anti-doublon user+commande+SKU+unité)
  photo_url: string | null;
  source_account: string;
  status: 'en_stock';
}

export interface UnparsedRow {
  user_id: string;
  mail_fingerprint: string;
  source_account: string;
  subject: string;
  received_date: string;
  reason: string;
  missing: string[] | null;
}

export interface ImportDeps {
  /** Insère une ligne ; renvoie 'duplicate' si une contrainte unique refuse (code Postgres 23505). */
  insertPending: (row: PendingRow) => Promise<'inserted' | 'duplicate'>;
  /** Avis « s'est vendu » non utilisé, même article, daté au plus tard `onOrBefore` (le plus récent). */
  findSoldNotice?: (userId: string, articleKey: string, onOrBefore: string) => Promise<{ id: string; date: string } | null>;
  markNoticeUsed?: (id: string) => Promise<void>;
  insertSoldNotice?: (row: SoldNoticeRow) => Promise<{ status: 'inserted' | 'duplicate'; id?: string }>;
  /** Cas inverse (« finalisée » traité avant « s'est vendu ») : corrige la date d'une vente approximative. */
  fixPendingDate?: (userId: string, articleKey: string, date: string) => Promise<boolean>;
  insertPurchase?: (row: PurchaseRow) => Promise<'inserted' | 'duplicate'>;
  /** Note un mail non reconnu (422) pour l'encart « à vérifier » de l'app. Un échec ici ne change pas la réponse. */
  recordUnparsed?: (row: UnparsedRow) => Promise<void>;
  /** Secours Gemini, absent si la clé n'est pas configurée. */
  aiFallback?: (subject: string, body: string, receivedDate: string) => Promise<VintedSale | null>;
}

export type ImportOutcome =
  | { status: 'inserted' | 'duplicate'; via: 'parser' | 'gemini'; sale: VintedSale; dateApprox: boolean }
  | { status: 'inserted' | 'duplicate'; kind: 'vinted_sold'; date: string; fixedPending: boolean }
  | { status: 'inserted' | 'duplicate'; kind: 'shein_order'; order: SheinOrder; inserted: number; duplicates: number }
  | { status: 'ignored'; reason: string }
  | { status: 'unparsed'; reason: string; missing?: string[] };

/** Compare deux secrets en temps constant. */
export function secretMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lit le secret dans « x-import-secret » ou « Authorization: Bearer … ». */
export function secretFromHeaders(h: { get(name: string): string | null }): string | null {
  const direct = h.get('x-import-secret');
  if (direct) return direct.trim();
  const auth = h.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

/**
 * Correspondance adresse Gmail → user_id SellSync.
 * IMPORT_USER_MAP = JSON {"adresse@gmail.com":"uuid", ...} ; sinon IMPORT_USER_ID pour toutes les adresses.
 */
export function resolveUserId(account: string, env: Record<string, string | undefined>): string | null {
  const key = account.trim().toLowerCase();
  if (env.IMPORT_USER_MAP) {
    try {
      const map = JSON.parse(env.IMPORT_USER_MAP) as Record<string, string>;
      for (const [mail, id] of Object.entries(map)) if (mail.trim().toLowerCase() === key) return id;
    } catch {
      /* JSON invalide : on retombe sur IMPORT_USER_ID */
    }
  }
  return env.IMPORT_USER_ID || null;
}

/** Empreinte stable du mail : compte + id Gmail, ou compte + contenu si l'id manque. */
export function mailFingerprint(m: MailInput): string {
  const basis = m.messageId
    ? `${m.account.toLowerCase()}|${m.messageId}`
    : `${m.account.toLowerCase()}|${m.subject}|${m.body}`;
  return createHash('sha256').update(basis).digest('hex');
}

export type MailKind = 'vinted_finalized' | 'vinted_sold' | 'shein_order' | null;

export function detectKind(m: Pick<MailInput, 'subject' | 'body' | 'from'>): MailKind {
  if (isFinalizedMail(m.subject, m.body)) return 'vinted_finalized';
  if (isSoldMail(m.subject, m.body)) return 'vinted_sold';
  if (isSheinOrderMail(m.subject, m.body, m.from)) return 'shein_order';
  return null;
}

export async function importMail(m: MailInput, userId: string, deps: ImportDeps): Promise<ImportOutcome> {
  const out = await importByKind(m, userId, deps);
  if (out.status === 'unparsed' && deps.recordUnparsed) {
    try {
      await deps.recordUnparsed({
        user_id: userId,
        mail_fingerprint: mailFingerprint(m),
        source_account: m.account.toLowerCase(),
        subject: m.subject.slice(0, 300),
        received_date: m.receivedDate,
        reason: out.reason,
        missing: out.missing ?? null,
      });
    } catch (e) {
      // Table absente ou base indisponible : le mail reste en 422, l'Apps Script réessaiera.
      console.error('mail non reconnu non noté :', e instanceof Error ? e.message : e);
    }
  }
  return out;
}

async function importByKind(m: MailInput, userId: string, deps: ImportDeps): Promise<ImportOutcome> {
  const kind = detectKind(m);
  if (kind === 'vinted_sold') return importSold(m, userId, deps);
  if (kind === 'shein_order') return importShein(m, userId, deps);
  if (kind !== 'vinted_finalized') return { status: 'ignored', reason: 'mail non reconnu (ni Vinted finalisée / vendu, ni commande Shein)' };

  let via: 'parser' | 'gemini' = 'parser';
  let sale: VintedSale | null = null;
  const parsed = parseVintedFinalized(m.subject, m.body, m.receivedDate);
  if (parsed.ok) {
    sale = parsed.sale;
  } else if (deps.aiFallback) {
    sale = await deps.aiFallback(m.subject, m.body, m.receivedDate);
    via = 'gemini';
  }
  if (!sale) {
    return {
      status: 'unparsed',
      reason: deps.aiFallback ? 'parseur et Gemini en échec' : 'parseur en échec, Gemini non configuré',
      missing: parsed.ok ? undefined : parsed.missing,
    };
  }

  // Date de vente = date du mail « s'est vendu » du même article ; à défaut, date du « finalisée » (approx).
  const key = articleKey(sale.article);
  const notice = deps.findSoldNotice ? await deps.findSoldNotice(userId, key, sale.date) : null;
  const date = notice?.date ?? sale.date;

  const status = await deps.insertPending({
    user_id: userId,
    date,
    article: sale.article,
    color: sale.color || null,
    size: sale.size || null,
    sale_price: sale.price,
    transaction_number: sale.transactionNumber || null,
    mail_fingerprint: mailFingerprint(m),
    source_account: m.account.toLowerCase(),
    status: 'en_attente',
    article_key: key,
    date_approx: !notice,
  });
  if (status === 'inserted' && notice && deps.markNoticeUsed) await deps.markNoticeUsed(notice.id);
  return { status, via, sale: { ...sale, date }, dateApprox: !notice };
}

async function importSold(m: MailInput, userId: string, deps: ImportDeps): Promise<ImportOutcome> {
  if (!deps.insertSoldNotice) return { status: 'ignored', reason: "avis « s'est vendu » non géré" };
  const parsed = parseVintedSold(m.subject, m.body, m.receivedDate);
  if (!parsed.ok) return { status: 'unparsed', reason: "mail « s'est vendu » non découpé", missing: parsed.missing };
  const n = parsed.notice;
  const key = articleKey(n.article);
  const r = await deps.insertSoldNotice({
    user_id: userId, date: n.date, article: n.article, article_key: key, size: n.size || null,
    mail_fingerprint: mailFingerprint(m), source_account: m.account.toLowerCase(),
  });
  let fixedPending = false;
  if (r.status === 'inserted' && deps.fixPendingDate) {
    fixedPending = await deps.fixPendingDate(userId, key, n.date);
    if (fixedPending && r.id && deps.markNoticeUsed) await deps.markNoticeUsed(r.id);
  }
  return { status: r.status, kind: 'vinted_sold', date: n.date, fixedPending };
}

async function importShein(m: MailInput, userId: string, deps: ImportDeps): Promise<ImportOutcome> {
  if (!deps.insertPurchase) return { status: 'ignored', reason: 'commandes Shein non gérées' };
  const parsed = parseSheinOrder(m.subject, m.body, m.receivedDate, m.html ?? '', m.from ?? '');
  if (!parsed.ok) return { status: 'unparsed', reason: 'commande Shein non découpée', missing: parsed.missing };
  const o = parsed.order;
  let inserted = 0;
  let duplicates = 0;
  for (const it of o.items) {
    for (let u = 1; u <= it.quantity; u++) {
      const r = await deps.insertPurchase({
        user_id: userId, date: o.date, article: it.article || it.name, model: it.model || null,
        color: it.color || null, size: it.size || null, purchase_price: it.unitPrice,
        sku: it.sku, order_number: o.orderNumber, unit_index: u, photo_url: it.photoUrl || null,
        source_account: m.account.toLowerCase(), status: 'en_stock',
      });
      if (r === 'inserted') inserted++;
      else duplicates++;
    }
  }
  return { status: inserted ? 'inserted' : 'duplicate', kind: 'shein_order', order: o, inserted, duplicates };
}
