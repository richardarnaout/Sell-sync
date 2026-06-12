import Anthropic from '@anthropic-ai/sdk';

// Modèle par défaut : le plus capable. Pour réduire le coût (~5x moins cher),
// remplace par 'claude-haiku-4-5' — largement suffisant pour ces tâches.
export const MODEL = 'claude-opus-4-7';

/**
 * Construit le client Anthropic à la demande (jamais au build).
 * Lève une erreur claire si la clé est absente — la route la renvoie au client.
 */
export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local (en local) et dans les variables d'environnement Vercel, puis redéploie.",
    );
  }
  return new Anthropic({ apiKey });
}

/** Concatène les blocs texte d'une réponse Messages. */
export function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Forme minimale d'une vente, utilisée côté serveur pour les prompts. */
export interface SaleLike {
  date: string;
  article: string;
  category: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  shippingCost: number;
  boosterCost: number;
}

/** Bénéfice net (même formule que l'app). */
export function profitOf(s: SaleLike): number {
  return s.salePrice - s.purchasePrice - s.shippingCost - s.boosterCost;
}
