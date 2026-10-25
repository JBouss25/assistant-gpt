# Publier Mentora sur l'App Store et Google Play

## Comment ça marche

L'appli mobile est une **coque native** (Capacitor) qui affiche le site Mentora hébergé sur Vercel, enrichie de fonctions natives :

| Fonction native | Pourquoi |
| --- | --- |
| Notifications push (nouveau message, demande, cours proposé, confirmé ou annulé) | Utile à l'élève et à l'enseignant ; demandée par Apple pour qu'une appli ne soit pas « un simple site » |
| Écran de démarrage, icône, barre d'état aux couleurs Mentora | Intégration au téléphone |
| Bouton retour Android | Navigation naturelle |
| Écran « Pas de connexion » avec reprise automatique | Comportement attendu hors réseau |

**Avantage :** chaque déploiement du site sur Vercel met l'appli à jour immédiatement, sans repasser par les stores. Une nouvelle version sur les stores n'est nécessaire que si vous changez la partie native (icône, nom, plugins, permissions).

Conformité stores déjà intégrée : suppression de compte dans l'appli (page *Mon profil*), signalement et blocage d'un utilisateur dans chaque conversation, politique de confidentialité (`/confidentialite`), conditions (`/conditions`) et page d'aide (`/support`).

---

## 1. Prérequis

