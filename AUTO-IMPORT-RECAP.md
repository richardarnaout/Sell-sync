# 🤖 Auto-import des ventes — Récap (session du 2026-07-23)

> **But** : arrêter la saisie manuelle. Les mails Shein (achats) et Vinted (ventes)
> alimentent SellSync tout seuls, avec ta validation en 1 clic.
>
> **État** : Extraction (Phase 1) + Stock & file de révision (Phase 3) **faits et testés
> sur tes vrais mails**. Il reste l'ingestion Gmail automatique (Phase 2).
>
> **Tout est sur la branche `feat/auto-import-mail`** (rien dans `master`).
> → Décision demain : merge vers `master` ou pas.

---

## ✅ Ce qui est fait

### 1. Extraction des mails (Phase 1) — `app/lib/extract.ts`
Le robot lit un mail et en sort un JSON structuré (Google Gemini gratuit, `gemini-2.5-flash`).
Calé et validé sur **tes vrais mails** (backtest depuis `khaled.arnaout.93100@gmail.com`) :

| Source | Ce qui est capté | Vérifié sur du réel |
|---|---|---|
| **Achat Shein** (« Confirmation de commande ») | **tous les articles** de la commande : nom, **modèle** (SHEIN PETITE, Unadoll…), couleur, taille, prix unitaire, SKU, date | ✅ commande du 14/07, 4 articles |
| **Vente Vinted** (« La transaction est finalisée ») | article, taille, couleur, **prix = « Montant de la commande »**, date | ✅ Robe Violetta Tifany M · 29 € |

**Décisions verrouillées :**
- **1 commande Shein = plusieurs articles** → schéma en liste (`items[]`).
- Couleur souvent collée à la taille côté Shein (« Jaune citron-Petite S ») → champs séparés.
- **Nom de modèle** (Rafferiza, Elengeza, SHEIN Bae…) capté → se glisse dans le titre Vinted.
- **Vente = uniquement le mail « finalisée »** (pas « ton article s'est vendu ») → évite les ventes
  fantômes en cas d'annulation.
- **Frais de port ignorés** (payés par l'acheteur, hors bénéfice).
- **Date = date écrite dans le mail si propre, sinon date de réception Gmail** (jamais inventée).
- **Pas de lien produit propre** dans le mail Shein → on affiche le **SKU** comme référence fiable.
- Mails Shein « expédiée / livrée / retard » = ignorés (`autre`).

Route de test : `POST /api/import/extract` (colle un mail → JSON, n'écrit rien).

### 2. Stock + file de révision (Phase 3)
- **Onglet « Stock »** (`app/components/StockView.tsx`) : inventaire des achats pas encore vendus,
  avec badge modèle, SKU, et **« argent immobilisé »**. Un achat sans vente **reste en stock** sans
  limite de temps (cas normal). Bouton pour ignorer les non-revente (ceinture, ventilo) ou supprimer.
- **File de révision** (`app/components/ReviewQueue.tsx`), affichée **à la connexion** :
  - Chaque vente Vinted détectée propose **l'achat le plus probable** (même taille ; auto-sélectionné
    s'il n'y a qu'un seul candidat de cette taille), avec **aperçu du bénéfice**.
  - **« Confirmer »** → crée la vente (prix d'achat + prix de vente = bénéfice), sort l'article du stock,
    et **glisse le modèle en tête du titre** (« Unadoll — Robe Violetta »).
  - **« Aucune »** → rien n'est écrit, tu gardes ta **saisie manuelle**.
  - L'app ne demande **jamais** « as-tu vendu ? » : la détection est automatique (le mail Vinted).

### 3. Comment tester (sur le preview Vercel de la branche)
1. Lancer le SQL `supabase/auto-import.sql` dans **Supabase → SQL Editor** (crée `purchases` +
   `pending_sales` ; **déjà fait** — relancer juste l'`ALTER … add column model` si besoin).
2. Ouvrir le **dernier preview** de la branche (Vercel → projet vinted-tracker → Deployments →
   Preview le plus récent, ou `npx vercel ls`). Se connecter à SellSync.
3. Bandeau **« Charger mes exemples »** → injecte tes vrais mails (4 achats Shein + vente Violetta).
4. File de révision → la vente **Violetta M 29 €** propose un achat taille M → **Confirmer**.
5. Onglet **Stock** pour voir l'inventaire.

⚠️ **Supabase est partagé prod/preview** (URL en dur) → le test écrit de **vraies lignes**.
Nettoyage après test :

```sql
-- Efface les données de test (exemples chargés)
delete from public.sales where article like '%Violetta%';
delete from public.pending_sales where transaction_number = '20886805143';
delete from public.purchases where order_number = 'USO18828W0000002CB6';
```

---

## ⏳ Ce qu'il reste — Phase 2 : ingestion Gmail automatique

Aujourd'hui les données arrivent via le bouton « Charger mes exemples ». Pour que ce soit
**vraiment automatique** (les mails alimentent SellSync tout seuls), il faut :

- Un accès **Gmail API côté serveur** (projet Google Cloud + OAuth + refresh token) pour que
  l'app déployée lise la boîte `khaled.arnaout.93100@gmail.com` seule.
  → **Manip Google à faire par Richard** (je guide pas à pas).
- Un **cron Vercel** qui, régulièrement, lit les nouveaux mails Shein/Vinted (corbeille incluse →
  couvre le fait que Richard supprime parfois ses mails), appelle l'extraction, et remplit
  `purchases` / `pending_sales`.
- (Plus tard, optionnel) 2ᵉ compte Vinted à relier, et mini-code dans le titre Vinted si un jour
  le stock dépasse ~10 articles et que l'appariement par taille ne suffit plus.

---

## 🗂️ Fichiers de la branche

| Fichier | Rôle |
|---|---|
| `app/lib/extract.ts` | Extraction IA (Gemini + Zod), schéma `items[]` avec modèle |
| `app/api/import/extract/route.ts` | Route de test de l'extraction (n'écrit rien) |
| `app/lib/stock.ts` | Types Purchase / PendingSale, mapping DB, appariement, données d'exemple |
| `app/lib/supabaseClient.ts` | Client Supabase partagé |
| `app/components/ReviewQueue.tsx` | File de révision + appariement 1 clic |
| `app/components/StockView.tsx` | Onglet Stock (inventaire) |
| `app/page.tsx` | Onglet « Stock » + badge + chargement des données |
| `supabase/auto-import.sql` | SQL des 2 tables + RLS |
| `AUTO-IMPORT-PLAN.md` | Plan initial + décisions |

## ✅ Checklist merge vers `master` (à décider demain)
- [ ] Tester le flux complet sur le preview (charger exemples → confirmer → stock).
- [ ] Nettoyer les données de test (SQL ci-dessus).
- [ ] Décider : merge Phase 1+3 maintenant (bouton manuel « charger ») **ou** attendre Phase 2
      (ingestion Gmail) pour tout merger d'un coup.
- [ ] Si merge : `git checkout master && git merge feat/auto-import-mail && git push`.

*Build Next OK à chaque étape. Dernier commit : voir `git log feat/auto-import-mail`.*
