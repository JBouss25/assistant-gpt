# Mentora

Plateforme qui met en relation des **élèves** (collège, lycée, CPGE, université) avec des **enseignants** qualifiés, grâce à un algorithme de matching transparent. Les **parents** suivent la progression de leurs enfants.

**Stack :** Next.js 16 (App Router, Cache Components, Server Actions, Turbopack) · React 19 · Tailwind CSS v4 · Supabase (Auth + Postgres + RLS) · Zod · Vitest · hébergement Vercel.

## Fonctionnalités

- **Inscription à 3 rôles : élève, enseignant, parent**, confirmation par e-mail, onboarding guidé. Le parent relie le compte de son enfant avec le **code parent** affiché sur le profil de l'élève.
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
- **Messagerie en temps réel** entre l'élève et l'enseignant, ouverte dès que la demande est acceptée (Supabase Realtime).
- **Calendrier de réservation** : vue semaine (liste sur mobile), cours de **1 h 30, 1 h 45 ou 2 h**, proposés par l'un et confirmés par l'autre. Les chevauchements sont refusés, pour l'enseignant comme pour l'élève. Les horaires sont affichés à l'heure de Paris.
- **Suivi de la progression** : après chaque cours, l'enseignant rédige un compte-rendu (note /20, implication, notions, devoirs). Élève, parents et enseignants voient des graphiques : évolution des notes par matière, heures de cours par mois, moyenne récente et tendance.
- Tableaux de bord élève, enseignant (avec les comptes-rendus à rédiger) et parent (un résumé par enfant).

- **Applis Android et iOS** (Capacitor) : notifications push, écran de démarrage, mode hors-ligne. Voir [`docs/publier-sur-les-stores.md`](docs/publier-sur-les-stores.md).
- **Conformité stores** : suppression de compte, signalement et blocage d'un utilisateur, pages Confidentialité, Conditions et Aide.

**Charte graphique :** vert olive (couleur principale), marron (secondaire), fond crème. Le mode sombre est automatique. Les couleurs sont définies dans `src/app/globals.css`.

## Sécurité

Toutes les règles d'accès sont dans la base (`supabase/migrations`), pas seulement dans l'interface :

- Row Level Security sur toutes les tables.
- Le rôle d'un utilisateur ne peut pas être modifié. Seul un compte enseignant peut créer un profil enseignant.
- La note moyenne ne peut pas être modifiée par le client.
- Un enseignant ne voit le profil d'un élève qu'après avoir reçu une demande de sa part.
- Les changements de statut sont contrôlés par un trigger : l'enseignant accepte ou décline, l'élève annule, et une demande traitée ne peut plus changer.
- Messages : seuls les deux participants d'une demande acceptée peuvent lire ou écrire. Un message ne peut être ni modifié ni supprimé.
- Parents : accès en lecture seule aux cours, notes et comptes-rendus de leurs enfants reliés, jamais aux messages. Le code parent n'est lisible que par l'élève, qui peut le changer et retirer un parent.
- Comptes-rendus : seulement pour un cours confirmé et terminé, une fois, par son enseignant. Chaque enseignant ne voit que les siens ; l'élève et ses parents les voient tous.
- Cours : durée de 90 à 120 min contrôlée en base, date future obligatoire, pas de chevauchement. Seule l'autre personne peut confirmer un cours, et un cours ne peut être annulé qu'avant son début.

## Démarrage local

👉 Guide pas à pas avec un scénario de test complet : [`docs/tester-en-local.md`](docs/tester-en-local.md).

En résumé (Docker requis) :

```bash
npm install
npm run db:start && npm run env:local
npm run dev            # http://localhost:3000
npm run test:e2e       # parcours complet automatisé
```

### Sans Docker

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés Supabase
npm run dev
```

Sans variables Supabase, le site tourne en **mode démo** : les pages s'affichent, mais les comptes sont désactivés.

### Base de données

**Option A, Supabase Cloud :** créez un projet, puis dans *SQL Editor* exécutez, dans l'ordre, `supabase/migrations/20261025000000_init.sql` et `supabase/migrations/20261026000000_messages_lessons.sql`. Pour des données de démo, exécutez aussi `supabase/seed.sql` (8 enseignants, mot de passe `mentora-demo`).

**Option B, CLI :**

```bash
npx supabase init          # si besoin
npx supabase link --project-ref <ref>
npx supabase db push       # applique les migrations
```

**Option C, en local (Docker) :** `npx supabase start` lance une instance complète avec les migrations et le seed. Copiez ensuite l'URL et la clé `PUBLISHABLE_KEY` affichées dans `.env.local`.

La messagerie en direct utilise Supabase Realtime. La migration ajoute automatiquement les tables `messages` et `lessons` à la publication `supabase_realtime`.

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
| `npm test` | Tests unitaires du matching et des dates (Vitest) |
| `npm run test:e2e` | Parcours complet dans un navigateur (Playwright) |
| `npm run test:db` | Règles de sécurité de la base (106 vérifications, Postgres embarqué, sans Docker) |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local (Docker) |
| `npm run env:local` | Génère `.env.local` pour la base locale |
| `npm run mobile:sync` | Met à jour les projets Android / iOS (`MOBILE_APP_URL` pour changer d'URL) |
| `npm run mobile:android` / `mobile:ios` | Ouvre le projet dans Android Studio / Xcode |
| `npm run store:screenshots` | Génère les captures d'écran des stores |

## Structure

```
src/
  app/                 routes (accueil, connexion, inscription, onboarding,
                       tableau-de-bord, profil, enseignants, messages,
                       calendrier, auth/confirm)
  app/actions/         Server Actions (auth, profils, demandes, avis)
  components/          UI (boutons, champs, pastilles, cartes, formulaires)
  lib/matching.ts      algorithme de matching (+ tests)
  lib/time.ts          fuseau Europe/Paris, durées de cours (+ tests)
  lib/conversations.ts conversations, messages et cours
  lib/data.ts          accès aux données côté serveur
  lib/supabase/        clients Supabase (serveur, proxy)
  proxy.ts             rafraîchissement de session et protection des routes
android/, ios/         projets natifs (Capacitor)
mobile/                écran hors-ligne de l'appli
assets/, store/        icône, écran de démarrage, visuels des stores
supabase/
  config.toml          configuration Supabase locale
  migrations/          schéma, RLS, triggers
  seed.sql             données de démo
```
