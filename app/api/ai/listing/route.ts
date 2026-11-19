import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, takeQuota, readJson, fetchAll, failure, aiDeps } from '../../../lib/ai';
import { suggestPrice, guessCategory } from '../../../lib/aiStats';
import { dbToSale } from '../../../lib/sales';
import { dbToPurchase } from '../../../lib/stock';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST { purchase_id } -> { title, description, keywords[], price:{median,low,high,n,profit} }
// Lit l'achat en base (RLS : seulement les siens). Envoyé à l'IA : nom, marque, couleur, taille, photo Shein.
// Jamais de nom d'acheteur, d'adresse ni de mail.

const SYSTEM = `Tu rédiges des annonces Vinted qui se vendent (français).
- "title" : max 60 caractères, marque + type + couleur, sans emoji.
- "description" : 3 à 6 lignes honnêtes (coupe, matière visible, taille, conseil de style), quelques emoji discrets.
- "keywords" : 8 à 12 mots-clés réellement tapés par les acheteurs, minuscules, sans #.
N'invente ni marque ni matière absentes des infos et de la photo.`;

const SCHEMA = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
});

// Seules les photos du CDN Shein (https) sont envoyées : pas de requête vers une adresse arbitraire.
const photoOk = (u: string) => {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)ltwebstatic\.com$/.test(x.hostname); }
  catch { return false; }
};
const UUID = /^[0-9a-f-]{8,64}$/i;

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson(req);
  const id = String(b?.purchase_id ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Article inconnu.' }, { status: 400 });
  try {
    const { data, error } = await auth.db.from('purchases').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Article introuvable.' }, { status: 404 });
    const p = dbToPurchase(data);

    const denied = await takeQuota(auth.db);
    if (denied) return denied;

    const infos = [
      `Article : ${p.article}`,
      p.model && `Marque / série : ${p.model}`,
      p.color && `Couleur : ${p.color}`,
      p.size && `Taille : ${p.size}`,
    ].filter(Boolean).join('\n');
    const text = { type: 'text', text: `${infos}\n\nGénère l'annonce.` };
    const withPhoto = !!p.photoUrl && photoOk(p.photoUrl);
    let ad;
    try {
      ad = await aiDeps.object(SCHEMA, SYSTEM, withPhoto ? [text, { type: 'image', image: new URL(p.photoUrl!) }] : [text]);
    } catch (e) {
      if (!withPhoto) throw e;
      ad = await aiDeps.object(SCHEMA, SYSTEM, [text]); // photo illisible : on réessaie sans
    }

    const sales = (await fetchAll((f, t) => auth.db.from('sales').select('*').range(f, t))).map(dbToSale);
    const price = suggestPrice(sales, guessCategory(p.article), p.size, p.purchasePrice);
    return NextResponse.json({
      title: ad.title.slice(0, 80), description: ad.description,
      keywords: ad.keywords.slice(0, 12), price,
    });
  } catch (e) { return failure(e); }
}
