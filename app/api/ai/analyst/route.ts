import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, MODEL_ANALYST, profitOf, type SaleLike } from '../../../lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `Tu es un coach expert de la revente sur Vinted (vêtements et accessoires d'occasion).
On te donne l'historique de ventes RÉELLES d'un vendeur (catégorie, taille, prix d'achat, prix de vente, frais, bénéfice net). Ton rôle : produire une analyse stratégique courte, concrète et actionnable, pour l'aider à VENDRE PLUS et à GAGNER PLUS.

Règles :
- Réponds en français, ton direct et bienveillant, tutoiement.
- Base TOUTES tes affirmations sur les données fournies (cite des chiffres réels). N'invente rien.
- Sois concret : dis quoi sourcer, quoi éviter, à quel prix, dans quelles tailles/catégories.
- Pas de blabla. Va droit au but.

Format de sortie (texte brut, pas de Markdown lourd, utilise ces sections avec emoji) :

💪 Ce qui marche
- 2 à 4 puces (catégories/tailles/articles les plus rentables ou qui partent vite), avec chiffres.

⚠️ Ce qui freine
- 2 à 3 puces (ce qui rapporte peu, marges faibles, à arrêter ou ajuster).

🎯 Quoi sourcer en priorité
- 3 puces : catégorie + taille + fourchette de prix d'achat conseillée, justifiées par les données.

🚀 Pour vendre plus
- 2 à 3 conseils actionnables (prix, timing, renouvellement d'annonces, lots…).

Garde l'ensemble sous ~300 mots.`;

const MAX_SALES = 500;
const str = (v: unknown, max = 100) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw: unknown[] = Array.isArray(body?.sales) ? body.sales.slice(0, MAX_SALES) : [];
    if (raw.length === 0) {
      return NextResponse.json(
        { error: 'Ajoute au moins quelques ventes avant de lancer une analyse.' },
        { status: 400 },
      );
    }

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

    const data = sales.map((s) => ({
      date: s.date,
      article: s.article,
      cat: s.category,
      taille: s.size,
      achat: s.purchasePrice,
      vente: s.salePrice,
      frais: (s.shippingCost || 0) + (s.boosterCost || 0),
      benefice: Number(profitOf(s).toFixed(2)),
    }));

    const { text } = await generateText({
      model: getModel(MODEL_ANALYST),
      maxOutputTokens: 3000,
      system: SYSTEM,
      prompt: `Voici mes ${data.length} ventes (JSON) :\n${JSON.stringify(data)}\n\nFais-moi ton analyse stratégique.`,
    });

    return NextResponse.json({ report: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
