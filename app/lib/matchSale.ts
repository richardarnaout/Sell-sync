/**
 * Rapprochement PRUDENT entre un mail Vinted « Ton article s'est vendu » (vraie date de vente)
 * et le mail « La transaction est finalisée » du même article (T-021.2).
 *
 * Les titres diffèrent souvent un peu entre les deux mails (« Robe lumina » / « Robe lilas lumina Taille L »),
 * d'où un score au lieu d'une égalité de clé. Règle de Khaled : AUCUNE liaison automatique fausse.
 * Un couple n'est retenu que si :
 *  - l'avis « s'est vendu » est daté au plus tard le jour du « finalisée », et au plus 30 jours avant ;
 *  - les tailles ne se contredisent pas, les prix non plus (quand les deux sont connus) ;
 *  - les mots significatifs du titre le plus court se retrouvent (≥ 80 %) dans l'autre ;
 *  - au moins 2 mots communs, ou 1 mot commun + même taille ou même prix.
 * Et on ne rattache que s'il y a UN SEUL candidat retenu (dans les deux sens) ; sinon on ne fait rien
 * et la vente garde date_approx = true.
 * Les mêmes règles sont reprises en SQL dans supabase/rattrapage-2026-11-18.sql.
 */
import { fold, stripImageMarkers } from './parseVinted';

export const MAX_GAP_DAYS = 30;
const MIN_COVERAGE = 0.8;

/** Mots sans valeur pour reconnaître un article (articles, prépositions, « taille », « robe »…). */
const STOP = new Set([
  'taille', 'robe', 'la', 'le', 'les', 'de', 'du', 'des', 'et', 'en', 'au', 'aux', 'un', 'une',
  'pour', 'avec', 'sans', 'sur', 'tres', 'neuf', 'neuve', 'femme', 'homme', 'fille', 'garcon', 'marque',
]);
/** Mots qui sont des tailles (traitées à part) : XS, M, XL, 3XL, 38, TU… */
const SIZE_WORD = /^(?:x{0,3}s|m|x{0,4}l|\d?xl|tu|unique|\d+)$/;

export interface MatchSide {
  article: string;
  size?: string | null;
  price?: number | null;
  date: string; // YYYY-MM-DD
}

/** Mots significatifs : minuscules sans accents, sans tailles ni mots vides, pluriel simple retiré. */
export function matchTokens(article: string): Set<string> {
  const out = new Set<string>();
  for (let w of fold(stripImageMarkers(article)).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')) {
    if (w.length < 3 || STOP.has(w) || SIZE_WORD.test(w)) continue;
    if (w.length > 4 && /[sx]$/.test(w)) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

/** Taille normalisée : champ taille, sinon « taille X » dans le titre. « M / 38 » → « M ». '' si inconnue. */
export function matchSize(side: Pick<MatchSide, 'article' | 'size'>): string {
  const raw = (side.size ?? '').trim() || (side.article.match(/\btaille\s*:?\s*([^\s,;]+)/i)?.[1] ?? '');
  return fold(raw).replace(/^taille\s+/, '').split(/[\/(]/)[0].trim().toUpperCase();
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

const knownPrice = (p: number | null | undefined): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0;

/**
 * Score du couple (vente finalisée, avis « s'est vendu ») ; null = couple refusé.
 * Plus le score est haut, plus le couple est sûr ; mais seul compte le fait qu'il n'y ait qu'un candidat.
 */
export function matchScore(sale: MatchSide, notice: MatchSide): number | null {
  const gap = days(notice.date, sale.date);
  if (!Number.isFinite(gap) || gap < 0 || gap > MAX_GAP_DAYS) return null;

  const sa = matchSize(sale);
  const sn = matchSize(notice);
  if (sa && sn && sa !== sn) return null;
  const sameSize = !!sa && sa === sn;

  const bothPrices = knownPrice(sale.price) && knownPrice(notice.price);
  if (bothPrices && Math.abs((sale.price as number) - (notice.price as number)) > 0.005) return null;
  const samePrice = bothPrices;

  const a = matchTokens(sale.article);
  const b = matchTokens(notice.article);
  if (!a.size || !b.size) return null;
  let common = 0;
  a.forEach((w) => { if (b.has(w)) common++; });
  const coverage = common / Math.min(a.size, b.size);
  if (common === 0 || coverage < MIN_COVERAGE) return null;
  if (common < 2 && !sameSize && !samePrice) return null;

  return common * 2 + coverage + (sameSize ? 1 : 0) + (samePrice ? 1 : 0);
}

/** Le seul candidat retenu, ou null s'il n'y en a aucun ou plusieurs (cas ambigu → pas de rattachement). */
export function uniqueMatch<T>(candidates: T[], score: (c: T) => number | null): T | null {
  const kept = candidates.filter((c) => score(c) !== null);
  return kept.length === 1 ? kept[0] : null;
}

/** Fenêtre de dates d'un avis possible pour une vente datée `saleDate` : [saleDate − 30 j, saleDate]. */
export function noticeWindow(saleDate: string): { from: string; to: string } {
  return { from: shift(saleDate, -MAX_GAP_DAYS), to: saleDate };
}

/** Fenêtre de dates d'une vente possible pour un avis daté `noticeDate` : [noticeDate, noticeDate + 30 j]. */
export function saleWindow(noticeDate: string): { from: string; to: string } {
  return { from: noticeDate, to: shift(noticeDate, MAX_GAP_DAYS) };
}

function shift(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
