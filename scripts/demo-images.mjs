// T-034.1 — Génère les photos fictives du mode démo dans public/demo/ (SVG, aucun service externe).
// Lancer : node scripts/demo-images.mjs   (relançable : réécrit les mêmes fichiers)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');
mkdirSync(out, { recursive: true });

// [nom de fichier, couleur principale, couleur d'accent, forme]
const ITEMS = [
  ['robe-01', '#111827', '#374151', 'robe'],
  ['robe-02', '#b91c1c', '#ef4444', 'robe'],
  ['robe-03', '#f5f5f4', '#d6d3d1', 'robe'],
  ['robe-04', '#065f46', '#10b981', 'robe'],
  ['robe-05', '#1e3a8a', '#60a5fa', 'robe'],
  ['robe-06', '#9d174d', '#f472b6', 'robe'],
  ['haut-01', '#ca8a04', '#fde047', 'haut'],
  ['haut-02', '#7c3aed', '#c4b5fd', 'haut'],
  ['haut-03', '#0f766e', '#5eead4', 'haut'],
  ['jupe-01', '#78350f', '#d97706', 'jupe'],
  ['jupe-02', '#1f2937', '#9ca3af', 'jupe'],
  ['ensemble-01', '#be123c', '#fda4af', 'robe'],
  ['manteau-01', '#57534e', '#a8a29e', 'manteau'],
  ['robe-07', '#4c1d95', '#a78bfa', 'robe'],
];

const SHAPES = {
  robe: 'M150 70 L130 80 L118 150 L135 155 L128 200 L82 470 L318 470 L272 200 L265 155 L282 150 L270 80 L250 70 Q200 110 150 70 Z',
  haut: 'M140 90 L80 130 L105 200 L130 185 L130 400 L270 400 L270 185 L295 200 L320 130 L260 90 Q200 130 140 90 Z',
  jupe: 'M135 120 L265 120 L270 150 L330 440 L70 440 L130 150 Z',
  manteau: 'M145 70 L85 110 L70 470 L190 470 L200 140 L210 470 L330 470 L315 110 L255 70 L200 130 Z',
};

for (const [name, main, accent, shape] of ITEMS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="540" viewBox="0 0 400 540">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${main}"/></linearGradient></defs>
  <rect width="400" height="540" fill="#f3f1ee"/>
  <ellipse cx="200" cy="500" rx="150" ry="14" fill="#00000014"/>
  <path d="${SHAPES[shape]}" fill="url(#g)" stroke="#00000033" stroke-width="3"/>
  <text x="200" y="525" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#00000066">démo · ${name}</text>
</svg>
`;
  writeFileSync(join(out, `${name}.svg`), svg);
}
console.log(`${ITEMS.length} images écrites dans ${out}`);
