import { createHash, timingSafeEqual } from 'crypto';
import { parseVintedFinalized, isFinalizedMail, isSoldMail, parseVintedSold, articleKey, type VintedSale } from './parseVinted';
import { parseSheinOrder, isSheinOrderMail, type SheinOrder } from './parseShein';
import { matchScore, uniqueMatch, noticeWindow, saleWindow, type MatchSide } from './matchSale';

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
  hint?: string; // recherche Gmail qui a trouvé le mail ('vendu' | 'finalise' | 'shein'), facultatif
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
  price: number | null; // prix lu dans le mail « s'est vendu » (colonne ajoutée par rattrapage-2026-11-18.sql)
  mail_fingerprint: string;
  source_account: string;
}

/** Avis « s'est vendu » non encore rattaché, candidat au rapprochement. */
export interface NoticeCandidate {
  id: string;
  date: string;
  article: string;
  size: string | null;
  price: number | null;
}

/** Vente en attente à date approximative, candidate au rapprochement. */
export interface PendingCandidate {
  id: string;
  date: string;
  article: string;
  size: string | null;
  sale_price: number | null;
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
  /** Avis « s'est vendu » non utilisés (used = false) datés entre `from` et `to` inclus. */
  listSoldNotices?: (userId: string, from: string, to: string) => Promise<NoticeCandidate[]>;
  markNoticeUsed?: (id: string) => Promise<void>;
  insertSoldNotice?: (row: SoldNoticeRow) => Promise<{ status: 'inserted' | 'duplicate'; id?: string }>;
  /** Ventes en attente avec date_approx = true datées entre `from` et `to` inclus. */
  listApproxPending?: (userId: string, from: string, to: string) => Promise<PendingCandidate[]>;
  /** Cas inverse (« finalisée » traité avant « s'est vendu ») : pose la vraie date (seulement si encore approximative). */
  setPendingDate?: (pendingId: string, date: string) => Promise<boolean>;
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
  // Shein d'abord : une confirmation de commande Shein (expéditeur / sujet explicites) ne doit jamais
  // être prise pour un mail Vinted à cause d'un mot du corps.
  if (isSheinOrderMail(m.subject, m.body, m.from)) return 'shein_order';
  if (isFinalizedMail(m.subject, m.body)) return 'vinted_finalized';
  if (isSoldMail(m.subject, m.body)) return 'vinted_sold';
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
  // Trouvé par la recherche Gmail Shein mais pas reconnu : 422 (noté dans « Mails à vérifier »), pas ignoré en silence.
  if (!kind && m.hint === 'shein') return { status: 'unparsed', reason: 'mail Shein non reconnu comme confirmation de commande' };
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

  // Date de vente = date du mail « s'est vendu » du même article (rapprochement prudent, matchSale.ts) ;
  // à défaut ou en cas de doute, date du « finalisée » (date_approx = true).
  const key = articleKey(sale.article);
  const notice = await findNoticeFor(userId, { article: sale.article, size: sale.size, price: sale.price, date: sale.date }, deps);
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
    user_id: userId, date: n.date, article: n.article, article_key: key, size: n.size || null, price: n.price,
    mail_fingerprint: mailFingerprint(m), source_account: m.account.toLowerCase(),
  });
  let fixedPending = false;
  if (r.status === 'inserted' && r.id && deps.setPendingDate) {
    const pending = await findPendingFor(userId, { id: r.id, date: n.date, article: n.article, size: n.size || null, price: n.price }, deps);
    if (pending) fixedPending = await deps.setPendingDate(pending.id, n.date);
    if (fixedPending && deps.markNoticeUsed) await deps.markNoticeUsed(r.id);
  }
  return { status: r.status, kind: 'vinted_sold', date: n.date, fixedPending };
}

const pendingSide = (p: PendingCandidate): MatchSide => ({ article: p.article, size: p.size, price: p.sale_price, date: p.date });

/**
 * Avis « s'est vendu » d'une vente finalisée : un seul candidat retenu, et cet avis ne doit pas
 * convenir aussi à une autre vente en attente approximative (sinon : doute → rien).
 */
async function findNoticeFor(userId: string, sale: MatchSide, deps: ImportDeps): Promise<NoticeCandidate | null> {
  if (!deps.listSoldNotices) return null;
  const w = noticeWindow(sale.date);
  const notice = uniqueMatch(await deps.listSoldNotices(userId, w.from, w.to), (n) => matchScore(sale, n));
  if (!notice) return null;
  if (deps.listApproxPending) {
    const sw = saleWindow(notice.date);
    const others = (await deps.listApproxPending(userId, sw.from, sw.to)).filter((p) => matchScore(pendingSide(p), notice) !== null);
    if (others.length) return null;
  }
  return notice;
}

/**
 * Cas inverse : vente approximative d'un avis qui arrive après le « finalisée ». Une seule vente retenue,
 * et elle ne doit convenir à aucun autre avis non utilisé.
 */
async function findPendingFor(userId: string, notice: NoticeCandidate, deps: ImportDeps): Promise<PendingCandidate | null> {
  if (!deps.listApproxPending) return null;
  const w = saleWindow(notice.date);
  const pending = uniqueMatch(await deps.listApproxPending(userId, w.from, w.to), (p) => matchScore(pendingSide(p), notice));
  if (!pending) return null;
  if (deps.listSoldNotices) {
    const nw = noticeWindow(pending.date);
    const others = (await deps.listSoldNotices(userId, nw.from, nw.to))
      .filter((n) => n.id !== notice.id && matchScore(pendingSide(pending), n) !== null);
    if (others.length) return null;
  }
  return pending;
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
