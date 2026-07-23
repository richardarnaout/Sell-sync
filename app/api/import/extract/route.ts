import { NextRequest, NextResponse } from 'next/server';
import { extractFromEmail } from '../../../lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Route de TEST de l'extraction (Phase 1).
 * POST { subject?: string, body: string }  →  JSON extrait par l'IA.
 *
 * Ne lit aucune boîte mail et n'écrit RIEN dans Supabase : c'est juste
 * pour vérifier que l'IA sort les bonnes infos à partir d'un vrai mail collé.
 *
 * Exemple :
 *   curl -X POST /api/import/extract \
 *     -H 'Content-Type: application/json' \
 *     -d '{"subject":"...","body":"..."}'
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const subject = typeof b?.subject === 'string' ? b.subject : '';
    const body = typeof b?.body === 'string' ? b.body : '';
    // Date de réception du mail (YYYY-MM-DD). Par défaut aujourd'hui pour le test ;
    // en prod ce sera la date du mail Gmail.
    const receivedDate =
      typeof b?.receivedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.receivedDate)
        ? b.receivedDate
        : new Date().toISOString().slice(0, 10);

    if (!body.trim()) {
      return NextResponse.json(
        { error: 'Fournis au moins le champ "body" (le corps du mail).' },
        { status: 400 },
      );
    }

    const result = await extractFromEmail(subject, body.slice(0, 20000), receivedDate);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
