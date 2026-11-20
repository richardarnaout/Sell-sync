// T-034.1 — Jeu de données fictif du mode démo (seul fichier de données démo).
// Format = lignes de base (snake_case), comme renvoyées par Supabase. Dates relatives à aujourd'hui
// pour que « ventes sur 3 mois », « invendus > 60 j » et « ventes du jour » restent vrais dans le temps.
// Photos : public/demo/*.svg, produites par scripts/demo-images.mjs (aucun service externe).
// Marqueur cherché dans le build de production par verif:demo (doit en être absent) : SELLSYNC_DEMO_DATA

export const DEMO_MARKER = 'SELLSYNC_DEMO_DATA';
export const DEMO_USER = { id: '00000000-0000-4000-8000-00000000d3e0', email: 'demo@sellsync.local' };

const U = DEMO_USER.id;
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const pid = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const photo = (name: string) => `/demo/${name}.svg`;

type Row = Record<string, any>;

function purchase(n: number, o: {
  ago: number; article: string; model?: string; color?: string; size?: string; price: number;
  photo?: string; status?: 'en_stock' | 'vendu' | 'ignore'; order?: string; unit?: number; sheinUrl?: string;
}): Row {
  return {
    id: pid(n), user_id: U, date: daysAgo(o.ago), article: o.article, model: o.model ?? '',
    color: o.color ?? '', size: o.size ?? '', purchase_price: o.price,
    sku: o.order ? `sz2411${String(n).padStart(4, '0')}` : '', order_number: o.order ?? '',
    status: o.status ?? 'en_stock', photo_url: o.photo ?? null, shein_url: o.sheinUrl ?? null,
    unit_index: o.unit ?? 1, source_account: o.order ? 'achats.demo@gmail.com' : null,
    created_at: daysAgo(o.ago) + 'T09:00:00Z',
  };
}

// 16 achats : 14 avec photo (dont 4 vendus), 1 sans photo, 1 au lien de photo cassé.
export const DEMO_PURCHASES: Row[] = [
  purchase(1,  { ago: 2,   article: 'Robe longue noire fendue à bretelles fines et dos nu', model: 'SHEIN Privé', color: 'Noir', size: 'M', price: 14.99, photo: photo('robe-01'), order: 'GSUNJ24A001' }),
  purchase(2,  { ago: 2,   article: 'Robe midi rouge portefeuille', model: 'Rafferiza', color: 'Rouge', size: 'S', price: 12.5, photo: photo('robe-02'), order: 'GSUNJ24A001' }),
  purchase(3,  { ago: 9,   article: 'Robe blanche brodée manches bouffantes', model: 'SHEIN Frenchy', color: 'Blanc', size: 'XS', price: 17.2, photo: photo('robe-03'), order: 'GSUNJ24B002' }),
  purchase(4,  { ago: 9,   article: 'Robe satinée verte col bénitier', model: 'SHEIN Modely', color: 'Vert', size: 'L', price: 19.9, photo: photo('robe-04'), order: 'GSUNJ24B002' }),
  purchase(5,  { ago: 21,  article: 'Robe bleue plissée', model: 'Unadoll', color: 'Bleu', size: '38', price: 11.0, photo: photo('robe-05'), order: 'GSUNJ24C003' }),
  purchase(6,  { ago: 21,  article: 'Robe rose à volants', model: 'SHEIN Petite', color: 'Rose', size: 'XXL', price: 13.4, photo: photo('robe-06'), order: 'GSUNJ24C003', unit: 1 }),
  purchase(7,  { ago: 21,  article: 'Robe rose à volants', model: 'SHEIN Petite', color: 'Rose', size: 'XXL', price: 13.4, photo: photo('robe-06'), order: 'GSUNJ24C003', unit: 2 }),
  purchase(8,  { ago: 40,  article: 'Top jaune côtelé', model: 'SHEIN EZwear', color: 'Jaune', size: 'S', price: 4.5, photo: photo('haut-01'), order: 'GSUNJ24D004' }),
  purchase(9,  { ago: 75,  article: 'Chemise violette oversize en satin avec boutons nacrés et poignets larges', model: 'SHEIN BAE', color: 'Violet', size: 'M / 38 / 10', price: 9.9, photo: photo('haut-02'), order: 'GSUNJ24E005' }),
  purchase(10, { ago: 95,  article: 'Jupe trapèze camel', model: 'Rafferiza', color: 'Camel', size: '40', price: 8.0, photo: photo('jupe-01'), order: 'GSUNJ24F006' }),
  // Vendus (ventes rattachées plus bas)
  purchase(11, { ago: 50,  article: 'Pull turquoise maille fine', model: 'SHEIN Basics', color: 'Turquoise', size: 'M', price: 7.3, photo: photo('haut-03'), order: 'GSUNJ24G007', status: 'vendu' }),
  purchase(12, { ago: 60,  article: 'Jupe midi grise plissée', model: 'Unadoll', color: 'Gris', size: '36', price: 10.2, photo: photo('jupe-02'), order: 'GSUNJ24G007', status: 'vendu' }),
  purchase(13, { ago: 70,  article: 'Ensemble deux pièces framboise', model: 'SHEIN SXY', color: 'Framboise', size: 'L', price: 15.6, photo: photo('ensemble-01'), order: 'GSUNJ24H008', status: 'vendu' }),
  purchase(14, { ago: 80,  article: 'Manteau long taupe', model: 'SHEIN Frenchy', color: 'Taupe', size: 'XL', price: 24.9, photo: photo('manteau-01'), order: 'GSUNJ24H008', status: 'vendu' }),
  // Cas limites
  purchase(15, { ago: 5,   article: 'Robe lilas ajoutée à la main (sans photo)', color: 'Lilas', size: 'Unique', price: 6.0 }),
  purchase(16, { ago: 12,  article: 'Robe violette au lien de photo cassé', model: 'SHEIN Curve', color: 'Violet', size: '4XL', price: 16.0, photo: '/demo/introuvable.jpg', order: 'GSUNJ24I009' }),
];

