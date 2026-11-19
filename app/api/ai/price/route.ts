import { NextRequest, NextResponse } from 'next/server';
import { authenticate, readJson, fetchAll, failure } from '../../../lib/ai';
import { suggestPrice } from '../../../lib/aiStats';
import { dbToSale } from '../../../lib/sales';

export const runtime = 'nodejs';

// POST { category, size?, purchase_price? } -> { median, low, high, n, profit }
// 100 % code (médiane des ventes comparables en base) : aucun appel IA, pas de quota.
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;
  const b = await readJson(req);
  const category = String(b?.category ?? '').trim().slice(0, 50);
  if (!category) return NextResponse.json({ error: 'Indique la catégorie.' }, { status: 400 });
  const size = String(b?.size ?? '').trim().slice(0, 20);
  let purchase: number | null = null;
  if (b?.purchase_price !== undefined && b.purchase_price !== null && b.purchase_price !== '') {
    purchase = Number(b.purchase_price);
    if (!Number.isFinite(purchase) || purchase < 0) {
      return NextResponse.json({ error: "Prix d'achat invalide." }, { status: 400 });
    }
  }
  try {
    const rows = await fetchAll((f, t) => auth.db.from('sales').select('*').range(f, t));
    return NextResponse.json(suggestPrice(rows.map(dbToSale), category, size, purchase));
  } catch (e) { return failure(e); }
}
