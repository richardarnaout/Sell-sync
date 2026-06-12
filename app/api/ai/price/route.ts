import { NextRequest, NextResponse } from 'next/server';
import { getClient, MODEL, textOf, profitOf, type SaleLike } from '../../../lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `Tu es expert en pricing sur Vinted.
On te donne un article que le vendeur veut mettre en vente, ainsi que SON historique de ventes passées (avec prix d'achat, prix de vente, bénéfice). Tu proposes un prix de vente optimal.

Méthode :
- Cherche dans l'historique les ventes COMPARABLES (même catégorie, taille proche, article similaire) et appuie-toi dessus en priorité.
- Vise le bon équilibre : trop cher = l'article stagne ; trop bas = marge perdue.
- Si peu/pas de comparables, dis-le et donne une estimation prudente basée sur les marges habituelles du vendeur.

Sortie :
- "suggested" : prix de vente conseillé en euros (nombre).
- "min" / "max" : fourchette raisonnable en euros (nombres).
- "reasoning" : 2 à 4 phrases en français qui justifient le prix en citant les ventes comparables réelles (chiffres).`;

const SCHEMA = {
  type: 'object',
  properties: {
    suggested: { type: 'number' },
    min: { type: 'number' },
    max: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['suggested', 'min', 'max', 'reasoning'],
  additionalProperties: false,
} as const;

const MAX_SALES = 500;
const str = (v: unknown, max = 100) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const article = str(b?.article, 200);
    if (!article) {
      return NextResponse.json({ error: "Indique au moins l'article." }, { status: 400 });
    }
    const raw: unknown[] = Array.isArray(b?.sales) ? b.sales.slice(0, MAX_SALES) : [];
    const sales: SaleLike[] = raw.map((s: any) => ({
      date: str(s?.date, 10),
      article: str(s?.article, 150),
      category: str(s?.category, 50),
      size: str(s?.size, 20),
      purchasePrice: num(s?.purchasePrice),
      salePrice: num(s?.salePrice),
      shippingCost: num(s?.shippingCost),
      boosterCost: num(s?.boosterCost),
    }));
    const history = sales.map((s) => ({
      article: s.article,
      cat: s.category,
      taille: s.size,
      achat: s.purchasePrice,
      vente: s.salePrice,
      benefice: Number(profitOf(s).toFixed(2)),
    }));

    const purchasePrice = b?.purchasePrice !== undefined ? num(b.purchasePrice) : null;
    const target = [
      `Article à vendre : ${article}`,
      b?.category ? `Catégorie : ${str(b.category, 50)}` : null,
      b?.size ? `Taille : ${str(b.size, 20)}` : null,
      b?.brand ? `Marque : ${str(b.brand, 100)}` : null,
      b?.condition ? `État : ${str(b.condition, 50)}` : null,
      purchasePrice !== null ? `Prix d'achat : ${purchasePrice} €` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const client = getClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `${target}\n\nMon historique de ventes (JSON) :\n${JSON.stringify(history)}\n\nQuel prix de vente conseilles-tu ?`,
        },
      ],
    });

    const parsed = JSON.parse(textOf(msg.content));
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
