import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

// Fournisseur : Google Gemini (palier gratuit, sans carte bancaire).
// Clé gratuite à créer sur https://aistudio.google.com → "Get API key".
export const MODEL_FAST    = 'gemini-2.5-flash-lite'; // Annonce + Prix (simple, rapide)
export const MODEL_ANALYST = 'gemini-2.5-flash';      // Analyste stratégique (raisonnement)

/**
 * Construit un modèle Gemini à la demande (jamais au build).
 * Lève une erreur claire si la clé est absente — la route la renvoie au client.
 */
export function getModel(id: string): LanguageModel {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY manquante. Crée une clé gratuite sur aistudio.google.com, " +
      "ajoute-la dans .env.local (en local) et dans les variables d'environnement Vercel, puis redéploie.",
    );
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google(id);
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
