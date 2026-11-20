// T-034.3 — Parcours de recette en mode démo (Playwright, 1440×900 et 390×844 réels).
// Prérequis : npm run dev:demo (http://localhost:3001). Lancer :
//   PLAYWRIGHT_MODULE=<chemin>/node_modules/playwright node scripts/parcours-demo.mjs <dossier de captures>
// Sortie : contrôles ok/ÉCHEC, captures et parcours.json ; code de sortie 1 si un contrôle échoue.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const base = 'http://localhost:3001';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'); // image factice (T-034.10 M1)
const log = [];
const check = (name, ok, detail = '') => { log.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'ok' : 'ÉCHEC'} - ${name}${detail ? ' · ' + detail : ''}`); };
const visible = (l) => l.locator('visible=true').first();
const external = [];

const browser = await chromium.launch();
try {
  for (const vp of [{ n: '1440', w: 1440, h: 900, m: false }, { n: '390', w: 390, h: 844, m: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.m ? 2 : 1, isMobile: vp.m, hasTouch: vp.m, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
    await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname === 'localhost') return r.continue(); external.push(u.href); if (u.hostname === 'img.ltwebstatic.com') return r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }); return r.abort(); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-demo-banner]');
    await page.getByText('BÉNÉFICE NET DU MOIS', { exact: false }).first().waitFor();
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    check(`${vp.n} accueil : aucun élément de liaison (Relier, ventes détectées, Pas celui-ci)`, !/Relier|ventes? détectées?|Pas celui-ci|Aucun de ces articles/i.test(body));
    check(`${vp.n} accueil : carte « prix à saisir » et mail Shein à vérifier`, /en stock : saisis le prix de vente Vinted/.test(body) && /1 mail à vérifier/.test(body));
    await page.screenshot({ path: join(out, `${vp.n}-01-accueil.png`), fullPage: true });

    await visible(page.getByRole('button', { name: 'Stock', exact: true })).click();
    await page.waitForTimeout(300);
    const cards = page.locator('[data-sale-form]');
    const nForms = await cards.count();
    check(`${vp.n} stock : une saisie de prix par article en stock`, nForms === 12, `${nForms} formulaires`);
    const first = cards.first();
    const pid = await first.getAttribute('data-sale-form');
    const priceInput = first.locator('input[inputmode="decimal"]');
    const fontSize = await priceInput.evaluate((e) => getComputedStyle(e).fontSize);
    if (vp.m) check('390 champ prix en 16 px (pas de zoom iOS)', fontSize === '16px', fontSize);
    const d = new Date(); const loc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    check(`${vp.n} date de vente par défaut = aujourd'hui (heure locale)`, (await first.locator('input[type="date"]').inputValue()) === loc, loc);
    await priceInput.fill('0');
    await first.getByRole('button', { name: 'Enregistrer' }).click();
    check(`${vp.n} prix 0 refusé avec message`, await page.getByText('Prix de vente invalide').first().isVisible());
    await priceInput.fill('24,90');
    check(`${vp.n} marge affichée pendant la saisie`, await first.getByText(/marge \+9,91 €/).isVisible());
    await page.screenshot({ path: join(out, `${vp.n}-02-saisie-prix.png`) });
    // double clic
    await first.getByRole('button', { name: 'Enregistrer' }).dblclick();
    await page.waitForTimeout(900);
    const chips = await page.locator('body').innerText();
    check(`${vp.n} après enregistrement : 11 en stock, 5 vendus`, /En stock \(11\)/.test(chips) && /Vendus \(5\)/.test(chips));
    await visible(page.getByRole('button', { name: /^Vendus/ })).click();
    await page.waitForTimeout(300);
    const soldTxt = await page.locator('body').innerText();
    check(`${vp.n} vendus : prix et marge de l'article`, /Vendu 24,90 € le .* · marge \+9,91 €/.test(soldTxt));
    await page.screenshot({ path: join(out, `${vp.n}-03-vendus.png`), fullPage: true });
    // Ventes : une seule vente créée malgré le double clic
    await visible(page.getByRole('button', { name: 'Ventes', exact: true })).click();
    await page.waitForTimeout(300);
    const nSale = await page.getByText('SHEIN Privé — Robe longue noire fendue', { exact: false }).count();
    check(`${vp.n} double clic : une seule vente dans Ventes`, nSale === 1, `${nSale}`);
    // modifier le prix
    await visible(page.getByRole('button', { name: 'Stock', exact: true })).click();
    await visible(page.getByRole('button', { name: /^Vendus/ })).click();
    await page.waitForTimeout(200);
    await visible(page.locator('button[title="Modifier le prix de vente"]')).click();
    const editForm = page.locator(`[data-sale-form="${pid}"]`);
    await editForm.locator('input[inputmode="decimal"]').fill('30');
    await editForm.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForTimeout(500);
    check(`${vp.n} prix modifié : 30,00 €, marge +15,01 €`, /Vendu 30,00 € le .* · marge \+15,01 €/.test(await page.locator('body').innerText()));
    // panne réseau à l'annulation
    await page.evaluate(() => { window.__SELLSYNC_DEMO_FAIL__ = 'sales'; });
    await visible(page.getByRole('button', { name: /Annuler la vente/ })).click();
    await page.waitForTimeout(500);
    const t2 = await page.locator('body').innerText();
    check(`${vp.n} panne réseau à l'annulation : message, article toujours vendu`, /Annulation non faite/.test(t2) && /Vendus \(5\)/.test(t2));
    await page.screenshot({ path: join(out, `${vp.n}-04-erreur-reseau.png`) });
    await visible(page.getByRole('button', { name: /Annuler la vente/ })).click();
    await page.waitForTimeout(600);
    const t3 = await page.locator('body').innerText();
    check(`${vp.n} annulation : l'article revient en stock`, /En stock \(12\)/.test(t3) && /Vendus \(4\)/.test(t3));
    // A1 : ajout manuel avec lien photo
    await visible(page.getByRole('button', { name: /^En stock/ })).click();
    await visible(page.getByRole('button', { name: /Ajouter un achat/ })).click();
    await visible(page.getByPlaceholder('Article')).fill('Robe test lien photo');
    await visible(page.getByLabel('Lien de la photo')).fill('https://evil.example.com/a.jpg');
    await visible(page.getByRole('button', { name: 'Ajouter', exact: true })).click();
    check(`${vp.n} A1 domaine étranger refusé`, await page.getByText(/seules les images Shein/).first().isVisible());
    await page.screenshot({ path: join(out, `${vp.n}-05-photo-refusee.png`) });
    await visible(page.getByLabel('Lien de la photo')).fill('http://img.ltwebstatic.com/v4/j/pi/demo.jpg');
    await visible(page.getByRole('button', { name: 'Ajouter', exact: true })).click();
    await page.waitForTimeout(600);
    const src = await page.locator('img[src="https://img.ltwebstatic.com/v4/j/pi/demo.jpg"]').count();
    check(`${vp.n} A1 lien http du CDN Shein accepté, enregistré en https`, src === 1 && /En stock \(13\)/.test(await page.locator('body').innerText()));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${vp.n} aucun défilement horizontal`, sw === vp.w, `scrollWidth=${sw}`);
    await page.screenshot({ path: join(out, `${vp.n}-06-stock-apres.png`), fullPage: true });

    // A5 : photo de modèle de plusieurs Mo réduite ; échec d'enregistrement affiché (1440 seulement)
    if (!vp.m) {
      await visible(page.getByRole('button', { name: 'Vente manuelle' })).click();
      await visible(page.getByRole('button', { name: /Sauvegarder comme modèle/ })).click();
      const bigBytes = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
        const ctx = c.getContext('2d'); const img = ctx.createImageData(4000, 3000);
        for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
        ctx.putImageData(img, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const file = new File([blob], 'photo-telephone.png', { type: 'image/png' });
        const input = document.querySelector('input[type=file][accept="image/*"]');
        const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return blob.size;
      });
      const thumb = page.locator('img[src^="data:image/jpeg"]').first();
      await thumb.waitFor({ timeout: 20000 });
      const info = await thumb.evaluate(async (el) => {
        const src = el.getAttribute('src'); const b64 = src.slice(src.indexOf(',') + 1);
        const i = new Image(); i.src = src; await i.decode();
        return { bytes: Math.floor(b64.length * 3 / 4), w: i.naturalWidth, h: i.naturalHeight };
      });
      check('1440 A5 photo de modèle réduite (≤ 1280 px, JPEG, ≤ 300 Ko)', info.bytes <= 300000 && Math.max(info.w, info.h) <= 1280,
        `source PNG ${(bigBytes / 1e6).toFixed(1)} Mo → ${info.w}×${info.h}, ${(info.bytes / 1000).toFixed(0)} Ko`);
      await page.evaluate(() => { window.__SELLSYNC_DEMO_FAIL__ = 'templates'; });
      await page.getByPlaceholder('ex : T-shirt Shein').fill('Modèle test A5');
      await page.getByPlaceholder('ex : T-shirt Shein').press('Enter');
      await page.waitForTimeout(700);
      check('1440 A5 échec d’enregistrement du modèle : message affiché', dialogs.some((m) => /Modèle non enregistré/.test(m)), dialogs.join(' | '));
    }
    await ctx.close();
  }
} finally { await browser.close(); }
// La photo CDN ajoutée en A1 est bloquée par le routeur de test (requête hors localhost) : c'est attendu.
check('requêtes hors localhost : seulement la photo Shein ajoutée au test A1 (aucune Supabase, aucune IA)', external.every((u) => u.startsWith('https://img.ltwebstatic.com/')), external.join(' '));
writeFileSync(join(out, 'parcours.json'), JSON.stringify({ date: new Date().toISOString(), log, external }, null, 2));
const ko = log.filter((l) => !l.ok).length;
console.log(`${log.length - ko}/${log.length} contrôles OK`);
process.exit(ko ? 1 : 0);
