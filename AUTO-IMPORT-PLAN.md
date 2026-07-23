# 🤖 Auto-import des ventes — Plan de travail

> Objectif : **arrêter la saisie manuelle** dans SellSync. Récupérer automatiquement
> le prix d'achat, le prix vendu et le nom de l'article, et écrire dans Supabase.
> Statut : **en réflexion / pas encore commencé.** On y reviendra plus tard.

---

## 🎯 Ce qu'on veut faire

Trois plateformes en jeu :

| Plateforme | Rôle | Donnée à récupérer | Accès |
|---|---|---|---|
| **Shein** | achat | prix d'achat | mail de commande |
| **Vinted** (2-3 comptes) | vente | nom + prix vendu | mail « ton article est vendu » |
| **SellSync** | destination | on y écrit | Supabase (c'est notre app) |

⚠️ Le nom de l'article **n'est pas le même** entre l'achat (Shein) et la vente (Vinted).
Le rapprochement achat↔vente se fera plus tard (étape « matching »).

---

## ✅ Décisions prises

- **Pas de scraping de Vinted** → risque de ban (pas d'API officielle). On passe **par les mails**.
- **Ingestion par email**, pas en allant lire les boîtes en direct.
- **Stack = Vercel AI SDK** pour le premier jet (`generateObject` + Zod).
  Mastra.js est **gratuit/open-source** mais gardé pour plus tard (étape matching).
- **Plateforme d'achat = Shein**, mail **changé pour `khaled.arnaout.93100@gmail.com`** (Gmail,
  ex-iCloud). → on lit via l'API Gmail.
- **Récupérer directement depuis Shein ? NON.** Pas d'API acheteur (leur API est réservée aux
  vendeurs), scraping = fragile + contre CGU. Le mail de confirmation Shein est fiable et structuré
  → on reste sur l'email.
- **Ventes = 2 à 3 adresses différentes** (probablement 2-3 comptes Vinted → à confirmer).
- ⚠️ Richard **supprime parfois ses mails** pour libérer de la place → il faut capter
  le mail **à l'arrivée**, pas plus tard (sinon risque de le rater).

---

## 🏆 Architecture recommandée : UNE Gmail « entonnoir »

Idée de Richard (passer Shein sur Gmail) → poussée à fond : **tout faire converger
dans une seule Gmail dédiée**, ex. `richard.sellsync@gmail.com`.

```
Shein   → mettre cette Gmail comme email du compte
Vente 1 ─┐
Vente 2 ─┼─ règle de transfert auto vers la Gmail dédiée
Vente 3 ─┘
                    → on lit UNE seule boîte via l'API Gmail
                    → Claude (Haiku) extrait le JSON
                    → écriture dans Supabase (SellSync)
```

