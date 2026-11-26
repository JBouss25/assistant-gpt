# Hypothèses, écarts et questions ouvertes

Livrable n° 6 du prompt maître : tout ce qui a dû être supposé pour construire ce premier MVP local,
et ce qui reste à décider ou à faire. Rien n'a été inventé en silence : chaque point ci-dessous est
soit une hypothèse explicite, soit un écart assumé.

## 1. Couverture du cahier des charges

| Module | État dans ce MVP local | Reste à faire |
| --- | --- | --- |
| M1 Onboarding adaptatif | Fait : système, niveau, filière / spécialités, langue, ville, contraintes, certitude, consentement, invitation parent par e-mail (SMTP) | Invitation par SMS (fournisseur à choisir) ; vérification de l'identité du parent par l'établissement |
| M2 Évaluation | Formes fixes : RIASEC (30 items), jugement situationnel (3), mini-défis (6), esprit critique IA (4), valeurs (tri de 7 cartes), auto-efficacité, adaptabilité, tolérance à l'incertitude ; reprise en 3 sessions ; copie locale hors-ligne | Calibration IRT (≥ 500 élèves / niveau / langue), DIF, CAT en V1, items en arabe |
| M3 Recommandation explicable | Fait : étapes 1 à 5 de la section 6.3, fourchettes Monte-Carlo, A/B/C + exploratoire, contributions exactes, contrefactuels, plan 6–12 mois, sources datées, schéma de l'annexe A | Pondérations à valider par le comité |
| M4 Simulateur | Version complète (notes, budget, mobilité) avec explication des changements | — |
| M5 Feuille de route & carnet | Fait (preuves vérifiables par le conseiller, jalons) | Dépôt de fichiers (stockage objet chiffré) |
| M6 Explorateur | Fait : métiers (tâches a/b/c, Avenir +5 décomposé), formations (graphe, passerelles), calendrier | Référentiel réel ≥ 150 métiers / 300 formations |
| M7 Coach IA | FAQ guidée (prévu MVP) ; passerelle LLM et validateur déjà en place | Coach RAG socratique en V1 (pgvector + BM25), détection de détresse |
| M8 Espace parent | Fait : synthèse une page, comprendre les voies, en parler ensemble, partage granulaire | Version arabe des contenus |
| M9 Conseiller / établissement | Fait : cohorte filtrable, carte de chaleur, 5 types d'alertes, ateliers, fiche imprimable, notes chiffrées, import CSV, statistiques k ≥ 10, audit | SSO établissement (V1) |
| M10 Back-office référentiel | Fait : versions, workflow éditeur → comité → publication sans redéploiement, validation bloquante | Éditeur de formulaire (aujourd'hui édition JSON) |
| M11 Calendrier & notifications | Échéances affichées (données administrables) | Rappels push / e-mail (V1) |

Tests : 41 tests automatisés (cas Yasmine, Adam, Léa ; banc de 300 cas : 0 formulation proscrite, 0 écart
factuel ; équité par inversion du genre ; consentement et révocation immédiate ; RBAC inter-établissements ;
rejouabilité ; latence du simulateur ; workflow du référentiel ; k-anonymat ; chiffrement au repos ; audit
immuable) + parcours navigateur de bout en bout à 360 px.

## 2. Hypothèses retenues

- **H-01 — Données du référentiel.** Les 30 métiers et 64 voies / formations sont un échantillon de
  démonstration. D, A, M, seuils, coûts et villes sont marqués `SRC-DEMO-*` et affichés comme tels. Les tâches
  (6 par métier au lieu de 10 à 25) sont une première décomposition à faire valider par des professionnels.
- **H-02 — Indice H.** H = 100 × (0 × part a + 0,6 × part b + 1 × part c). Le coefficient 0,6 des tâches
  augmentées est paramétrable (`meta.h_weights`) et doit être fixé par le comité.
- **H-03 — Similarité d'intérêts.** Cosinus calculé sur des profils **centrés** (sinon tous les profils
  positifs se ressemblent), ramené sur 0–100 ; code Holland pondéré 1 / 0,6 / 0,3.
- **H-04 — Compétences.** C = 75 % adéquation aux notes (pondérées par matière, 0 à « niveau conseillé − 6 »,
  100 % à « niveau conseillé + 2 ») + 25 % mini-défis.
