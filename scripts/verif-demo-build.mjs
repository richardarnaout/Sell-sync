// T-034.1 — Garde-fou : le mode démo ne peut pas exister dans un build de production,
// même si NEXT_PUBLIC_DEMO=1 traîne dans l'environnement (ex. réglage Vercel oublié).
// Lance `next build` AVEC NEXT_PUBLIC_DEMO=1 puis cherche le code démo dans .next/static et .next/server.
// Sans clés Supabase, le build s'arrête à « Collecting page data » : la compilation, elle, est finie,
// et c'est elle qu'on inspecte. Lancer : npm run verif:demo-build
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
console.log('Build de production avec NEXT_PUBLIC_DEMO=1 …');
const r = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: root, env: { ...process.env, NEXT_PUBLIC_DEMO: '1' }, encoding: 'utf8',
});
const log = (r.stdout || '') + (r.stderr || '');
if (!/Compiled successfully/.test(log)) { console.error(log); console.error('ÉCHEC : la compilation n’a pas abouti.'); process.exit(1); }
const stop = /Collecting page data/.test(log) && /doivent être définies/.test(log);
console.log(`ok - compilation terminée${stop ? ' (arrêt attendu ensuite à « Collecting page data » : pas de clés Supabase)' : ` (exit ${r.status})`}`);

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(js|html|json)$/.test(f) ? [p] : [];
  });
}
const all = [...files(join(root, '.next', 'static')), ...files(join(root, '.next', 'server'))];
const text = all.map((f) => [f, readFileSync(f, 'utf8')]);
const MARKERS = ['SELLSYNC_DEMO_DATA', 'demo@sellsync.local', 'Mode démo interdit en production', 'Mode démo · données fictives', '__SELLSYNC_DEMO_FAIL__'];
// Le minifieur écrit les caractères accentués en \xHH / \uHHHH : on cherche les deux formes.
const escaped = (m) => m.replace(/[^\x00-\x7f]/g, (c) => {
  const n = c.charCodeAt(0);
  return n < 0x100 ? '\\x' + n.toString(16).padStart(2, '0') : '\\u' + n.toString(16).padStart(4, '0');
});
const found = (t, m) => t.includes(m) || t.includes(escaped(m));
let bad = 0;
for (const m of MARKERS) {
  const hits = text.filter(([, t]) => found(t, m)).map(([f]) => f.slice(root.length + 1));
  if (hits.length) { bad++; console.error(`ÉCHEC - « ${m} » trouvé dans : ${hits.join(', ')}`); }
  else console.log(`ok - « ${m} » absent des ${all.length} fichiers compilés`);
}
// Témoin positif : la recherche voit bien le code de l'app.
for (const control of ['VINTED ACCOUNTING', 'Bénéfice net du mois']) {
  if (!text.some(([, t]) => found(t, control))) { console.error(`ÉCHEC - témoin « ${control} » introuvable : la recherche ne prouve rien`); bad++; }
  else console.log(`ok - témoin « ${control} » trouvé (la recherche porte bien sur le code de l'app, accents compris)`);
}
if (bad) process.exit(1);
console.log('verif:demo-build OK — aucun code démo dans le build de production.');