**Pourquoi c'est le meilleur choix :**
- ✅ **Une seule intégration** (au lieu d'iCloud + 3 boîtes).
- ✅ **Corbeille Gmail = 30 jours** et l'API peut la lire → même si Richard supprime
  ses mails, un cron quotidien les attrape quand même. **Le problème de suppression
  disparaît presque tout seul.**
- ✅ **Gmail dédiée = sécurité** : le mail perso reste privé, on ne donne l'accès API
  qu'à ce compte technique.

**Alternative écartée (mais possible) :** transfert → webhook (Postmark inbound) =
push temps réel, ou IMAP iCloud + polling. Gardé en secours si la Gmail entonnoir
ne convient pas.

---

## 🧱 Plan en 3 phases

### Phase 1 — Brique d'extraction (le cœur, testable seul)
Fichier : `app/lib/extract.ts`

```ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const Schema = z.object({
  kind: z.enum(['vente', 'achat', 'autre']).describe('vente=Vinted, achat=Shein'),
  article: z.string().describe("Nom de l'article tel qu'écrit dans le mail"),
  price: z.number().describe('Prix principal en euros'),
  shipping: z.number().nullable().describe('Frais de port si présents, sinon null'),
  date: z.string().describe('Date au format YYYY-MM-DD'),
});

export async function extractFromEmail(subject: string, body: string) {
  const { object } = await generateObject({
    model: anthropic('claude-haiku-4-5'),
    schema: Schema,
    prompt: `Email transactionnel d'e-commerce. Extrais les infos.
Si ce n'est ni une vente ni un achat, mets kind="autre".
SUJET: ${subject}
CORPS:
${body}`,
  });
  return object; // → { kind, article, price, shipping, date }
}
```

Install : `npm i ai @ai-sdk/anthropic zod`

### Phase 2 — Ingestion (Gmail entonnoir)
- Créer la Gmail dédiée.
- Brancher Shein dessus + règles de transfert des comptes Vinted.
- Accès API Gmail (projet Google Cloud + OAuth + refresh token).
- Cron (Vercel Cron, Supabase pg_cron, ou cron externe gratuit) qui lit les nouveaux
  mails (corbeille incluse) → appelle `extractFromEmail` → insère dans Supabase.

### Phase 3 — Matching achat ↔ vente
- **Nouvelle table `purchases`** (le stock acheté, en attente de vente) car les achats
  arrivent avant les ventes et avec un nom différent.
- Étape de rapprochement (LLM / Mastra) qui relie une vente Vinted à son achat Shein
  pour calculer le bénéfice et créer la ligne finale dans `sales`.

#### ⏱️ Gérer le décalage achat → vente (décidé 2026-06-30)
On **n'attend pas** : deux événements enregistrés au fur et à mesure.

```
Mail Shein   → ligne dans STOCK (purchases) : prix d'achat + nom + taille, pas encore vendu
   ⏳ l'article dort dans l'inventaire (jours/semaines)
Mail Vinted "vendu" → on sort du stock + crée la VENTE (prix vendu, relié à l'achat → bénéfice)
```

Le temps d'attente = l'article qui reste dans l'inventaire entre les deux. Rien à temporiser.

**Cycle de mails Vinted** (la vente met du temps à se finaliser) :
- 📩 « Ton article est vendu » → **prix vendu déjà connu** → enregistrer ici, statut `en cours`.
- 📩 « Vente terminée / paiement libéré » (qq jours après) → passer le statut à `finalisée`.
- 📩 « Vente annulée / litige » (rare) → remettre l'article en stock.

→ Le dashboard est à jour **immédiatement** (au mail "vendu"), sans rien attendre, avec
distinction confirmé / en attente. **Bonus :** la table stock donne une **vue inventaire**
(acheté pas encore vendu = argent immobilisé / invendus à relancer).

---

## ⛔ Prérequis bloquant

- **Activer la clé API Anthropic payante** (`ANTHROPIC_API_KEY`) — la même que pour les
  outils IA déjà codés dans l'onglet Analyse. Sans elle, aucune extraction ne tourne.
- Coût réaliste avec `claude-haiku-4-5` : **quelques centimes par mois**.

---

## 📋 Prochaines actions (quand on reprend)

1. **Richard** : confirmer que les 2-3 mails de vente = 2-3 comptes Vinted.
2. **Richard** : décider de créer la Gmail dédiée (`richard.sellsync@gmail.com` ou autre).
3. **Richard** : coller 2 vrais mails (anonymisés) →
   - 1 mail de **vente Vinted** (« ton article est vendu »),
   - 1 mail de **commande Shein**.
4. **Claude** : caler le schéma d'extraction sur ces formats réels → livrer Phase 1 testée.
5. Enchaîner Phase 2 (ingestion) puis Phase 3 (matching).

---

---

## 🔒 Décisions verrouillées (MàJ 2026-07-23) — branche `feat/auto-import-mail`

- **LLM = Google Gemini gratuit** (`gemini-2.5-flash-lite` via `app/lib/ai.ts`).
  L'ancien prérequis « clé Anthropic payante » saute : les 3 outils IA sont déjà passés sur Gemini.
- **Matching achat↔vente = « stock + suggestion IA + confirmation 1 clic ».**
  - Titres Shein (EN) ≠ titres Vinted (FR) → on compare le **sens** (l'IA relie « ribbed knit top » ≈ « pull côtelé »), **pas** les chaînes de caractères.
  - Signaux : sens du titre + **taille** (forts), prix (faible), date (moyen).
  - ⛔ **Photo hors-jeu** : Richard shoote sur mannequin → photos Vinted ≠ photos Shein.
  - Pas de matching 100 % auto silencieux (risque de bénéfice faussé sans alerte) → Richard confirme le lien proposé.
- **Ingestion = 1 seule boîte Gmail pour l'instant** (2ᵉ compte pas encore relié).
- **Livré Phase 1** : `app/lib/extract.ts` (schéma Zod aligné sur la table `sales`) + route de test
  `POST /api/import/extract` (colle un mail → JSON extrait, **aucune écriture en base**).
  → à **caler sur de vrais mails** Shein + Vinted avant de brancher l'ingestion.

*Dernière mise à jour : 2026-07-23*