| Élément | Coût | Remarque |
| --- | --- | --- |
| Compte [Apple Developer](https://developer.apple.com/programs/) | 99 $ / an | Une structure (SIRET) est recommandée : le nom affiché sur l'App Store est celui du compte |
| Compte [Google Play Console](https://play.google.com/console) | 25 $ une fois | Un compte personnel récent doit faire tester l'appli par 12 testeurs pendant 14 jours avant la production ; ce n'est pas le cas d'un compte organisation |
| Un **Mac** avec Xcode 16+ | — | Obligatoire pour iOS. Sans Mac, utilisez un service de build cloud (Codemagic, Ionic Appflow) |
| Android Studio | gratuit | Windows, Mac ou Linux |
| Projet [Firebase](https://console.firebase.google.com) | gratuit | Pour les notifications push |
| Le site déployé sur Vercel, avec une base Supabase **hébergée dans l'UE** | — | L'appli charge ce site |

## 2. Personnaliser l'appli (à faire une fois, avant la première publication)

1. **Identifiant de l'appli** : `fr.mentora.app` dans `capacitor.config.ts`, `android/app/build.gradle` (`applicationId`) et dans Xcode (*Bundle Identifier*). Choisissez-le définitivement : il ne peut plus changer après publication.
2. **URL du site** : dans `capacitor.config.ts` et `scripts/mobile-sync.mjs`, remplacez `https://mentora.vercel.app` par votre domaine, puis :
   ```bash
   npm run mobile:sync
   ```
3. **Mentions légales** : complétez `src/lib/legal.ts` (éditeur, adresse, e-mail de contact) et faites relire `/confidentialite` et `/conditions` par un juriste. Les stores exigent l'URL de la politique de confidentialité.
4. **Icône et écran de démarrage** : sources dans `assets/`. Pour les modifier, remplacez les PNG puis lancez :
   ```bash
   npx @capacitor/assets generate --iconBackgroundColor '#6f8040' --splashBackgroundColor '#fbfaf4' --splashBackgroundColorDark '#1c1a15'
   ```

## 3. Activer les notifications push

### Firebase
1. Créez un projet Firebase.
2. **Android** : *Ajouter une appli Android*, nom de package `fr.mentora.app`. Téléchargez `google-services.json` et placez-le dans `android/app/`.
3. **iOS** : *Ajouter une appli iOS*, bundle `fr.mentora.app`. Téléchargez `GoogleService-Info.plist` et glissez-le dans Xcode, dans le dossier `App/App`, en cochant la cible *App*.
4. **Clé APNs** (iOS) : sur developer.apple.com → *Certificates, IDs & Profiles* → *Keys* → créez une clé avec *Apple Push Notifications service*. Dans Firebase → *Paramètres du projet* → *Cloud Messaging* → *Configuration des applis Apple*, importez cette clé (.p8) avec son Key ID et votre Team ID.

### Serveur (Vercel)
Firebase → *Paramètres du projet* → *Comptes de service* → *Générer une nouvelle clé privée*. Ajoutez dans Vercel (*Settings → Environment Variables*) :

| Variable | Valeur |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `project_id` du fichier JSON |
| `FIREBASE_CLIENT_EMAIL` | `client_email` du fichier JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` du fichier JSON (avec les `\n`) |
| `SUPABASE_SECRET_KEY` | Supabase → *Project Settings → API Keys* → clé secrète |

⚠️ Ces valeurs sont secrètes : ne les mettez jamais dans le code ni dans une variable `NEXT_PUBLIC_…`. Sans elles, l'appli fonctionne mais n'envoie pas de notifications.

### Base de données
Exécutez la migration `supabase/migrations/20261027000000_mobile.sql` (jetons de notification, suppression de compte, signalement et blocage), comme les précédentes.

Les signalements arrivent dans la table `reports` (Supabase → *Table Editor*). Apple exige de les traiter rapidement : prévoyez de la consulter chaque jour.

## 4. Tester sur un téléphone

**Avec le site local** (Docker et `npm run dev` lancés, voir `docs/tester-en-local.md`) :

```bash
# Émulateur Android : 10.0.2.2 désigne votre ordinateur
MOBILE_APP_URL=http://10.0.2.2:3000 npm run mobile:sync
npm run mobile:android        # ouvre Android Studio → bouton ▶ Run

# Simulateur iOS (Mac)
MOBILE_APP_URL=http://localhost:3000 npm run mobile:sync
npm run mobile:ios            # ouvre Xcode → bouton ▶
```

Sur un vrai téléphone branché en USB, utilisez l'adresse IP locale de votre ordinateur (ex. `http://192.168.1.20:3000`).

**Avec le site en production** : `npm run mobile:sync`, puis lancez l'appli de la même façon. Testez les notifications sur de **vrais appareils** (un iPhone physique pour iOS).

À vérifier :
- [ ] Connexion, matching, messagerie, réservation
- [ ] La permission de notification est demandée après la connexion
- [ ] Un message reçu, appli fermée → notification ; la toucher ouvre la conversation
- [ ] Bouton retour Android
- [ ] Mode avion → écran « Pas de connexion », puis reprise automatique
- [ ] Mode sombre du téléphone
- [ ] Suppression du compte depuis *Mon profil*

Revenez à l'URL de production (`npm run mobile:sync`) avant de générer une version pour les stores.

## 5. Captures d'écran et visuels

```bash
npm run db:start && npm run env:local   # si ce n'est pas déjà fait
npm run store:screenshots
```

Cette commande génère, depuis l'appli réelle avec des données de démo :
- `store/screenshots/ios/` : 1320 × 2868 (iPhone 6,9", format exigé par l'App Store)
- `store/screenshots/android/` : 1080 × 2400
- `store/google-play-feature-graphic.png` : bannière Google Play 1024 × 500
- l'icône 1024 × 1024 est dans `assets/icon-only.png`

## 6. Publier sur Google Play

1. **Version** : dans `android/app/build.gradle`, augmentez `versionCode` (entier, +1 à chaque envoi) et `versionName` (ex. `1.0.1`).
2. Android Studio → *Build → Generate Signed App Bundle* → *Android App Bundle* → créez une **clé de signature** (fichier `.jks`). Gardez ce fichier et son mot de passe en lieu sûr, hors du dépôt Git : il sera demandé à chaque mise à jour.
3. Play Console → *Créer une application* → importez le fichier `.aab` dans *Tests internes* et testez-le.
4. Complétez la fiche :
   - **Fiche du Store** : description, captures, icône, bannière.
   - **Règles relatives aux contenus** :
     - *Sécurité des données* : données collectées (nom, e-mail, messages, identifiants d'appareil), aucune donnée partagée avec des tiers pour publicité, chiffrement en transit : oui, suppression possible : oui.
     - *Public cible* : Mentora vise des collégiens. Si vous incluez les moins de 13 ans, le programme *Familles* de Google s'applique (pas de publicité, contenu adapté). Sinon, choisissez « 13 ans et plus » et adaptez les conditions.
     - *Classification du contenu* : catégorie Éducation, et déclarez que les utilisateurs peuvent communiquer entre eux.
     - *Suppression de compte* : URL `https://<votre-domaine>/profil`.
5. Envoyez en production. Le premier examen prend en général quelques jours.

## 7. Publier sur l'App Store

1. `npm run mobile:ios` pour ouvrir le projet dans Xcode.
2. Cible *App* → **Signing & Capabilities** :
   - *Team* : votre compte Apple Developer
   - **+ Capability → Push Notifications**
   - **+ Capability → Background Modes** → cochez *Remote notifications* (déjà déclaré dans `Info.plist`)
3. **Version** : *General* → *Version* (ex. `1.0.0`) et *Build* (+1 à chaque envoi).
4. Choisissez la cible *Any iOS Device*, puis *Product → Archive* → *Distribute App* → *App Store Connect*.
5. Dans [App Store Connect](https://appstoreconnect.apple.com) :
   - Testez d'abord via **TestFlight**.
   - Fiche : nom, sous-titre, description, mots-clés, captures, URL d'assistance (`/support`), URL de confidentialité (`/confidentialite`).
   - **Confidentialité de l'app** : coordonnées (nom, e-mail), contenu utilisateur (messages), identifiants (ID utilisateur, identifiant d'appareil pour les notifications). Toutes ces données sont liées à l'utilisateur, aucune n'est utilisée pour le suivi publicitaire.
   - **Classification par âge** : déclarez la communication entre utilisateurs. Si vous visez des enfants, la catégorie *Enfants* impose des règles supplémentaires ; une classification 12+ est généralement adaptée.
   - **Informations pour l'examen** : fournissez **deux comptes de démonstration** (un élève, un enseignant, déjà mis en relation) avec leurs mots de passe, et expliquez où trouver le signalement et le blocage (dans la conversation) et la suppression de compte (*Mon profil*).
6. Soumettez pour examen. Comptez 1 à 3 jours.

Motifs de refus fréquents, déjà traités dans Mentora :

| Règle Apple | Réponse dans Mentora |
| --- | --- |
| 4.2 Fonctionnalité minimale (« simple site web ») | Notifications push, écran hors-ligne, intégration native |
| 5.1.1 Suppression de compte | *Mon profil* → *Supprimer mon compte* |
| 1.2 Contenu généré par les utilisateurs | *Signaler* et *Bloquer* dans chaque conversation, contact dans `/support` |
| 5.1.1 Politique de confidentialité | `/confidentialite`, accessible dans l'appli (pied de page) |

## 8. Mettre à jour l'appli

| Changement | Que faire |
| --- | --- |
| Pages, design, textes, fonctionnalités web | Déployez sur Vercel : c'est en ligne tout de suite, dans l'appli aussi |
| Base de données | Nouvelle migration Supabase |
| Icône, nom, plugin natif, permissions, version de Capacitor | `npm run mobile:sync`, augmentez les numéros de version, puis renvoyez sur les deux stores |
