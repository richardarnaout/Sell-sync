// T-034.1 — Réponses fictives des outils IA en mode démo : aucun appel au serveur ni à Gemini.
// Mêmes formes que les routes /api/ai/* (contrat T-031.2).
import { demoSnapshot } from './client';

if (process.env.NODE_ENV === 'production') throw new Error('Mode démo interdit en production.');

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function demoAi(url: string, body: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 400));
  if (url.endsWith('/listing')) {
    const p = demoSnapshot('purchases').find((x) => x.id === body?.purchase_id);
    if (!p) throw new Error('Article introuvable (mode démo).');
    const title = [p.model, p.article, p.size && `taille ${p.size}`].filter(Boolean).join(' ').slice(0, 80);
    return {
      title,
      description: `${p.article}${p.color ? `, couleur ${p.color.toLowerCase()}` : ''}. Neuve, jamais portée. (Texte fictif du mode démo.)`,
      keywords: ['shein', 'neuf', p.color, p.size].filter(Boolean).map((k: string) => String(k).toLowerCase()),
      price: { median: r2(p.purchase_price * 1.9), low: r2(p.purchase_price * 1.4), high: r2(p.purchase_price * 2.5), n: 6, profit: r2(p.purchase_price * 0.9) },
    };
  }
  if (url.endsWith('/price')) {
    const pp = Number(body?.purchase_price) || 0;
    return { median: 18, low: 12, high: 26, n: 8, profit: pp ? r2(18 - pp) : null };
  }
  if (url.endsWith('/analyst')) {
    const sales = demoSnapshot('sales').filter((s) => String(s.date).startsWith(body?.month ?? ''));
    const revenue = sales.reduce((a, s) => a + Number(s.sale_price), 0);
    const profit = sales.filter((s) => !s.is_personal).reduce((a, s) => a + s.sale_price - s.purchase_price - s.shipping_cost - s.booster_cost, 0);
    return {
      totals: { count: sales.length, revenue: r2(revenue), profit: r2(profit), margin: revenue ? r2((profit / revenue) * 100) : 0 },
      best: sales.slice(0, 2).map((s) => ({ article: s.article, profit: r2(s.sale_price - s.purchase_price) })),
      worst: sales.slice(-1).map((s) => ({ article: s.article, profit: r2(s.sale_price - s.purchase_price) })),
      dormant: [{ article: 'Jupe trapèze camel', days: 95 }],
      comment: 'Commentaire fictif du mode démo : aucune IA n’a été appelée.',
    };
  }
  throw new Error('Outil IA inconnu (mode démo).');
}
