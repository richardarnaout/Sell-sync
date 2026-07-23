import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel, MODEL_ANALYST } from './ai';

/**
 * Brique d'extraction (Phase 1 du plan auto-import).
 *
 * On donne à Gemini le sujet + le corps d'un mail transactionnel (Shein ou Vinted)
 * et il renvoie une LISTE d'articles structurés, alignés sur la table `sales`.
 *
 * ⚠️ Schéma calé sur de VRAIS mails (backtest 2026-07-23) :
 *  - un mail Vinted « vendu »  = 1 article (une vente).
 *  - un mail de commande Shein = PLUSIEURS articles (chacun une future ligne de stock),
 *    avec la couleur souvent collée à la taille côté Shein ("Jaune citron-Petite S").
 */

export const ExtractItem = z.object({
  article: z
    .string()
    .describe("Nom de l'article, SANS la couleur ni la taille (garder la langue d'origine)"),
  color: z
    .string()
    .nullable()
    .describe('Couleur si présente (souvent collée à la taille côté Shein), sinon null'),
  size: z
    .string()
    .nullable()
    .describe('Taille seule (S, M, 38...) sans la couleur, sinon null'),
  price: z
    .number()
    .describe('Prix unitaire en euros (achat = prix payé, vente = prix vendu)'),
  sku: z.string().nullable().describe('Référence/SKU de l\'article si présente, sinon null'),
  productUrl: z
    .string()
    .nullable()
    .describe("Lien direct vers l'article si présent, sinon null"),
});

export const ExtractSchema = z.object({
  kind: z
    .enum(['achat', 'vente', 'autre'])
    .describe(
      "achat = confirmation de commande Shein. " +
        "vente = mail Vinted confirmant qu'un article est vendu / finalisé. " +
        "autre = tout le reste (expédition, livraison, pub, newsletter...).",
    ),
  date: z
    .string()
    .nullable()
    .describe(
      "Date écrite EXPLICITEMENT dans le mail (YYYY-MM-DD), sinon null. " +
        "⚠️ N'INVENTE JAMAIS de date : si elle n'est pas écrite, mets null.",
    ),
  orderNumber: z.string().nullable().describe('Numéro de commande si présent, sinon null'),
  shipping: z
    .number()
    .nullable()
    .describe('Frais de port de la commande en euros si mentionnés, sinon null'),
  items: z
    .array(ExtractItem)
    .describe('TOUS les articles du mail (1 pour une vente Vinted, N pour une commande Shein)'),
});

export type ExtractItemResult = z.infer<typeof ExtractItem>;
export type ExtractResult = z.infer<typeof ExtractSchema>;

const SYSTEM = `Tu extrais les articles d'un mail transactionnel de revente de vêtements.
- Shein → CONFIRMATION DE COMMANDE (un achat). kind="achat". Liste TOUS les articles avec leur prix unitaire.
- Vinted → mail "La transaction est finalisée" (la vente est bouclée). kind="vente". Un seul article.
  ⚠️ On ne traite QUE la vente finalisée. Le mail "Ton article s'est vendu" (pas encore finalisé) → kind="autre".
- Sinon (expédition, livraison, retard, pub, newsletter...) → kind="autre", items vide.

Règles :
- Côté Shein la couleur est souvent collée à la taille : "Jaune citron-Petite S" → color="Jaune citron", size="S".
- Vente Vinted finalisée : "price" = le montant écrit à côté de "Montant de la commande".
  IGNORE les "Frais de port" (payés par l'acheteur, hors bénéfice du vendeur).
- Ne devine jamais un prix : "price" est un nombre en euros (point décimal), pris tel quel dans le mail.
- Garde le nom de l'article dans sa langue d'origine, sans le traduire.
- "date" seulement si elle est écrite dans le mail (YYYY-MM-DD), sinon null. N'invente jamais.`;

/**
 * Extrait les infos structurées d'un mail. Ne touche PAS à la base.
 *
 * @param receivedDate  Date de réception du mail (métadonnée Gmail, YYYY-MM-DD).
 *   Source de vérité pour la date : les mails Vinted « vendu » n'écrivent aucune
 *   date dans leur corps → sans ça l'IA en inventait une (bug vu au backtest).
 *   Si le corps contient une vraie date (ex. commande Shein), elle est prioritaire.
 */
export async function extractFromEmail(
  subject: string,
  body: string,
  receivedDate: string,
): Promise<ExtractResult> {
  const { object } = await generateObject({
    model: getModel(MODEL_ANALYST),
    schema: ExtractSchema,
    system: SYSTEM,
    prompt: `SUJET: ${subject}\n\nCORPS DU MAIL:\n${body}`,
  });
  // La date du corps prime SI elle est propre (YYYY-MM-DD) ; sinon (absente ou mal
  // formatée, ex. "18/07/2026 17 h 05") on retombe sur la date du mail, toujours fiable.
  const clean = object.date && /^\d{4}-\d{2}-\d{2}$/.test(object.date) ? object.date : receivedDate;
  return { ...object, date: clean };
}
