# Rapport — SellSync (projets/sellsync)
Mis à jour : 2026-11-20 (T-034 validé chef de projet, en review)

## Fiche
- **Pile** (d'après les livrables T-031 à T-034, état des lieux complet du code à faire) : Next.js 15 + TypeScript, Supabase (PostgREST, RLS), déployé sur Vercel (prod = `master`), IA Gemini côté serveur, import des mails Gmail via Apps Script → `api/import/mail`.
- **Branche de travail** : `feat/auto-import-mail` (T-031 + T-033.2 + T-034, **non commitée, non fusionnée**).
- **Lancer / tester** : `npm run dev` ; mode démo à données fictives (`NEXT_PUBLIC_DEMO=1`, inactif en build prod, vérifié) ; `npx tsc --noEmit`, `npm run build`, `verif:import`, `verif:stats`, `verif:ia`, `verif:demo`, `verif:demo-build` ; captures `scripts/captures-demo.mjs` (6 largeurs), parcours `scripts/parcours-demo.mjs`.
- **État** : fonctionnel en mode démo (recette T-034.5) ; jamais vérifié sur vraies données (T-034.6, connexion de Khaled requise).

## Demandes de Khaled (la plus récente en haut)
- 2026-11-20 · T-034 · import des seuls achats Shein avec photo, plus de liaison, prix de vente Vinted saisi par Khaled, design remis d'aplomb (360 à 1440 px) → mails Vinted ignorés sans écriture ni appel IA, `ReviewQueue` supprimé, saisie du prix en place sur l'article, lien photo à l'ajout manuel, réduction des photos de modèles, vignette unique `Thumb` avec repli, jetons de design + `Button`/`Card`/`Badge`, Stock et Ventes refaits ; recette T-034.5 **conforme avec réserves (0 bloquant, 0 majeur, 3 mineurs)** ; réserves T-033.4 A1, A3, A5, B1, B2, B3 levées · fichiers : `app/lib/importMail.ts`, `app/components/ui.tsx`, `StockView.tsx`, `SaleForm.tsx`, `SalesList.tsx`, `AppNav.tsx`, `app/globals.css`, `ReviewQueue.tsx` (supprimé), scripts de vérif et de captures · `hq/outputs/projets/T-034-plan-sellsync-simple.md`, `hq/outputs/dev/T-034.1` à `T-034.6`, captures `hq/outputs/dev/T-034-captures/` et `T-034.5-captures/` · **review**
  - **Design** : tous les écrans refaits (Stock, Ventes, Aujourd'hui, Analyse, modales, connexion), 360-1440 px sans débordement, cibles ≥ 44 px. Restent composant `Field` et plafond de largeur desktop → T-034.7.
  - **À faire par Khaled** : (1) check-list 5 min de `hq/outputs/dev/T-034.6-verif-reelle.md` en se connectant lui-même en local (390 puis 1280 px, ne rien enregistrer) ; (2) Vercel → Environment Variables : cocher **Preview** pour les variables Supabase (et `SUPABASE_SERVICE_ROLE_KEY`, `IMPORT_USER_ID`, `IMPORT_SECRET`, clé Gemini) sinon la preview de la branche échoue ; (3) après accord : commit sur `feat/auto-import-mail`, preview Vercel, puis fusion dans `master` et push (prod).
- 2026-11-19 · T-033 · photos invisibles (carrés) → diagnostic + correctif sur la branche, patch master séparé `hq/outputs/dev/T-033.2-master.patch` ; recette T-033.4 conforme avec réserves (reprises dans T-034) · **review**
- 2026-11-19 · T-031 · SellSync 100 % fonctionnel (Next 15, IA serveur, finitions écran) → recette T-031.5 conforme · `hq/outputs/dev/T-031.5-recette.md` · **review** (SQL fait le 18/11, variables Vercel et check-list connectée en attente)

## Décisions & pièges
- Règle du 18/11 : aucune liaison automatique ; Khaled valide toujours. Depuis T-034 : plus de liaison du tout, le prix est tapé par Khaled sur l'article.
- Rien supprimé en base : `pending_sales`, `vinted_sold_notices`, `rejected_purchase_ids` intacts, seulement ignorés. Nettoyage = proposition T-034.3, décision de Khaled.
- Photo à l'ajout manuel = lien `https` d'un domaine autorisé (pas de Supabase Storage).
- `.env.local` exporté de Vercel : les variables sensibles arrivent **vides** (clé service, `IMPORT_USER_ID`) ; RLS = 0 ligne en anon, c'est normal.
- Aucun commit, push, checkout ni stash par les agents.

## Reste à faire
- Khaled : check-list T-034.6, variables Preview Vercel, accord commit/fusion `feat/auto-import-mail` ; B4/B5 sur un vrai mail Shein ; décision nettoyage des tables.
- Tickets `todo` (après accord de Khaled sur T-034) : T-034.7 fin du design (dev-frontend) ; T-034.8 `today()` en date locale et T-034.9 nettoyage code mort (`/api/import/extract`, code Vinted) (dev-fullstack) ; T-034.10 recette + M1 script (testeur-qa).
