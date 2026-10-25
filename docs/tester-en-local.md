# Tester Mentora en local

Ce guide installe l'application sur votre ordinateur, avec une base Supabase locale et des données de démo, puis lance les tests automatiques. Aucun compte Supabase ni Vercel n'est nécessaire.

## 1. Prérequis (une seule fois)

| Outil | Version | Vérifier |
| --- | --- | --- |
| Node.js | 20 ou plus | `node -v` |
| Docker Desktop | lancé en arrière-plan | `docker info` |
| Git | toute version récente | `git --version` |

Docker sert à faire tourner Supabase (base Postgres, authentification, temps réel) sur votre machine.

## 2. Installer le projet

```bash
git clone https://github.com/JBouss25/assistant-gpt.git
cd assistant-gpt
git checkout ccr-f0db499f-i43pab
npm install
npx playwright install chromium   # navigateur pour les tests automatiques
```

## 3. Démarrer la base de données

```bash
npm run db:start     # 1er lancement : quelques minutes (téléchargement des images Docker)
npm run env:local    # écrit .env.local avec l'URL et la clé de la base locale
```

`db:start` applique les migrations (`supabase/migrations`) et charge les données de démo (`supabase/seed.sql`).

## 4. Lancer l'application

```bash
npm run dev
```

Ouvrez <http://localhost:3000>.

## 5. Tester à la main

Ouvrez **deux fenêtres** : une normale (élève) et une en navigation privée (enseignant), pour être connecté avec deux comptes en même temps.

| Étape | Fenêtre | Action | Résultat attendu |
| --- | --- | --- | --- |
| 1 | Élève | *Commencer* → « Je suis élève » → créer un compte | Arrivée sur le formulaire de profil |
| 2 | Élève | Lycée, Terminale, Maths + Physique-Chimie, budget 50 €, créneaux lun. soir / mer. après-midi / sam. matin | Tableau de bord avec des enseignants classés, score et « Pourquoi ce match ? » |
| 3 | Élève | Ouvrir **Claire Dubois** → écrire un message → *Envoyer ma demande* | « Demande envoyée » |
| 4 | Enseignant | Se connecter : `claire.dubois@demo.mentora.fr` / `mentora-demo` | La demande apparaît dans « Demandes à traiter » |
| 5 | Enseignant | *Accepter* puis *Écrire* | La conversation s'ouvre |
| 6 | Les deux | Ouvrir la même conversation et s'écrire | Les messages apparaissent **sans recharger la page** |
| 7 | Élève | Réserver un cours : date, 14 h 30, durée 1 h 30 | « Cours proposé », visible dans *Prochains cours* |
| 8 | Élève | Proposer un 2e cours le même jour à 15 h | Refusé : « Ce créneau chevauche un autre cours » |
| 9 | Enseignant | *Calendrier* → *Confirmer* | Le cours passe en vert olive (confirmé) dans la grille |
| 10 | Élève | *Calendrier* → *Annuler* | Le cours disparaît des deux calendriers |
| 11 | Les deux | Réduire la fenêtre à la taille d'un téléphone | Calendrier en liste, aucune barre de défilement horizontale |

**Espace parent et suivi :**

| Étape | Action | Résultat attendu |
| --- | --- | --- |
| 12 | Se connecter avec `sophie.bernard@demo.mentora.fr` / `mentora-demo` | Tableau de bord parent : carte de Léa avec sa moyenne, ses heures et sa courbe de notes |
| 13 | *Voir* | Page de progression : graphiques par matière, heures par mois, comptes-rendus |
| 14 | Se connecter en tant que Claire | « Comptes-rendus à rédiger (1) » : ouvrir, noter le cours, enregistrer |
| 15 | Revenir sur le compte de Sophie | Le nouveau compte-rendu et la note apparaissent |
| 16 | Créer un compte « Je suis parent » et saisir le code `DEMO2026` | Léa est reliée au nouveau parent |
| 17 | Se connecter avec `lea.bernard@demo.mentora.fr` → *Mon profil* | Code parent, parents reliés (bouton pour en retirer un) |

Les 8 enseignants de démo, Léa (élève) et Sophie (parent) partagent le mot de passe `mentora-demo`. Leurs adresses sont dans `supabase/seed.sql` (prénom.nom@demo.mentora.fr).

**Studio Supabase** (interface pour voir les tables) : <http://127.0.0.1:54323>. Il est activé par défaut dans `supabase/config.toml`.

**E-mails :** la confirmation par e-mail est désactivée en local. Pour la tester, passez `enable_confirmations = true` dans la section `[auth.email]` de `supabase/config.toml`, puis relancez `npm run db:stop && npm run db:start` : les e-mails arrivent alors dans Mailpit, sur <http://127.0.0.1:54324>.

## 6. Tests automatiques

```bash
npm test            # tests unitaires : algorithme de matching, dates et fuseau horaire
npm run test:e2e    # parcours complet dans un vrai navigateur (lance le serveur si besoin)
```

`test:e2e` rejoue automatiquement les étapes 1 à 9 et 12 à 17 ci-dessus et vérifie l'affichage mobile des pages publiques. Il peut être relancé autant de fois que nécessaire, sans réinitialiser la base. En cas d'échec, le rapport est consultable avec `npx playwright show-report`.

Avant de livrer, lancez aussi :

```bash
npm run lint && npm run typecheck && npm run build
```

## 7. Repartir de zéro / arrêter

```bash
npm run db:reset    # efface les données et recharge les données de démo
npm run db:stop     # arrête Supabase (les conteneurs Docker)
```

## Problèmes fréquents

| Symptôme | Solution |
| --- | --- |
| Bandeau jaune « Mode démo » | `.env.local` manquant : `npm run env:local`, puis relancez `npm run dev` |
| `db:start` échoue | Docker Desktop n'est pas lancé |
| Port 54321 ou 3000 déjà utilisé | `npm run db:stop`, ou fermez l'autre application qui utilise ce port |
| Les messages n'arrivent pas en direct | Rechargez la page ; vérifiez que `npm run db:start` affiche bien le service Realtime |
| Connexion refusée pour un compte de démo | La base a été vidée : `npm run db:reset` |
