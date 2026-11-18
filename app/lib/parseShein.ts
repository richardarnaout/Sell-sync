/**
 * Découpage SANS IA du mail Shein « Confirmation de votre commande » (T-021).
 * Format réel (17/11/2026, noreply@sheinnotice.com), texte brut Gmail, cellules séparées par « | » :
 *   Numéro de commande: GSO1AT280000AW1
 *   Date de paiement : 17 Nov 2026
 *   <nom de l'article> SKU: sz24… TAILLE: Gris pâle-XL QTÉ: 1 Prix unitaire: 57.41€
 * Plusieurs articles possibles (un bloc « SKU / TAILLE / QTÉ / Prix unitaire » par article).
 * « TAILLE » = « couleur-taille ». Les photos ne sont que dans le HTML (img.ltwebstatic.com/…/pi/…),
 * dans l'ordre des articles.
 */
import { cleanLines, fold, labelValue, parseAmount, findDate } from './parseVinted';

export interface SheinItem {
  name: string; // nom complet tel qu'écrit par Shein
  model: string; // « SHEIN EZwear », « SHEIN » ou '' : sert au titre Vinted
  article: string; // nom sans le modèle
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number; // euros
  photoUrl: string; // '' si le HTML n'a pas été transmis
}

export interface SheinOrder {
  orderNumber: string;
  date: string; // YYYY-MM-DD
  items: SheinItem[];
}

export type SheinParseResult =
  | { ok: true; order: SheinOrder }
  | { ok: false; reason: 'not_shein_order' | 'missing_fields'; missing?: string[] };

const SHORT_MONTHS: Record<string, string> = {
  jan: '01', janv: '01', janvier: '01', feb: '02', fev: '02', fevr: '02', fevrier: '02',
  mar: '03', mars: '03', apr: '04', avr: '04', avril: '04', may: '05', mai: '05',
  jun: '06', juin: '06', jul: '07', juil: '07', juillet: '07', aug: '08', aou: '08', aout: '08',
  sep: '09', sept: '09', septembre: '09', oct: '10', octobre: '10', nov: '11', novembre: '11',
  dec: '12', decembre: '12',
};

/** « 17 Nov 2026 », « 3 déc. 2026 », « 17/11/2026 » → YYYY-MM-DD, sinon ''. */
export function parseSheinDate(raw: string): string {
  const m = fold(raw).match(/\b(\d{1,2})\s+([a-z]+)\.?\s+(20\d{2})\b/);
  if (m && SHORT_MONTHS[m[2]]) return `${m[3]}-${SHORT_MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
  return findDate(raw);
}

export function isSheinOrderMail(subject: string, body: string, from = ''): boolean {
  const f = fold(`${subject}\n${body}`);
  const sheinish = /shein/.test(fold(from)) || /shein/.test(f);
  return sheinish && /confirmation de (votre|ta) commande/.test(f) && /sku\s*:/.test(f);
}

/** URLs des photos produits dans le HTML, dans l'ordre, sans doublons. */
export function sheinPhotos(html: string): string[] {
  const urls = (html.replace(/&amp;/g, '&').match(/(?:https?:)?\/\/img\.ltwebstatic\.com\/[^"'\s)<>]*\/pi\/[^"'\s)<>]+/g) ?? [])
    .map((u) => (u.startsWith('//') ? `https:${u}` : u));
  return Array.from(new Set(urls));
}

/** « SHEIN EZwear Manteau… » → modèle « SHEIN EZwear » ; « SHEIN Manteau… » → « SHEIN ». */
function splitModel(name: string): { model: string; article: string } {
  const m = name.match(/^(SHEIN)\s+(\S+)\s+(.+)$/);
  if (!m) return { model: '', article: name };
  // Sous-marque = mot en casse mixte ou tout en capitales (EZwear, PETITE, LUNE…), pas un nom commun.
  const sub = m[2];
  if (/^[A-Z0-9]{2,}$/.test(sub) || /^[A-Za-z]+[A-Z][a-z]*$/.test(sub) && /[A-Z]/.test(sub.slice(1))) {
    return { model: `SHEIN ${sub}`, article: m[3] };
  }
  return { model: 'SHEIN', article: `${sub} ${m[3]}` };
}

/** « Gris pâle-XL » → couleur « Gris pâle », taille « XL » (dernier tiret). Sans tiret : taille seule. */
export function splitColorSize(raw: string): { color: string; size: string } {
  const v = raw.trim();
  const i = v.lastIndexOf('-');
  if (i <= 0) return { color: '', size: v };
  return { color: v.slice(0, i).trim(), size: v.slice(i + 1).trim() };
}

/**
 * @param html HTML du mail (facultatif) : seulement pour les photos.
 * @param receivedDate date de réception Gmail, utilisée si le mail n'a pas de date lisible.
 */
export function parseSheinOrder(subject: string, body: string, receivedDate: string, html = '', from = ''): SheinParseResult {
  if (!isSheinOrderMail(subject, body, from)) return { ok: false, reason: 'not_shein_order' };
  const lines = cleanLines(body);
  const text = lines.join('\n');

  const orderNumber =
    labelValue(lines, ['numero de commande', 'n° de commande']).match(/[A-Z0-9]{8,}/i)?.[0]
    ?? fold(text).match(/numero de commande\s*:?\s*([a-z0-9]{8,})/)?.[1]?.toUpperCase()
    ?? '';
  const date = parseSheinDate(labelValue(lines, ['date de paiement', 'date de commande'])) || receivedDate;

  const photos = sheinPhotos(html);
  const skuRe = /SKU\s*:\s*([A-Za-z0-9]+)/gi;
  const hits = Array.from(text.matchAll(skuRe));
  const items: SheinItem[] = hits.map((hit, k) => {
    const start = hit.index ?? 0;
    const end = k + 1 < hits.length ? (hits[k + 1].index ?? text.length) : text.length;
    const seg = text.slice(start, end).replace(/\n/g, ' ');

    // Nom : texte avant « SKU: » sur la même ligne, sinon la ligne précédente.
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let name = text.slice(lineStart, start).trim();
    if (!name) {
      const prev = text.slice(0, Math.max(0, lineStart - 1)).split('\n');
      name = (prev[prev.length - 1] ?? '').trim();
    }
    const tailleRaw = seg.match(/TAILLE\s*:\s*(.+?)\s*(?=QT[ÉEée]\s*:|Prix unitaire|$)/i)?.[1] ?? '';
    const qty = Number(seg.match(/QT[ÉEée]\s*:\s*(\d+)/i)?.[1] ?? '1') || 1;
    const unitPrice = parseAmount(seg.match(/Prix unitaire\s*:\s*([^A-Za-z]*?\d[\d\s.,]*)/i)?.[1] ?? '');
    const { color, size } = splitColorSize(tailleRaw);
    const { model, article } = splitModel(name);
    return {
      name, model, article, sku: hit[1], color, size, quantity: qty,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : NaN, photoUrl: photos[k] ?? '',
    };
  });

  const missing: string[] = [];
  if (!orderNumber) missing.push('numéro de commande');
  if (!items.length) missing.push('articles');
  if (items.some((it) => !it.name || !Number.isFinite(it.unitPrice))) missing.push('nom ou prix d\'un article');
  if (missing.length) return { ok: false, reason: 'missing_fields', missing };
  return { ok: true, order: { orderNumber, date, items } };
}
