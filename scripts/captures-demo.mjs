// T-034.1 — Captures de chaque onglet et des modales principales, en mode démo, à 1440×900 et 390×844 réels
// (viewport Playwright, pas une fenêtre Chrome redimensionnée). Sert pour « avant » (T-034.1) et « après » (T-034.4).
// Prérequis : `npm run dev:demo` lancé dans un autre terminal (http://localhost:3001).
// Lancer : node scripts/captures-demo.mjs <dossier de sortie>
// Playwright n'est pas une dépendance du projet : chemin du module via PLAYWRIGHT_MODULE, sinon résolution normale.
// Toute requête hors localhost est bloquée et comptée (preuve : aucune requête Supabase ni IA en mode démo).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = resolve(process.argv[2] || 'captures');
const base = process.env.BASE_URL || 'http://localhost:3001';
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '1280', width: 1280, height: 800, mobile: false },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '430', width: 430, height: 932, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '360', width: 360, height: 780, mobile: true },
].filter((v) => !process.env.ONLY || process.env.ONLY.split(',').includes(v.name));
const external = [];
const done = [];

async function shot(page, vp, name, fullPage = false) {
  await page.waitForTimeout(450); // fin des animations d'entrée
  const file = `${vp.name}-${name}.png`;
  await page.screenshot({ path: join(out, file), fullPage });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  // Audit T-034.4 : éléments qui dépassent à droite (hors halos décoratifs) et cibles interactives < 44 px.
  const audit = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const vis = (r, el) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
    const over = [], small = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!vis(r, el)) continue;
      if (r.right > W + 1 && !el.closest('.pointer-events-none') && !el.closest('.overflow-x-auto') && !el.closest('.scrollbar-hide')) over.push((el.tagName + '.' + String(el.className).slice(0, 40)));
      if (el.matches('button,a[href],select,input:not([type=hidden]):not([type=file]),textarea,[role=button]') && (r.height < 43.5 || r.width < 43.5) && !el.closest('[class~=hidden]')) {
        small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { over: over.slice(0, 5), small: small.slice(0, 8) };
  });
  done.push({ file, viewport: `${vp.width}x${vp.height}`, scrollWidth: scrollW, ...audit });
}
const visible = (loc) => loc.locator('visible=true').first();
async function tab(page, label) { await visible(page.getByRole('button', { name: label, exact: true })).click(); }
async function closeModal(page) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    // Le rechargement remet le jeu fictif à neuf : chaque capture part du même état.
    const fresh = async () => { await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForSelector('[data-demo-banner]'); };

    await fresh();
    await shot(page, vp, '01-aujourdhui', true);
    await tab(page, 'Ventes'); await shot(page, vp, '02-ventes', true);
    await tab(page, 'Stock'); await shot(page, vp, '03-stock', true);
    await visible(page.getByRole('button', { name: /^Vendus/ })).click(); await shot(page, vp, '04-stock-vendus', true);
    await visible(page.getByRole('button', { name: /^Invendus/ })).click(); await shot(page, vp, '05-stock-invendus', true);
    await tab(page, 'Analyse'); await shot(page, vp, '06-analyse', true);

    // Modales et formulaires principaux
    await fresh();
    await visible(page.getByRole('button', { name: vp.width < 768 ? 'Nouvelle vente' : 'Vente manuelle' })).click();
    await shot(page, vp, '07-modale-vente-manuelle');
    await fresh();
    await visible(page.getByRole('button', { name: 'Réglages' })).click();
    await shot(page, vp, '08-modale-reglages');
    await fresh(); await tab(page, 'Ventes');
    await visible(page.locator('button:has(svg[class*="trash"])')).click();
    await shot(page, vp, '09-modale-suppression');
    await fresh(); await tab(page, 'Stock');
    await visible(page.getByRole('button', { name: /Créer l.annonce/ })).click();
    await page.waitForTimeout(800); // réponse IA fictive
    await shot(page, vp, '10-modale-annonce-ia');
    await fresh(); await tab(page, 'Stock');
    await visible(page.getByRole('button', { name: /Ajouter un achat/ })).click();
    await shot(page, vp, '11-stock-ajout-manuel');
    await fresh(); await tab(page, 'Stock');
    await visible(page.locator('button[title^="Modifier le prix"]')).click();
    await shot(page, vp, '12-stock-modifier');
    await fresh();
    await visible(page.getByRole('button', { name: 'Réglages' })).click();
    await visible(page.getByRole('button', { name: /Se déconnecter|Déconnexion/ })).click();
    await page.waitForTimeout(300);
    await shot(page, vp, '13-connexion');
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'captures.json'), JSON.stringify({ base, date: new Date().toISOString(), captures: done, externalRequests: external }, null, 2));
for (const d of done) console.log(`${d.file}  ${d.viewport}  scrollWidth=${d.scrollWidth}  over=${d.over.length}  small=${d.small.length}${d.small.length ? ' ' + d.small.join(' | ') : ''}`);
console.log(`${done.length} captures dans ${out} · requêtes hors localhost bloquées : ${external.length}`);
if (external.length) console.log(external.join('\n'));
