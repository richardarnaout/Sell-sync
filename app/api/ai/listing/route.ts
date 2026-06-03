import { NextRequest, NextResponse } from 'next/server';
import { getClient, MODEL, textOf } from '../../../lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `Tu es expert en rédaction d'annonces Vinted qui se vendent.
À partir d'un article décrit par le vendeur, tu génères une annonce optimisée pour le MOTEUR DE RECHERCHE Vinted et pour convaincre l'acheteur.

Règles :
- Français.
- "title" : titre court et accrocheur (max ~60 caractères), avec marque + type + couleur/matière si connus. Pas d'emoji dans le titre.
- "description" : 3 à 6 lignes vendeuses et honnêtes — état, matière, coupe/taille, conseils de style, mention "envoi rapide / vendeur sérieux". Tu peux utiliser quelques emoji discrets.
- "keywords" : 8 à 12 mots-clés que les acheteurs tapent réellement (marque, type, style, occasions, synonymes). Minuscules, sans #.
- N'invente PAS de marque ou de matière non fournie : reste générique si l'info manque.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'description', 'keywords'],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const article = (b?.article ?? '').toString().trim();
    if (!article) {
      return NextResponse.json({ error: "Indique au moins l'article." }, { status: 400 });
    }
    const details = [
      `Article : ${article}`,
      b?.category ? `Catégorie : ${b.category}` : null,
      b?.size ? `Taille : ${b.size}` : null,
      b?.brand ? `Marque : ${b.brand}` : null,
      b?.condition ? `État : ${b.condition}` : null,
      b?.extra ? `Infos : ${b.extra}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const client = getClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${details}\n\nGénère l'annonce.` }],
    });

    const parsed = JSON.parse(textOf(msg.content));
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