- **H-05 — Faisabilité.** Régression logistique p = σ(1,7 × (indice − seuil) / échelle), avec seuil et échelle
  par formation (à estimer sur les seuils historiques réels). Accès ouvert : p = 0,95. Budget et mobilité
  appliquent des facteurs (0,5 / 0,85 / 0,7) sans jamais exclure.
- **H-06 — Catégories.** A si p < 0,45 ; B si 0,45 ≤ p < 0,80 ; C sinon.
- **H-07 — Pondérations 1re Bac / Première.** Le tableau de la section 6.3 a 3 colonnes ; la colonne
  « Tronc commun / Seconde » est utilisée pour la 1re Bac / Première.
- **H-08 — Erreurs standard au MVP.** Approximation par la théorie classique des tests (Spearman-Brown,
  fidélité d'item 0,45) en attendant la calibration IRT.
- **H-09 — Notes absentes.** Une matière non renseignée prend la moyenne générale de l'élève (12/20 si aucune
  note) ; l'incertitude est propagée par Monte-Carlo.
- **H-10 — Consentement parental.** Pour un mineur, le calcul des pistes est bloqué tant que le représentant
  légal n'a pas validé (désactivable par `PARENTAL_CONSENT_REQUIRED`). Le parent ne voit ensuite que ce que
  l'élève partage. À confirmer par le juriste (loi 09-08 / CNDP).
- **H-11 — Résidence.** Tous les élèves résident au Maroc ; une formation en France demande donc une
  « mobilité internationale ».
- **H-12 — Taux de change de démonstration.** 1 EUR = 10,8 MAD, à rendre administrable.
- **H-13 — Session.** Jeton JWT stocké côté navigateur pour la PWA ; passage à des cookies httpOnly + MFA
  pour conseillers et admins prévu avec Keycloak (V1).
- **H-14 — Fournisseur LLM.** Par défaut, gabarits déterministes (aucun appel externe, aucune donnée ne
  quitte le serveur). Les explications passent tout de même par la chaîne complète (payload pseudonymisé →
  génération → validation → repli), ce qui permet de brancher un LLM sans changer le reste.
- **H-15 — Première au système français.** Le choix de la spécialité abandonnée n'est pas encore modélisé :
  le niveau est grisé (« bientôt ») dans l'onboarding.

## 3. Écarts techniques assumés pour un test local

- PostgreSQL 16 + pgvector via Docker Compose, schéma géré par Alembic ; la suite de tests passe sur
  PostgreSQL comme sur SQLite. Les embeddings (RAG du coach V1) ne sont pas encore créés.
- Pas encore de Redis / workers : le calcul (≈ 15 à 30 ms par élève, Monte-Carlo compris) est fait en ligne.
- Export PDF par la fonction d'impression du navigateur (feuilles de style d'impression dédiées).
- Chiffrement applicatif Fernet (AES-128-CBC + HMAC) ; la cible AES-256 avec gestion de clés dédiée (KMS)
  est à brancher à l'hébergement.
- Images Docker (API non-root, front Next.js « standalone »), Compose de production (Caddy HTTPS, sauvegardes
  chiffrées) et scripts serveur fournis ; pas encore de CI ni de supervision externe (alertes de disponibilité).
- L'invitation parent prouve l'accès à une boîte e-mail, pas l'identité du représentant légal : pour le pilote,
  prévoir une vérification par l'établissement (question ouverte n° 4).
- La limitation des tentatives de connexion et le cache du référentiel sont en mémoire, par processus :
  passer à Redis en multi-instances.

## 4. Questions ouvertes (à trancher par le porteur du projet)

1. **Fournisseur et hébergement du LLM** : quel fournisseur, hébergé où (contrainte d'hébergement au Maroc et de
   non-réutilisation des données) ? Faut-il un modèle hébergé localement ?
2. **Référentiel réel** : qui produit et valide les 150 métiers / 300 formations (équipe éditoriale interne,
   partenaire, comité scientifique déjà constitué) ? Accès aux seuils officiels des concours ?
3. **Établissements pilotes** : lesquels (dont au moins un lycée de la mission française) et avec quels systèmes
   d'identité (SSO) ?
4. **Consentement parental** : confirmer avec le juriste la règle H-10 (blocage du calcul avant validation) et
   les durées de conservation.
5. **Langue arabe** : traduction des contenus du référentiel et des items dès le pilote ou en V1 ?
6. **Hébergement cible** : fournisseur cloud au Maroc retenu, pour préparer l'infrastructure as code.
