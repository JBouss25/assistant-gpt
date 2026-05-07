# Plan d'Architecture Logicielle — ERP Scolaire 360° Premium

**Version :** 1.0  
**Date :** 2026-05-07  
**Statut :** Document de référence — Architecture initiale

---

## Table des matières

1. [Vue d'ensemble et principes directeurs](#1-vue-densemble)
2. [Architecture Microservices — Décomposition des domaines](#2-architecture-microservices)
3. [Stack technique détaillé](#3-stack-technique)
4. [Infrastructure Cloud et déploiement](#4-infrastructure-cloud)
5. [Sécurité et conformité RGPD / CNDP](#5-sécurité)
6. [Interopérabilité et API Gateway](#6-interopérabilité)
7. [Couche IA — Architecture des modèles](#7-couche-ia)
8. [Défis critiques de scalabilité](#8-défis-de-scalabilité)
9. [Roadmap technique sur 5 mois](#9-roadmap)

---

## 1. Vue d'ensemble

### 1.1 Paradigme architectural

Le système repose sur une architecture **Event-Driven Microservices** avec un bus de messages central. Chaque domaine fonctionnel est un service autonome (déployable et scalable indépendamment), communiquant via :

- **Synchrone :** API REST / GraphQL pour les requêtes front-end
- **Asynchrone :** Apache Kafka pour les événements inter-services (ex: une absence génère une notification, qui déclenche l'analyse de décrochage)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTS (Navigateurs / Apps Mobiles)         │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────────┐
│                    CDN (Cloudflare) + WAF                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                    API GATEWAY (Kong)                               │
│   Auth · Rate Limiting · Routing · Load Balancing · Logging        │
└──┬─────────┬──────────┬──────────┬──────────┬────────┬─────────────┘
   │         │          │          │          │        │
   ▼         ▼          ▼          ▼          ▼        ▼
[Core     [Vie      [Finance]  [LMS]    [AI/ML   [Notif
 Admin]   Scolaire]             Service] Engine]  Service]
   │         │          │          │          │        │
   └─────────┴──────────┴──────────┴──────────┴────────┘
                             │
                    ┌────────▼─────────┐
                    │   Kafka Bus      │
                    └──────────────────┘
```

### 1.2 Principes non-négociables

| Principe | Implémentation |
|----------|----------------|
| **Zero-Trust Security** | JWT + mTLS entre services, RBAC granulaire |
| **Data Sovereignty** | Hébergement cloud souverain (OVH Graveline FR ou AWS Paris) |
| **Offline-First Mobile** | PWA avec synchronisation différée (Service Workers) |
| **Multi-Tenant Ready** | Isolation par `school_id` dans chaque microservice (niveau row ou schema PostgreSQL) |
| **Audit Trail complet** | Chaque mutation de donnée génère un event Kafka immutable |

---

## 2. Architecture Microservices — Décomposition des domaines

### 2.1 Cartographie des services

```
SERVICES MÉTIER (Bounded Contexts)
├── core-admin-service          ← Etablissements, RH, inscriptions, dossiers élèves
├── timetable-service           ← Emploi du temps, salles, contraintes
├── attendance-service          ← Assiduité, pointage, justificatifs
├── gradebook-service           ← Notes, bulletins, compétences
├── lms-service                 ← Cours, devoirs, ressources, parcours
├── finance-service             ← Facturation, paiements, relances
├── inventory-service           ← Stocks, équipements, maintenance
├── orientation-service         ← Suivi orientation, admissions post-bac
├── communication-service       ← Messagerie interne, notifications
├── ai-prediction-service       ← Décrochage, recommandations
├── chatbot-service             ← OostudyBot (LLM RAG)
└── analytics-service           ← Tableaux de bord, reporting BI

SERVICES TRANSVERSES (Cross-cutting concerns)
├── api-gateway                 ← Kong Gateway
├── auth-service                ← Keycloak (OIDC/OAuth2)
├── notification-service        ← Push / WhatsApp / Email / SMS
├── file-storage-service        ← Documents, médias (S3-compatible)
├── audit-service               ← Journal d'audit immutable
└── config-service              ← Configuration centralisée (Consul)
```

### 2.2 Détail des interactions critiques

#### Flux : Absence d'un élève (temps réel)

```
[QR Scanner / Bio]
      │ HTTP POST /attendance
      ▼
[attendance-service]
      │ Kafka event: ABSENCE_RECORDED {eleve_id, cours_id, timestamp}
      ├──► [notification-service]  → WhatsApp au parent (< 2 min)
      ├──► [ai-prediction-service] → Mise à jour du score de décrochage
      └──► [gradebook-service]     → Impact sur la note de participation
```

#### Flux : Génération du bulletin trimestriel

```
[Admin déclenche la génération]
      │
      ▼
[gradebook-service]
  ├── Agrège notes depuis PostgreSQL
  ├── Calcule moyennes pondérées (formules configurables par établissement)
  ├── Appelle [ai-prediction-service] → Génère appréciations textuelles
  ├── Génère PDF via [file-storage-service]
  └── Publie BULLETIN_GENERATED → [notification-service] → Email parents
```

#### Flux : Paiement de scolarité

```
[Parent sur portail]
      │
      ▼
[finance-service]
  ├── Crée facture (statut: PENDING)
  ├── Redirige vers [payment-gateway] (CMI Maroc / Stripe International)
  ├── Webhook de confirmation → Mise à jour statut PAID
  ├── Émet PAYMENT_CONFIRMED → [notification-service] → Reçu PDF par email
  └── Si FAILED → planifie relance automatique (J+3, J+7, J+14)
```

---

## 3. Stack Technique

### 3.1 Front-end

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| **Framework** | Next.js 14 (App Router) | SSR/SSG, performance, SEO |
| **UI Library** | Shadcn/UI + Tailwind CSS | Design system cohérent, accessibilité |
| **State Management** | Zustand + React Query (TanStack) | Cache serveur + état local découplés |
| **Graphiques** | Recharts + D3.js | Tableaux de bord analytics |
| **Mobile** | PWA + React Native (Expo) | App mobile iOS/Android partagée |
| **Internationalisation** | next-intl | Français / Arabe (RTL) / Anglais |
| **Tests** | Vitest + Playwright | Unit + E2E |

### 3.2 Back-end

| Service | Technologie | Port/Protocol |
|---------|-------------|---------------|
| **API Gateway** | Kong + Nginx | 443 (HTTPS) |
| **Auth** | Keycloak 23 | OIDC/OAuth2 |
| **Services métier** | Node.js 20 (Fastify) | REST + gRPC inter-services |
| **Services IA** | Python 3.12 / FastAPI | REST |
| **Message Bus** | Apache Kafka 3.6 | 9092 |
| **Cache** | Redis 7 (Cluster) | 6379 |
| **Search** | Elasticsearch 8 | 9200 |

### 3.3 Bases de données

| Service | DB Principale | DB Cache | Justification |
|---------|---------------|----------|---------------|
| core-admin | PostgreSQL 16 | Redis | ACID, relations complexes |
| timetable | PostgreSQL 16 | Redis | Contraintes transactionnelles |
| attendance | PostgreSQL 16 + TimescaleDB | Redis | Séries temporelles, partitionnement |
| gradebook | PostgreSQL 16 | Redis | Calculs, reporting |
| lms | PostgreSQL 16 + S3 | Redis | Fichiers volumineux externalisés |
| finance | PostgreSQL 16 | Redis | Intégrité financière |
| ai-prediction | PostgreSQL 16 + MLflow | — | Modèles versionnés |
| analytics | ClickHouse | — | OLAP, agrégations rapides |

### 3.4 Intelligence Artificielle

| Module IA | Modèle | Framework | Déclencheur |
|-----------|--------|-----------|-------------|
| Prédiction décrochage | XGBoost + LSTM | scikit-learn / PyTorch | Quotidien (batch) + temps réel |
| Génération appréciations | LLM (Mistral-7B fine-tuné) | LangChain + Ollama | À la demande |
| OostudyBot | RAG sur LLM Claude API | LangChain + Chroma DB | Conversationnel |
| Correction assistée | CamemBERT + GPT-4o | Transformers | Upload de copie |
| Optimisation énergie | Reinforcement Learning (PPO) | Stable-Baselines3 | Programmé (toutes les 30 min) |

---

## 4. Infrastructure Cloud

### 4.1 Topologie de déploiement

```
PRODUCTION (AWS eu-west-3 Paris ou OVH Graveline)
├── VPC Privé
│   ├── Subnet Public (Load Balancers, API Gateway)
│   └── Subnet Privé (Services, BDD, Cache)
│
├── Kubernetes (EKS / OVH Managed Kubernetes)
│   ├── Namespace: production
│   │   ├── Deployments : tous les microservices
│   │   ├── StatefulSets : Kafka, Redis Cluster
│   │   └── HPA : Auto-scaling basé sur CPU/RPS
│   ├── Namespace: monitoring
│   │   ├── Prometheus + Grafana
│   │   ├── Jaeger (tracing distribué)
│   │   └── Loki (centralisation logs)
│   └── Namespace: ai-workloads
│       └── GPU Node Pool (pour inférence LLM)
│
├── Managed Databases
│   ├── RDS PostgreSQL Multi-AZ (par service)
│   ├── ElastiCache Redis Cluster
│   └── MSK (Managed Kafka)
│
└── Storage
    ├── S3 (documents, bulletins PDF, médias LMS)
    └── EFS (volumes partagés pods IA)
```

### 4.2 CI/CD Pipeline

```
Developer Push → GitHub Actions
                      │
              ┌───────▼────────┐
              │  Lint + Tests  │ (Vitest, pytest, ESLint)
              └───────┬────────┘
                      │ ✓
              ┌───────▼────────┐
              │  Build Docker  │ (multi-stage, distroless)
              └───────┬────────┘
                      │ ✓
              ┌───────▼────────┐
              │  SAST/DAST     │ (Trivy, SonarQube, OWASP ZAP)
              └───────┬────────┘
                      │ ✓
              ┌───────▼────────┐
              │  Push Registry │ (ECR / Harbor privé)
              └───────┬────────┘
                      │ ✓
              ┌───────▼────────┐
              │  ArgoCD Deploy │ (GitOps, canary 5%→100%)
              └────────────────┘
```

---

## 5. Sécurité et Conformité

### 5.1 Modèle RBAC (Role-Based Access Control)

| Rôle | Périmètre |
|------|-----------|
| `SUPER_ADMIN` | Toutes les écoles (opérateur de la plateforme) |
| `SCHOOL_ADMIN` | Un établissement — toutes fonctions |
| `PRINCIPAL` | Direction pédagogique et administrative |
| `TEACHER` | Ses classes, notes, cours LMS |
| `STUDENT` | Son profil, ses notes, son emploi du temps, LMS |
| `PARENT` | Enfant(s) lié(s) uniquement |
| `FINANCE_OFFICER` | Module financier uniquement |
| `HR_OFFICER` | Module RH uniquement |
| `COUNSELOR` | Orientation, alertes décrochage |

### 5.2 Mesures de sécurité techniques

- **Chiffrement at-rest :** AES-256 pour les données sensibles (dossiers médicaux, informations bancaires)
- **Chiffrement in-transit :** TLS 1.3 obligatoire, mTLS entre microservices
- **Secrets management :** HashiCorp Vault — rotation automatique des credentials DB
- **OWASP Top 10 :** Checklist intégrée dans la CI/CD (ZAP scanning automatique)
- **Anonymisation RGPD :** Pseudonymisation des données analytics, droit à l'effacement implémenté
- **Conformité loi 09-08 CNDP :** Registre des traitements, DPO désigné, formulaires de consentement
- **MFA obligatoire :** Pour tous les rôles > STUDENT (TOTP ou passkey WebAuthn)
- **Rate limiting :** Kong: 100 req/min par utilisateur, 1000 req/min par établissement

### 5.3 Politique de sauvegarde

| Type | Fréquence | Rétention | Destination |
|------|-----------|-----------|-------------|
| Snapshot BDD | Toutes les 6h | 30 jours | S3 chiffré |
| Backup complet | Quotidien | 1 an | S3 Glacier |
| WAL (PostgreSQL) | Continu | 7 jours | Région secondaire |
| Fichiers S3 | Versioning activé | 90 jours | Réplication cross-région |

**RTO : 2h — RPO : 15 minutes**

---

## 6. Interopérabilité et API Gateway

### 6.1 Intégrations prioritaires

| Système externe | Type | Protocole | Priorité |
|----------------|------|-----------|----------|
| **Massar** (MEN Maroc) | Import/Export notes, effectifs | REST + CSV SFTP | P0 |
| **Google Workspace** | SSO, Google Classroom sync | OAuth2 + API | P1 |
| **Microsoft 365** | SSO, Teams, OneDrive | OAuth2 + Graph API | P1 |
| **CMI Maroc** | Paiements en ligne | WebService CMI | P0 |
| **Stripe** | Paiements internationaux | REST webhooks | P1 |
| **WhatsApp Business** | Notifications parents | Cloud API (Meta) | P0 |
| **Twilio** | SMS de secours | REST | P1 |
| **Sendgrid** | Emails transactionnels | REST | P0 |

### 6.2 API publique (ouverture tiers)

- **Standard :** OpenAPI 3.1, documentation Swagger auto-générée
- **Versioning :** URL-based (`/api/v1/`, `/api/v2/`) avec dépréciation sur 12 mois
- **Authentification tierce :** API Keys + OAuth2 Client Credentials
- **Sandbox :** Environnement de test avec données anonymisées pour les intégrateurs

---

## 7. Couche IA — Architecture détaillée

### 7.1 Module de prédiction du décrochage

```
Sources de données → Feature Engineering → Modèle → Score → Alerte

Features utilisées :
- Taux d'assiduité (30 derniers jours, rolling)
- Tendance des notes (pente sur le trimestre)
- Retards de paiement (proxy stress familial)
- Participation aux activités (LMS: connexions, devoirs rendus)
- Données historiques de l'établissement (cohortes précédentes)

Modèle : XGBoost (explicabilité SHAP) + LSTM pour séries temporelles
Score : 0-100 (seuil d'alerte configurable, défaut: 65)
Pipeline MLflow : versioning, A/B testing entre modèles, monitoring de drift
```

### 7.2 OostudyBot — Architecture RAG

```
[Question Parent/Élève]
       │
       ▼
[Query Analysis] → détection d'intention (règlements, dates, paiements...)
       │
       ▼
[Retrieval] → Chroma DB (vectorisé sur: règlement intérieur, calendrier,
              FAQ établissement, circulaires, procédures)
       │
       ▼
[Augmentation] → Contexte injecté dans le prompt système
       │
       ▼
[Generation] → Claude API (claude-sonnet-4-6) avec température 0.3
       │
       ▼
[Response] + source citée + escalade humaine si confiance < 0.7
```

### 7.3 Génération d'appréciations

- Modèle : Mistral-7B fine-tuné sur 50 000 bulletins scolaires français/marocains
- Entrées : moyenne, tendance, compétences maîtrisées, niveau de classe
- Sortie : appréciation de 30-50 mots, ton pédagogique, en français ou arabe
- Validation humaine obligatoire avant impression du bulletin

---

## 8. Défis Critiques de Scalabilité

### 8.1 Pic de charge : la "rentrée scolaire"

**Problème :** En septembre, 100% des 4000 élèves et parents se connectent simultanément pour consulter emplois du temps, bulletins, et effectuer les paiements. Cela représente potentiellement **8000-12 000 sessions concurrentes** sur 48h.

**Solutions :**
```
1. Auto-scaling Kubernetes (HPA)
   - Déclencheur : CPU > 60% OU RPS > 500 sur le service
   - Scale-up en 90 secondes (métriques KEDA + Kafka lag)
   - Pré-scaling planifié : +3 replicas 48h avant rentrée (CronJob)

2. Cache agressif (Redis)
   - Emploi du temps : TTL 24h (invalidation sur modification)
   - Bulletins PDF : stockés S3, URL pré-signée (pas de génération à la volée)
   - Notes de classe : cache 5 min (acceptable pour consultation)

3. Queue pour opérations lourdes
   - Génération bulletins : job asynchrone (BullMQ)
   - Calcul des emplois du temps : déclenché hors-heures (23h-5h)
   - Import/export Massar : batch nocturne

4. CDN pour actifs statiques
   - Bulletins PDF servis depuis Cloudflare R2 (edge caching)
   - Ressources LMS (vidéos, PDFs cours) → streaming depuis S3 + CloudFront
```

### 8.2 Génération de l'emploi du temps — Complexité algorithmique

**Problème :** Générer un emploi du temps valide pour 4000 élèves, 200 professeurs, 80 salles, sur 30+ semaines est un problème NP-difficile (bin-packing + graph coloring).

**Solutions :**
```
1. Algorithme hybride :
   - Phase 1 : Constraint Propagation (AC-3) pour réduire l'espace de recherche
   - Phase 2 : Algorithme génétique (DEAP library) pour optimisation multi-critères
   - Phase 3 : Local Search (simulated annealing) pour ajustements fins

2. Contraintes dures vs. souples :
   - Dures (non-violables) : un prof ne peut pas être en 2 salles
   - Souples (pénalisées) : éviter les heures creuses en milieu de journée

3. Génération offline :
   - Lancé en batch (nuit), résultat publié le matin
   - API de modification manuelle avec vérification des conflits en temps réel
   - Tolérance : qualité "acceptable" en < 5 min plutôt qu'optimal en 2h
```

### 8.3 Scalabilité de la base de données

**Problème :** 4000 élèves × 8 matières × 3 trimestres × 6 ans = 576 000 entrées de notes. Avec l'historique sur 10 ans et les logs d'assiduité (10 appels/jour × 200 jours × 4000 élèves = 8M de lignes/an), la volumétrie devient critique.

**Solutions :**
```
1. Partitionnement PostgreSQL
   - attendance_logs : partitionnée par RANGE sur (annee_scolaire, mois)
   - grades : partitionnée par HASH sur (school_id)
   - Archivage automatique après 7 ans (politique de rétention légale)

2. TimescaleDB pour les séries temporelles
   - attendance_service utilise TimescaleDB
   - Compression automatique des données > 6 mois (-95% espace disque)
   - Continuous aggregates pour les stats sans requêtes lourdes

3. Read Replicas
   - 2 replicas PostgreSQL en lecture seule pour les dashboards et rapports
   - ClickHouse pour les analytics (OLAP) — données répliquées via CDC (Debezium)

4. Connection Pooling
   - PgBouncer devant chaque PostgreSQL (mode transaction)
   - Max 100 connexions physiques, supporte 10 000 connexions applicatives
```

### 8.4 Système de notifications en temps réel

**Problème :** WhatsApp + Push + Email à 8000 parents simultanément (ex: alerte météo, note publiée) = risque de thundering herd et de throttling API.

**Solutions :**
```
1. Queue avec rate-limiting (BullMQ)
   - WhatsApp Business API : 80 messages/seconde max
   - Files distinctes par priorité : URGENCE > ABSENCE > BULLETIN > RAPPEL
   - Backoff exponentiel sur les échecs (retry × 3)

2. Batching intelligent
   - Agrégation : 1 seule notification "5 nouvelles notes publiées" au lieu de 5
   - Fenêtre de batching configurable (défaut : 10 min pour non-urgent)

3. Fallback cascade
   - Primary : WhatsApp Business API
   - Fallback 1 : Push Notification (FCM/APNs)
   - Fallback 2 : SMS (Twilio)
   - Fallback 3 : Email (Sendgrid)
```

### 8.5 Sécurité à l'échelle

**Problème :** Gérer les sessions et tokens JWT pour 12 000 utilisateurs actifs, avec révocation immédiate en cas de compromission de compte.

**Solutions :**
```
1. Token Revocation List
   - Redis Set pour les tokens révoqués (TTL = durée restante du JWT)
   - Vérifié à chaque requête au niveau API Gateway (Kong plugin)

2. JWT Courts avec Refresh Tokens
   - Access token : 15 minutes
   - Refresh token : 7 jours (stocké HttpOnly cookie)
   - Révocation par famille de tokens (un seul appel Keycloak)

3. Suspicious Activity Detection
   - Login depuis un nouveau pays → MFA forcé + alerte admin
   - > 5 tentatives échouées → lockout 15 minutes + alerte
```

---

## 9. Roadmap Technique sur 5 Mois

### Mois 1 — Fondations
```
Semaine 1-2 :
  ✦ Design System (Figma + Storybook) — UI Components library
  ✦ Infrastructure as Code (Terraform) — Provisionnement cloud
  ✦ CI/CD Pipeline (GitHub Actions + ArgoCD)
  ✦ Service Keycloak (auth) + API Gateway (Kong) — skeleton

Semaine 3-4 :
  ✦ core-admin-service : Établissements, Années scolaires
  ✦ core-admin-service : Inscriptions élèves, dossiers
  ✦ core-admin-service : RH (professeurs, personnels)
  ✦ file-storage-service : Upload documents
  ✦ First integration test suite
```

### Mois 2 — Vie Scolaire
```
Semaine 5-6 :
  ✦ timetable-service : Algorithme de génération (v1 — greedy)
  ✦ timetable-service : Interface de validation/modification manuelle
  ✦ attendance-service : API de pointage QR Code

Semaine 7-8 :
  ✦ attendance-service : Intégration biométrique (plugin modulaire)
  ✦ notification-service : WhatsApp Business + Email (absences)
  ✦ communication-service : Messagerie interne parent/école
  ✦ Tests de charge (k6) — objectif: 1000 utilisateurs concurrents
```

### Mois 3 — Finance et LMS
```
Semaine 9-10 :
  ✦ finance-service : Facturation, catalogue de frais
  ✦ finance-service : Intégration CMI Maroc (sandbox)
  ✦ gradebook-service : Saisie des notes, calcul moyennes
  ✦ gradebook-service : Génération bulletins PDF

Semaine 11-12 :
  ✦ lms-service : Dépôt de ressources (cours, vidéos)
  ✦ lms-service : Devoirs en ligne (rendu + correction)
  ✦ orientation-service : Module conseil/suivi
  ✦ Tests de charge : 5000 utilisateurs concurrents
```

### Mois 4 — IA et Bêta
```
Semaine 13-14 :
  ✦ ai-prediction-service : Pipeline de données + modèle XGBoost v1
  ✦ chatbot-service : OostudyBot RAG (base documentaire)
  ✦ Génération d'appréciations (LLM fine-tuning pipeline)
  ✦ analytics-service : Dashboards KPI établissement

Semaine 15-16 :
  ✦ Déploiement bêta — groupe témoin (1 lycée, 200 élèves)
  ✦ Monitoring temps réel (Grafana + alertes PagerDuty)
  ✦ Correction des bugs critiques P0/P1
  ✦ Audit de sécurité (pentest externe)
```

### Mois 5 — Recette et Production
```
Semaine 17-18 :
  ✦ Correction bugs remontés en bêta
  ✦ Tests de performance finals (10 000 utilisateurs)
  ✦ Audit RGPD / CNDP (DPO review)
  ✦ Documentation API complète (OpenAPI 3.1)

Semaine 19-20 :
  ✦ Formation équipes (admins, enseignants, parents) — vidéos + docs
  ✦ Migration des données historiques (si remplacement d'ancien système)
  ✦ Go-Live progressif (rolling deployment 20% → 50% → 100%)
  ✦ Hypercare post-lancement (équipe support 24/7 × 2 semaines)
```

---

## Annexes

### A. Estimations de charge

| Métrique | Valeur (4000 élèves) |
|----------|---------------------|
| Utilisateurs actifs simultanés (normal) | ~800 |
| Utilisateurs actifs simultanés (pic rentrée) | ~10 000 |
| Requêtes/seconde (normal) | ~200 RPS |
| Requêtes/seconde (pic) | ~2000 RPS |
| Volume BDD annuel (toutes tables) | ~50 GB |
| Volume fichiers S3 annuel | ~200 GB |
| Messages Kafka/jour | ~500 000 |

### B. SLA cibles

| Métrique | Cible |
|----------|-------|
| Disponibilité | 99.9% (< 9h de downtime/an) |
| Latence API P95 | < 500ms |
| Latence API P99 | < 2s |
| Temps de génération bulletin | < 30s |
| Délai notification absence | < 2 minutes |

### C. Équipe technique recommandée

| Rôle | Nb | Mois actif |
|------|----|-----------|
| Tech Lead / Architecte | 1 | 1-5 |
| Développeurs Full-Stack (Next.js + Node) | 3 | 1-5 |
| Développeurs Back-end (Node/Python) | 2 | 1-5 |
| Data Scientist / ML Engineer | 1 | 2-5 |
| DevOps / Cloud Engineer | 1 | 1-5 |
| UX/UI Designer | 1 | 1-3 |
| QA Engineer | 1 | 3-5 |
| **Total** | **10** | — |
