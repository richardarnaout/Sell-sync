import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { authenticate, takeQuota, readJson, fetchAll, failure, aiDeps } from '../../../lib/ai';
import { monthReport, dormantStock, today } from '../../../lib/aiStats';
import { dbToSale } from '../../../lib/sales';
import { dbToPurchase } from '../../../lib/stock';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST { month: "AAAA-MM" } -> { totals, best[], worst[], dormant[], comment }
// Chiffres calculés par code sur les ventes lues en base (session de l'utilisateur).
// L'IA ne rédige que 5 lignes à partir des totaux ; le commentaire est mémorisé (ai_cache) :
// même mois + mêmes chiffres = aucun nouvel appel IA, aucun quota consommé.

const SYSTEM = `Tu es coach de revente Vinted. À partir des chiffres fournis (déjà calculés, exacts), écris 5 lignes maximum en français, tutoiement, texte brut :
ce qui marche, ce qui freine, une action concrète pour le mois prochain. Cite uniquement les chiffres fournis, n'invente rien.`;

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson(req);
  const month = String(b?.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'Mois invalide (AAAA-MM).' }, { status: 400 });
  }
  try {
    const sales = (await fetchAll((f, t) => auth.db.from('sales').select('*').range(f, t))).map(dbToSale);
    const rep = monthReport(sales, month);
    if (rep.totals.count === 0) return NextResponse.json({ error: 'Aucune vente ce mois-ci.' }, { status: 400 });
    const purchases = (await fetchAll((f, t) =>
      auth.db.from('purchases').select('*').eq('status', 'en_stock').range(f, t))).map(dbToPurchase);
    const dormant = dormantStock(purchases, today());

    const facts = { mois: month, totaux: rep.totals, meilleurs: rep.best, pires: rep.worst, stock_dormant: dormant.length };
    const key = `analyst:${month}:` + createHash('sha1').update(JSON.stringify(facts)).digest('hex').slice(0, 16);

    let comment: string | null = null;
    const cached = await auth.db.from('ai_cache').select('value').eq('key', key).maybeSingle();
    if (typeof cached.data?.value === 'string') comment = cached.data.value;

    if (comment === null) {
      const denied = await takeQuota(auth.db);
      if (denied) return denied;
      comment = (await aiDeps.text(SYSTEM, JSON.stringify(facts))).trim().slice(0, 1200);
      // Mémorisation facultative : si la table manque ou échoue, la réponse part quand même.
      await auth.db.from('ai_cache').upsert({ user_id: auth.userId, key, value: comment });
    }
    return NextResponse.json({ ...rep, dormant, comment });
  } catch (e) { return failure(e); }
}
