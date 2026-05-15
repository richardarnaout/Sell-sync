# SellSync — Vinted Accounting Tracker

Application web de suivi de ventes Vinted : bénéfices, statistiques, graphiques et gestion des modèles d'articles.

---

## Présentation

SellSync permet de tracker toutes ses ventes Vinted avec calcul automatique des bénéfices nets (prix de vente − achat − frais de port − booster), des marges et des statistiques mensuelles. Les données sont stockées dans le cloud et accessibles depuis n'importe quel appareil (PC, téléphone, tablette).

---

## Fonctionnalités

- Ajout / modification / suppression de ventes
- Import CSV (historique de ventes) et export CSV
- Modèles d'articles enregistrables (avec photo optionnelle)
- Statistiques : bénéfice net, chiffre d'affaires, marge moyenne, articles vendus
- Graphiques : revenus mensuels, tendance, comparaison mensuelle, répartition par catégorie, top articles, top tailles, meilleur jour de la semaine
- Suggestions intelligentes basées sur les données
- Authentification email / mot de passe (login, inscription, changement de mot de passe)
- Design responsive — mobile, tablette, desktop

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Langage | TypeScript |
| Style | [Tailwind CSS 3](https://tailwindcss.com) |
| Graphiques | [Recharts](https://recharts.org) |
| Icônes | [Lucide React](https://lucide.dev) |
| Base de données | [Supabase](https://supabase.com) (PostgreSQL) |
| Authentification | Supabase Auth (email / mot de passe) |
| Hébergement | [Vercel](https://vercel.com) |
| Source | [GitHub](https://github.com/richardarnaout/Sell-sync) |

---

## Dépendances

```json
{
  "next": "14.2.5",
  "react": "^18",
  "react-dom": "^18",
  "recharts": "^3.8.1",
  "lucide-react": "^0.400.0",
  "@supabase/supabase-js": "^2.x"
}
```

**Dev dependencies :**
```json
{
  "typescript": "^5",
  "tailwindcss": "^3.4.1",
  "autoprefixer": "^10.0.1",
  "postcss": "^8",
  "@types/node": "^20",
  "@types/react": "^18",
  "@types/react-dom": "^18"
}
```

---

## Base de données — Supabase

Deux tables PostgreSQL avec Row Level Security (chaque utilisateur accède uniquement à ses données) :

**Table `sales`**
| Colonne | Type | Description |
|---------|------|-------------|
| id | text (PK) | Identifiant unique |
| user_id | uuid | Référence auth.users |
| date | text | Date de vente (YYYY-MM-DD) |
| article | text | Nom de l'article |
| category | text | Catégorie |
| size | text | Taille |
| purchase_price | numeric | Prix d'achat |
| sale_price | numeric | Prix de vente |
| shipping_cost | numeric | Frais de port |
| booster_cost | numeric | Coût booster Vinted |
| created_at | timestamptz | Date de création |

**Table `templates`**
| Colonne | Type | Description |
|---------|------|-------------|
| id | text (PK) | Identifiant unique |
| user_id | uuid | Référence auth.users |
| name | text | Nom du modèle |
| category | text | Catégorie |
| size | text | Taille |
| purchase_price | text | Prix d'achat type |
| shipping_cost | text | Frais de port type |
| booster_cost | text | Booster type |
| image | text | Photo en base64 (optionnel) |
| created_at | timestamptz | Date de création |

---

## Hébergement

| Service | Rôle | Plan |
|---------|------|------|
| **Vercel** | Hébergement frontend + CI/CD | Gratuit (Hobby) |
| **Supabase** | Base de données + Auth | Gratuit (pause après 7 jours d'inactivité) |
| **GitHub** | Dépôt de code source | Gratuit |

Le déploiement est automatique : chaque `git push` sur la branche `master` déclenche un nouveau build Vercel.

---

## Lancer en local

```bash
# Cloner le dépôt
git clone https://github.com/richardarnaout/Sell-sync.git
cd Sell-sync

# Installer les dépendances
npm install

# Créer le fichier d'environnement
# (les clés Supabase sont directement dans app/page.tsx pour ce projet)

# Lancer le serveur de développement
npm run dev
# → http://localhost:3001
```

---

## Architecture

```
Sell-sync/
├── app/
│   ├── page.tsx        # Application complète (composant principal + auth + sous-composants)
│   ├── layout.tsx      # Layout racine Next.js
│   └── globals.css     # Styles globaux + animations
├── public/             # Assets statiques
├── tailwind.config.ts  # Configuration Tailwind
├── next.config.mjs     # Configuration Next.js
└── package.json        # Dépendances
```

---

## Auteur

Richard Arnaout — projet personnel de suivi de revente Vinted.