function sale(id: string, o: {
  ago: number; article: string; category?: string; size?: string; pp: number; sp: number;
  ship?: number; boost?: number; perso?: boolean; url?: string;
}): Row {
  return {
    id, user_id: U, date: daysAgo(o.ago), article: o.article, category: o.category ?? 'Autre',
    size: o.size ?? '', purchase_price: o.pp, sale_price: o.sp, shipping_cost: o.ship ?? 0,
    booster_cost: o.boost ?? 0, product_url: o.url ?? null, is_personal: !!o.perso,
    created_at: daysAgo(o.ago) + 'T18:00:00Z',
  };
}

// 20 ventes sur 3 mois : 4 rattachées aux achats vendus, 2 perso, le reste saisi à la main.
export const DEMO_SALES: Row[] = [
  // Ventes des 4 achats vendus (2 au format « achat-<id> », 2 au format ancien rattachement)
  sale(`achat-${pid(11)}`, { ago: 3,  article: 'SHEIN Basics — Pull turquoise maille fine', category: 'Hauts', size: 'M', pp: 7.3, sp: 18 }),
  sale(`achat-${pid(12)}`, { ago: 15, article: 'Unadoll — Jupe midi grise plissée', category: 'Bas', size: '36', pp: 10.2, sp: 22 }),
  sale('9b0c7a1e-demo-4c11-9d0e-000000000013', { ago: 33, article: 'SHEIN SXY — Ensemble deux pièces framboise', category: 'Robes', size: 'L', pp: 15.6, sp: 30, boost: 1.5 }),
  sale('9b0c7a1e-demo-4c11-9d0e-000000000014', { ago: 61, article: 'SHEIN Frenchy — Manteau long taupe', category: 'Manteaux', size: 'XL', pp: 24.9, sp: 45, ship: 2.5 }),
  // Perso
  sale('perso-0001', { ago: 6,  article: 'Sac à main cuir (perso)', category: 'Accessoires', pp: 0, sp: 25, perso: true }),
  sale('perso-0002', { ago: 48, article: 'Baskets blanches portées (perso)', category: 'Chaussures', size: '39', pp: 0, sp: 20, perso: true }),
  // Saisies à la main
  sale('vente-0001', { ago: 0,  article: 'Robe d\'été fleurie à fines bretelles, longueur cheville, très légère', category: 'Robes', size: 'S', pp: 9, sp: 21 }),
  sale('vente-0002', { ago: 1,  article: 'Jean droit taille haute', category: 'Bas', size: '38', pp: 8, sp: 19 }),
  sale('vente-0003', { ago: 4,  article: 'Blazer beige', category: 'Manteaux', size: 'M', pp: 14, sp: 32 }),
  sale('vente-0004', { ago: 8,  article: 'Top dentelle noir', category: 'Hauts', size: 'XS', pp: 3.5, sp: 10 }),
  sale('vente-0005', { ago: 11, article: 'Robe pull grise', category: 'Robes', size: 'L', pp: 11, sp: 9 }),
  sale('vente-0006', { ago: 19, article: 'Jupe en jean', category: 'Bas', size: '36', pp: 0, sp: 14 }),
  sale('vente-0007', { ago: 26, article: 'Cardigan crème', category: 'Hauts', size: 'M', pp: 6, sp: 16 }),
  sale('vente-0008', { ago: 37, article: 'Robe de soirée bleu nuit', category: 'Robes', size: '40', pp: 18, sp: 38, ship: 1 }),
  sale('vente-0009', { ago: 44, article: 'Legging sport', category: 'Sport', size: 'S', pp: 4, sp: 9 }),
  sale('vente-0010', { ago: 52, article: 'Chemise rayée', category: 'Hauts', size: 'L', pp: 5, sp: 13 }),
  sale('vente-0011', { ago: 66, article: 'Doudoune courte', category: 'Manteaux', size: 'M', pp: 20, sp: 35 }),
  sale('vente-0012', { ago: 72, article: 'Robe chemise kaki', category: 'Robes', size: '38', pp: 10, sp: 24 }),
  sale('vente-0013', { ago: 79, article: 'Pantalon large noir', category: 'Bas', size: '42', pp: 9, sp: 17 }),
  sale('vente-0014', { ago: 86, article: 'Bottines', category: 'Chaussures', size: '38', pp: 12, sp: 28 }),
];

