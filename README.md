# Mentora

Plateforme qui met en relation des **élèves** (collège, lycée, CPGE, université) avec des **enseignants** qualifiés, grâce à un algorithme de matching transparent.

**Stack :** Next.js 16 (App Router, Cache Components, Server Actions, Turbopack) · React 19 · Tailwind CSS v4 · Supabase (Auth + Postgres + RLS) · Zod · Vitest · hébergement Vercel.

## Fonctionnalités

- **Inscription élève ou enseignant**, confirmation par e-mail, onboarding guidé.
- **Profil élève** : niveau, classe/filière, matières, objectifs, budget, format, disponibilités (grille semaine).
- **Profil enseignant** : accroche, présentation, diplômes, matières, niveaux, tarif, format, disponibilités, visibilité.
- **Matching** (`src/lib/matching.ts`) : score sur 100 avec explications (« Pourquoi ce match ? »).

  | Critère | Poids |
  | --- | --- |
  | Matières couvertes | 40 |
  | Niveau enseigné (éliminatoire) | 20 |
  | Créneaux en commun | 15 |
  | Budget (dégressif jusqu'à +50 %) | 10 |
  | Format et ville | 10 |
  | Réputation (note bayésienne) | 5 |

- **Annuaire** filtrable (matière, niveau, format, tarif, mot-clé) et page publique par enseignant.
- **Demandes de mise en relation** : l'élève envoie une demande, l'enseignant l'accepte ou la décline, l'élève peut l'annuler.
- **Avis** (1–5 étoiles), réservés aux élèves dont la demande a été acceptée. La note moyenne est recalculée en base.
- Tableaux de bord élève et enseignant.

## Sécurité

Toutes les règles d'accès sont dans la base (`supabase/migrations`), pas seulement dans l'interface :

- Row Level Security sur toutes les tables.
- Le rôle d'un utilisateur ne peut pas être modifié. Seul un compte enseignant peut créer un profil enseignant.
- La note moyenne ne peut pas être modifiée par le client.
- Un enseignant ne voit le profil d'un élève qu'après avoir reçu une demande de sa part.
- Les changements de statut sont contrôlés par un trigger : l'enseignant accepte ou décline, l'élève annule, et une demande traitée ne peut plus changer.

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés Supabase
npm run dev
```

Sans variables Supabase, le site tourne en **mode démo** : les pages s'affichent, mais les comptes sont désactivés.

### Base de données

**Option A, Supabase Cloud :** créez un projet, puis dans *SQL Editor* exécutez `supabase/migrations/20261025000000_init.sql`. Pour des données de démo, exécutez aussi `supabase/seed.sql` (8 enseignants, mot de passe `mentora-demo`).

**Option B, CLI :**

```bash
npx supabase init          # si besoin
npx supabase link --project-ref <ref>
npx supabase db push       # applique les migrations
```

Dans *Authentication → URL Configuration*, ajoutez `https://<votre-domaine>/auth/confirm` aux Redirect URLs.

## Déploiement sur Vercel

1. Importez le dépôt sur Vercel (le framework Next.js est détecté automatiquement).
2. Ajoutez les variables d'environnement `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`) et `NEXT_PUBLIC_SITE_URL`.
3. Déployez.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests unitaires du matching (Vitest) |

## Structure

```
src/
  app/                 routes (accueil, connexion, inscription, onboarding,
                       tableau-de-bord, profil, enseignants, auth/confirm)
  app/actions/         Server Actions (auth, profils, demandes, avis)
  components/          UI (boutons, champs, pastilles, cartes, formulaires)
  lib/matching.ts      algorithme de matching (+ tests)
  lib/data.ts          accès aux données côté serveur
  lib/supabase/        clients Supabase (serveur, proxy)
  proxy.ts             rafraîchissement de session et protection des routes
supabase/
  migrations/          schéma, RLS, triggers
  seed.sql             données de démo
```
