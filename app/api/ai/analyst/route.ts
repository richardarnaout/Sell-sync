import { NextRequest, NextResponse } from 'next/server';
import { getClient, MODEL, textOf, profitOf, type SaleLike } from '../../../lib/ai';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sales: SaleLike[] = Array.isArray(body?.sales) ? body.sales : [];
    if (sales.length === 0) {
      return NextResponse.json(
        { error: 'Ajoute au moins quelques ventes avant de lancer une analyse.' },
        { status: 400 },
      );
    }

    // Données compactes : on pré-calcule le bénéfice pour fiabiliser le raisonnement.
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

    const client = getClient();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Voici mes ${data.length} ventes (JSON) :\n${JSON.stringify(data)}\n\nFais-moi ton analyse stratégique.`,
        },
      ],
    });

    return NextResponse.json({ report: textOf(msg.content) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
