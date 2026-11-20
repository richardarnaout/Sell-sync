// T-034.1 — Règle d'activation du mode démo (testée par verif:demo).
// Actif seulement si NEXT_PUBLIC_DEMO=1 ET hors production : `next build` force NODE_ENV=production,
// donc le mode démo est toujours éteint dans un build, même si la variable traîne sur Vercel.
// Next.js remplace process.env.* par des littéraux à la compilation : dans un build, DEMO_MODE vaut `false`.
export function demoAllowed(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv !== 'production' && flag === '1';
}

// Écrit en toutes lettres (et non via demoAllowed) pour que le compilateur le remplace par une constante.
export const DEMO_MODE = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO === '1';
