/**
 * Découpage SANS IA du mail Vinted « La transaction est finalisée ».
 *
 * ⚠️ À VALIDER SUR UN VRAI MAIL : aucun corps de mail réel n'est versionné.
 * Le format est déduit des règles validées au backtest (AUTO-IMPORT-RECAP.md) :
 *  - la VENTE vient du mail « La transaction est finalisée » ; le mail « Ton article s'est vendu »
 *    ne sert qu'à donner la vraie DATE de vente (T-021, voir parseVintedSold + importMail) ;
 *  - prix = montant écrit à côté de « Montant de la commande » ; frais de port ignorés ;
 *  - date jamais inventée : date écrite dans le mail, sinon date de réception Gmail.
 * Les libellés sont cherchés de façon tolérante (deux-points facultatifs, valeur sur la
 * même ligne ou la suivante, variantes de libellé). Si un champ obligatoire (article,
 * montant) manque, on renvoie `ok: false` et l'appelant peut tenter Gemini en secours.
 */

export interface VintedSale {
  article: string;
  size: string;
  color: string;
  price: number; // euros
  date: string; // YYYY-MM-DD
  transactionNumber: string; // '' si absent du mail
}

export type ParseResult =
  | { ok: true; sale: VintedSale }
  | { ok: false; reason: 'not_finalized' | 'missing_fields'; missing?: string[] };

const MONTHS: Record<string, string> = {
  janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12',
};

/** Minuscules, sans accents, espaces insécables normalisés : pour comparer des libellés. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[  ]/g, ' ').toLowerCase();
}

/**
 * Retire les marqueurs d'images du texte brut Gmail (getPlainBody) : « [image: <alt>] », « [image] »,
 * y compris un « [image: … » tronqué sans crochet fermant (jusqu'à la fin de la ligne). T-021.2.
 */
export function stripImageMarkers(s: string): string {
  return s.replace(/\[image(?::[^\]\n]*)?\]?/gi, ' ');
}

/** Textes alternatifs des images (« [image: Robe lilas] » → « Robe lilas »), points de suspension retirés. */
export function imageAlts(s: string): string[] {
  return Array.from(s.matchAll(/\[image:\s*([^\]\n]+)\]?/gi))
    .map((m) => m[1].replace(/\s*(?:…|\.{3})\s*$/, '').trim())
    .filter(Boolean);
}

/** Texte nettoyé : marqueurs d'images retirés, espaces insécables → espaces, lignes rognées, lignes vides retirées. */
export function cleanLines(body: string): string[] {
  return stripImageMarkers(body.replace(/\r/g, ''))
    .replace(/[  ]/g, ' ')
    // Tableaux et titres issus du HTML (« | Montant : | 29,00 € | », « #### ») : une cellule par ligne.
    .replace(/\|/g, '\n')
    .replace(/(^|\s)#{2,6}\s/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Valeur d'un libellé : « Libellé : valeur » sur la même ligne, ou ligne suivante
 * si la ligne ne contient que le libellé (cas fréquent du texte brut tiré du HTML).
 */
export function labelValue(lines: string[], labels: string[]): string {
  // Libellés par ordre de priorité : le premier libellé trouvé gagne, quelle que soit sa ligne.
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      if (!fold(lines[i]).startsWith(label)) continue;
      const rest = lines[i].slice(label.length).replace(/^\s*[:\-–]?\s*/, '').trim();
      if (rest) return rest;
      if (i + 1 < lines.length) return lines[i + 1].trim();
    }
  }
  return '';
}

/** « 29,00 € », « 1 234,50€ », « € 29.00 », « 29 EUR » → 29 / 1234.5. NaN si rien. */
export function parseAmount(raw: string): number {
  const m = raw.replace(/[  ]/g, ' ').match(/(\d{1,3}(?:[ .]\d{3})*|\d+)(?:[.,](\d{1,2}))?/);
  if (!m) return NaN;
  const int = m[1].replace(/[ .]/g, '');
  return Number(`${int}.${m[2] ?? '0'}`);
}

