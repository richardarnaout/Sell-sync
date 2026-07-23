import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel, MODEL_FAST } from './ai';

/**
 * Brique d'extraction (Phase 1 du plan auto-import).
 *
 * On donne à Gemini le sujet + le corps d'un mail transactionnel (Shein ou Vinted)
 * et il renvoie un objet structuré, aligné sur les colonnes de la table `sales`.
 *
 * ⚠️ Prompt à CALER sur de vrais mails (formats Shein / Vinted réels).
 *    Le schéma, lui, est déjà aligné sur SellSync et ne devrait pas bouger.
 */

export const ExtractSchema = z.object({
  kind: z
    .enum(['achat', 'vente', 'autre'])
    .describe(
      "achat = mail de commande Shein (on a acheté un article). " +
        "vente = mail Vinted confirmant qu'un article est vendu / la vente finalisée. " +
        "autre = tout le reste (pub, newsletter, expédition, etc.)",
    ),
  article: z
    .string()
    .describe("Nom / titre de l'article tel qu'écrit dans le mail (garder la langue d'origine)"),
  size: z
    .string()
    .nullable()
    .describe("Taille de l'article si présente (S, M, 38, 40...), sinon null"),
  price: z
    .number()
    .describe(
      "Prix principal en euros. Pour un achat Shein = prix payé pour l'article. " +
        "Pour une vente Vinted = prix auquel l'article a été vendu.",
    ),
  shipping: z
    .number()
    .nullable()
    .describe('Frais de port en euros si mentionnés séparément, sinon null'),
  productUrl: z
    .string()
    .nullable()
    .describe("Lien direct vers l'article (page produit Shein ou annonce Vinted) si présent, sinon null"),
  date: z
    .string()
    .nullable()
    .describe(
      "Date écrite EXPLICITEMENT dans le corps du mail (YYYY-MM-DD), sinon null. " +
        "⚠️ N'INVENTE JAMAIS de date : si elle n'est pas écrite, mets null.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confiance de l'extraction entre 0 et 1 (1 = mail parfaitement clair)"),
});

export type ExtractResult = z.infer<typeof ExtractSchema>;

const SYSTEM = `Tu extrais les infos d'un mail transactionnel de revente de vêtements.
Deux sources possibles :
- Shein → mail de CONFIRMATION DE COMMANDE (un achat). kind="achat".
- Vinted → mail indiquant qu'un article est VENDU ou que la vente est finalisée. kind="vente".
Si le mail n'est ni l'un ni l'autre (expédition, pub, newsletter, relance panier...), mets kind="autre".

Règles :
- Ne devine jamais un prix : si tu ne le trouves pas clairement, baisse "confidence".
- "price" est un nombre en euros (pas de symbole, point décimal). Ex: 12.5
- Garde le titre de l'article dans sa langue d'origine, sans le traduire.
- "date" : ne l'invente jamais. Mets-la seulement si elle est écrite dans le mail, sinon null.`;

/**
 * Extrait les infos structurées d'un mail. Ne touche PAS à la base.
 *
 * @param receivedDate  Date de réception du mail (métadonnée Gmail, YYYY-MM-DD).
 *   C'est la source de vérité pour la date : les mails Vinted "vendu" n'écrivent
 *   aucune date dans leur corps → sans ça l'IA en inventait une (bug vu au backtest).
 *   Si le corps contient une vraie date (ex. commande Shein), elle est prioritaire.
 */
export async function extractFromEmail(
  subject: string,
  body: string,
  receivedDate: string,
): Promise<ExtractResult> {
  const { object } = await generateObject({
    model: getModel(MODEL_FAST),
    schema: ExtractSchema,
    system: SYSTEM,
    prompt: `SUJET: ${subject}\n\nCORPS DU MAIL:\n${body}`,
  });
  // La date du corps prime si présente, sinon on retombe sur la date du mail.
  return { ...object, date: object.date ?? receivedDate };
}