// Ventes Vinted détectées (ancien flux de liaison, affiché par l'interface « avant » T-034.3).
export const DEMO_PENDING: Row[] = [
  { id: '00000000-0000-4000-8000-000000000201', user_id: U, date: daysAgo(1), article: 'Robe midi rouge portefeuille', color: 'Rouge', size: 'S', sale_price: 24, transaction_number: '1234567001', status: 'en_attente', date_approx: false, rejected_purchase_ids: [], created_at: daysAgo(1) + 'T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000202', user_id: U, date: daysAgo(2), article: 'Robe rose à volants', color: 'Rose', size: 'XXL', sale_price: 19, transaction_number: '1234567002', status: 'en_attente', date_approx: true, rejected_purchase_ids: [], created_at: daysAgo(2) + 'T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000203', user_id: U, date: daysAgo(4), article: 'Veste en jean vintage', color: '', size: 'M', sale_price: 15, transaction_number: '1234567003', status: 'en_attente', date_approx: false, rejected_purchase_ids: [], created_at: daysAgo(4) + 'T10:00:00Z' },
];

export const DEMO_TEMPLATES: Row[] = [
  { id: 'tpl-0001', user_id: U, name: 'Robe Shein standard', category: 'Robes', size: 'M', purchase_price: 12, shipping_cost: 0, booster_cost: 0, image: null, product_url: null, created_at: daysAgo(100) + 'T08:00:00Z' },
  { id: 'tpl-0002', user_id: U, name: 'Top basique', category: 'Hauts', size: 'S', purchase_price: 4, shipping_cost: 0, booster_cost: 0, image: null, product_url: null, created_at: daysAgo(90) + 'T08:00:00Z' },
];

// 1 mail Shein à vérifier.
export const DEMO_MAIL_REJECTS: Row[] = [
  { id: '00000000-0000-4000-8000-000000000301', user_id: U, subject: 'Votre commande SHEIN GSUNJ24Z999 a été expédiée', source_account: 'achats.demo@gmail.com', received_date: daysAgo(1), reason: 'commande Shein non découpée', missing: ['articles'], attempts: 2, status: 'a_verifier', last_seen_at: daysAgo(1) + 'T07:00:00Z' },
];

/** Copie neuve des tables (le client démo travaille sur une copie, jamais sur ces constantes). */
export function demoTables(): Record<string, Row[]> {
  const copy = (rows: Row[]) => rows.map((r) => JSON.parse(JSON.stringify(r)));
  return {
    purchases: copy(DEMO_PURCHASES), sales: copy(DEMO_SALES), pending_sales: copy(DEMO_PENDING),
    templates: copy(DEMO_TEMPLATES), mail_rejects: copy(DEMO_MAIL_REJECTS),
    vinted_sold_notices: [], ai_usage: [], ai_cache: [],
  };
}