/** Première date écrite dans le texte (JJ/MM/AAAA ou « 18 juillet 2026 »), sinon ''. */
export function findDate(text: string): string {
  const num = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  if (num) {
    const [, d, mo, y] = num;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const lit = fold(text).match(/\b(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (20\d{2})\b/);
  if (lit) return `${lit[3]}-${MONTHS[lit[2]]}-${lit[1].padStart(2, '0')}`;
  return '';
}

export function isFinalizedMail(subject: string, body: string): boolean {
  return /transaction (est )?finalisee/.test(fold(`${subject}\n${body}`));
}

/**
 * @param receivedDate date de réception Gmail (YYYY-MM-DD), utilisée si le corps n'en contient pas.
 */
export function parseVintedFinalized(subject: string, body: string, receivedDate: string): ParseResult {
  if (!isFinalizedMail(subject, body)) return { ok: false, reason: 'not_finalized' };

  const lines = cleanLines(body);
  const text = lines.join('\n');

  // Article : libellé explicite, sinon tournure « l'article « X » » / « pour X est finalisée ».
  let article = labelValue(lines, ['nom de l\'article', 'article']);
  if (!article || /^\d/.test(article)) {
    const q = text.match(/article\s*[«"“]\s*([^»"”\n]+?)\s*[»"”]/i)
      ?? text.match(/transaction (?:pour|de|concernant) (?:l['’]article )?[«"“]?\s*([^»"”\n]+?)\s*[»"”]?\s+est finalis/i)
      // Format réel (mail du 11/11/2026) : « La vente de <article> a été réalisée avec succès. »
      ?? text.match(/la vente de\s+(.+?)\s+a (?:été|ete) réalisée/i);
    article = q ? q[1].trim() : '';
  }

  const size = labelValue(lines, ['taille']).split(/[·|,]/)[0].trim()
    || (article.match(/\btaille\s+(\S+)/i)?.[1] ?? '');
  const color = labelValue(lines, ['couleur']).split(/[·|,]/)[0].trim();

  const amountRaw = labelValue(lines, ['montant de la commande', 'montant total de la commande']);
  const price = parseAmount(amountRaw);

  const txRaw =
    labelValue(lines, ['numero de transaction', 'n° de transaction', 'n° transaction', 'id de transaction', 'numero de commande', 'n° de commande'])
    || (fold(text).match(/transaction\s*(?:n°|no|#)\s*:?\s*(\d{6,})/)?.[1] ?? '')
    || (fold(text).match(/n° de transaction\s*:?\s*#?\s*(\d{6,})/)?.[1] ?? '');
  const transactionNumber = txRaw.match(/\d{6,}/)?.[0] ?? '';

  const date = findDate(text) || receivedDate;

  const missing: string[] = [];
  if (!article) missing.push('article');
  if (!Number.isFinite(price) || price <= 0) missing.push('montant');
  if (missing.length) return { ok: false, reason: 'missing_fields', missing };

  return { ok: true, sale: { article, size, color, price, date, transactionNumber } };
}

// ── « Ton article s'est vendu » (T-021) : donne la vraie date de vente ──

export interface VintedSoldNotice {
  article: string;
  size: string;
  price: number | null; // prix écrit dans le mail (« <article> 24,00 € »), null si absent
  date: string; // YYYY-MM-DD = date du mail (réception Gmail)
}

export type SoldParseResult =
  | { ok: true; notice: VintedSoldNotice }
  | { ok: false; reason: 'not_sold' | 'missing_fields'; missing?: string[] };

export function isSoldMail(subject: string, body: string): boolean {
  if (isFinalizedMail(subject, body)) return false;
  return /s['’]est vendu|a ete vendu|vient d['’]etre vendu/.test(fold(`${subject}\n${body}`));
}

/**
 * Clé de rapprochement d'un article entre « s'est vendu » et « transaction finalisée » :
 * minuscules, sans accents, sans ponctuation ni espaces multiples.
 */
export function articleKey(article: string): string {
  return fold(article).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Format validé sur un vrai mail « Ton article s'est vendu ! » du 10/11/2026 (« X a acheté | <article> <prix> € »).
 * La date retenue est TOUJOURS la date du mail (réception), pas une date du corps.
 */
export function parseVintedSold(subject: string, body: string, receivedDate: string): SoldParseResult {
  if (!isSoldMail(subject, body)) return { ok: false, reason: 'not_sold' };
  const lines = cleanLines(body);
  const text = `${subject}\n${lines.join('\n')}`;

  let article = labelValue(lines, ["nom de l'article", 'article']);
  if (!article || /^\d/.test(article) || /s['’]est vendu/i.test(article)) {
    const q =
      text.match(/(?:ton|votre) article\s*[«"“]\s*([^»"”\n]+?)\s*[»"”]/i)
      ?? text.match(/(?:ton|votre) article\s+(.+?)\s+(?:s['’]est vendu|a été vendu|vient d['’]être vendu)/i)
      ?? text.match(/(?:a acheté|vient d['’]acheter)\s+(?:ton article\s+)?[«"“]?\s*([^»"”\n]+?)\s*[»"”]?\s*(?:[.!]|$)/im)
      ?? text.match(/[«"“]\s*([^»"”\n]{3,})\s*[»"”]/);
    article = q ? q[1].trim() : '';
  }
  // Format réel (mail du 10/11/2026) : « <article> 24,00 € » sur la même cellule → on retire le prix final.
  article = article.replace(/\s*[.!]+$/, '');
  const priceMatch = article.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)\s*€\s*$/);
  const price = priceMatch ? parseAmount(priceMatch[1]) : NaN;
  article = article.replace(/(?:^|\s+)\d+(?:[.,]\d{1,2})?\s*€\s*$/, '').trim();
  // Article seulement dans le texte alternatif de la photo (« [image: Robe lilas lumina Taille L] ») : on le reprend.
  if (!article) {
    const after = body.search(/a achet|vient d['’]achet/i);
    article = imageAlts(after >= 0 ? body.slice(after) : body)[0] ?? '';
  }
  const size = labelValue(lines, ['taille']).split(/[·|,]/)[0].trim()
    || (article.match(/\btaille\s+(\S+)/i)?.[1] ?? '');

  if (!article) return { ok: false, reason: 'missing_fields', missing: ['article'] };
  const notice = { article, size, price: Number.isFinite(price) && price > 0 ? price : null, date: receivedDate };
  return { ok: true, notice };
}
