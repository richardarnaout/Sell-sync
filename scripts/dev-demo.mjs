// T-034.1 — Lance l'app en mode démo (données fictives, aucune requête Supabase ni IA).
// Équivaut à `NEXT_PUBLIC_DEMO=1 next dev -p 3001`, sans dépendance (marche aussi sous PowerShell).
// Lancer : npm run dev:demo   puis ouvrir http://localhost:3001
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3001';
const child = spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', port], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_DEMO: '1', NODE_ENV: 'development' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
