# ERP Scolaire 360° — Guide de démarrage local

**Stack** : Node.js 20 · TypeScript strict · Python 3.11 · FastAPI · PostgreSQL 16 · Redis 7 · Apache Kafka · Keycloak 23 · Kong 3.6 · React 18 · Docker Compose

---

## Prérequis

| Outil | Version minimale | Vérification |
|-------|-----------------|--------------|
| Docker Desktop / Engine | 24.x | `docker --version` |
| Docker Compose | 2.24 | `docker compose version` |
| Node.js | 20.x | `node --version` |
| Python | 3.11 | `python --version` |
| make | ≥ 3.8 | `make --version` |
| k6 (optionnel) | 0.50 | `k6 version` |

> **RAM recommandée** : 8 Go minimum pour la stack complète. Pour une machine avec 4 Go, démarrez uniquement l'infrastructure + 2–3 services (voir §5).

---

## 1. Cloner et configurer l'environnement

```bash
# Cloner le dépôt
git clone https://github.com/JBouss25/assistant-gpt.git
cd assistant-gpt/erp-scolaire

# Copier le fichier d'environnement
cp .env.example .env
```

Ouvrez `.env` et remplissez les valeurs obligatoires :

```env
# Mots de passe (remplacez TOUS les "change_me_strong_password")
CORE_ADMIN_DB_PASSWORD=MonMotDePasse123!
TIMETABLE_DB_PASSWORD=MonMotDePasse123!
ATTENDANCE_DB_PASSWORD=MonMotDePasse123!
FINANCE_DB_PASSWORD=MonMotDePasse123!
GRADEBOOK_DB_PASSWORD=MonMotDePasse123!
LMS_DB_PASSWORD=MonMotDePasse123!
NOTIF_DB_PASSWORD=MonMotDePasse123!
AI_DB_PASSWORD=MonMotDePasse123!
CHATBOT_DB_PASSWORD=MonMotDePasse123!
ANALYTICS_DB_PASSWORD=MonMotDePasse123!
KC_DB_PASSWORD=MonMotDePasse123!
KC_ADMIN_PASSWORD=AdminPass123!
REDIS_PASSWORD=RedisPass123!

# Clés de chiffrement (générer avec : openssl rand -hex 32)
ENCRYPTION_KEY=<output de openssl rand -hex 32>
QR_HMAC_SECRET=<output de openssl rand -hex 32>

# Anthropic — requis pour OostudyBot
ANTHROPIC_API_KEY=sk-ant-api03-...

# JWT — remplir après le démarrage de Keycloak (§4)
JWT_PUBLIC_KEY=
```

> Les autres clés (Stripe, CMI, WhatsApp, Firebase, Twilio) ne sont **pas** requises pour le développement local. Les canaux de notification non configurés sont simplement ignorés.

---

## 2. Démarrer l'infrastructure

Démarrez d'abord les services d'infrastructure (bases de données, cache, message broker, auth) :

```bash
make up-infra
```

Attendez que tous les conteneurs soient `healthy` (≈ 60–90 secondes) :

```bash
docker compose ps
# Vérifiez que tous les postgres, redis, kafka, keycloak affichent "healthy"
```

### Vérification rapide

```bash
# PostgreSQL core-admin accessible ?
docker exec erp-pg-core-admin pg_isready -U erpadmin -d core_admin

# Redis accessible ?
docker exec erp-redis redis-cli -a $REDIS_PASSWORD ping
# Réponse attendue : PONG

# Kafka opérationnel ?
docker exec erp-kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

---

## 3. Configurer Keycloak

### 3.1 Accéder à l'interface admin

1. Ouvrez [http://localhost:8080](http://localhost:8080)
2. Connectez-vous avec `admin` / `[KC_ADMIN_PASSWORD défini dans .env]`

### 3.2 Créer le realm

1. Cliquez **Create realm** → **Import** → chargez `infrastructure/keycloak/erp-realm.json` si disponible
2. **Ou** créez manuellement :
   - Realm name : `erp-scolaire`
   - Enabled : ON

### 3.3 Créer un client frontend

```
Client ID:              erp-frontend
Client Protocol:        openid-connect
Access Type:            public
Valid Redirect URIs:    http://localhost:5173/*
Web Origins:            http://localhost:5173
```

### 3.4 Créer un client pour Kong (validation JWT)

```
Client ID:              kong-jwt
Client Protocol:        openid-connect
Access Type:            confidential
Service accounts:       ON
```

### 3.5 Récupérer la clé publique RS256

1. **Realm Settings** → **Keys** → onglet **Active**
2. Cliquez sur **Public key** pour l'algorithme RS256
3. Copiez la clé et mettez à jour `.env` :

```env
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBIjAN...votre_cle...\n-----END PUBLIC KEY-----
```

### 3.6 Créer un utilisateur de test

1. **Users** → **Add user**
   - Username : `directeur.test`
   - Email : `directeur@demo-school.ma`
2. Onglet **Credentials** → set password (désactiver "Temporary")
3. Onglet **Role mappings** → assign `SCHOOL_ADMIN`

### 3.7 Obtenir un token de test

```bash
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/erp-scolaire/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=erp-frontend&grant_type=password&username=directeur.test&password=votremotdepasse" \
  | jq -r '.access_token')

echo $TOKEN
# Stockez ce token, vous en aurez besoin pour les tests API
```

---

## 4. Démarrer les microservices

```bash
# Tous les services applicatifs
make up-services

# Surveiller les logs
make logs

# Vérifier les health checks
make health
```

Sortie attendue de `make health` :

```
=== Health Check ===
  Port 3001: 200   ← core-admin-service
  Port 3002: 200   ← timetable-service
  Port 3003: 200   ← attendance-service
  Port 3004: 200   ← finance-service
  Port 3005: 200   ← gradebook-service
  Port 3006: 200   ← lms-service
  Port 3007: 200   ← notification-service
  Port 3008: 200   ← ai-prediction-service
  Port 3009: 200   ← chatbot-service
  Port 3010: 200   ← analytics-service
  Kong:      200
  Frontend:  200
```

---

## 5. Démarrer le frontend

```bash
make up-frontend
```

Ouvrez [http://localhost:5173](http://localhost:5173) dans votre navigateur.

### Alternative — mode développement (hot reload)

```bash
cd services/frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## 6. Tester l'API via Kong (port 8000)

Kong est le point d'entrée unique de toutes les APIs. Tous les exemples utilisent `$TOKEN` récupéré au §3.7.

### 6.1 Core Admin — Créer une école

```bash
curl -s -X POST http://localhost:8000/api/v1/schools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Lycée Al Khawarizmi",
    "code_massar": "MAR001",
    "type": "LYCEE",
    "ville": "Casablanca",
    "region": "Grand Casablanca-Settat"
  }' | jq .

# Notez l'"id" retourné → SCHOOL_ID
export SCHOOL_ID="<id retourné>"
```

### 6.2 Créer une classe

```bash
curl -s -X POST http://localhost:8000/api/v1/classes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-School-ID: $SCHOOL_ID" \
  -d '{
    "school_id": "'$SCHOOL_ID'",
    "nom": "Terminale S1",
    "niveau": "TERMINALE",
    "cycle": "LYCEE",
    "capacite": 35
  }' | jq .
```

### 6.3 Timetable — Emploi du temps

```bash
curl -s http://localhost:8000/api/v1/timetable?school_id=$SCHOOL_ID \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 6.4 Attendance — Enregistrer une absence

```bash
curl -s -X POST http://localhost:8000/api/v1/attendance \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eleve_id": "<eleve-uuid>",
    "classe_id": "<classe-uuid>",
    "school_id": "'$SCHOOL_ID'",
    "date": "'$(date +%Y-%m-%d)'",
    "present": false,
    "justifiee": false
  }' | jq .
```

### 6.5 Finance — Créer une facture

```bash
curl -s -X POST http://localhost:8000/api/v1/finance/factures \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": "'$SCHOOL_ID'",
    "eleve_id": "<eleve-uuid>",
    "montant": 2500.00,
    "type_frais": "SCOLARITE",
    "echeance": "2025-10-01",
    "description": "Frais de scolarité T1 2025"
  }' | jq .
```

### 6.6 LMS — Créer un cours

```bash
curl -s -X POST http://localhost:8000/api/v1/cours \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": "'$SCHOOL_ID'",
    "enseignant_id": "<enseignant-uuid>",
    "matiere_id": "<matiere-uuid>",
    "titre": "Dérivées et applications",
    "description": "Cours de Terminale — chapitre 4",
    "classes": ["<classe-uuid>"]
  }' | jq .
```

### 6.7 Analytics — Tableau de bord directeur

```bash
curl -s http://localhost:8000/api/v1/dashboard/$SCHOOL_ID \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Réponse attendue :
```json
{
  "schoolId": "...",
  "attendance": {
    "total_eleves": 1500,
    "absents_aujourd_hui": 42,
    "taux_presence_jour": 97,
    ...
  },
  "grades": { "moyenne_ecole": 12.8, ... },
  "finance": { "taux_recouvrement": 84, ... },
  "lms": { "taux_completion_moyen": 67.3, ... }
}
```

### 6.8 AI — Prédiction risque de décrochage

```bash
# Score de risque pour un élève
curl -s http://localhost:8000/api/v1/predictions/<eleve-uuid> \
  -H "Authorization: Bearer $TOKEN" | jq .

# Simulation what-if (sans DB)
curl -s -X POST http://localhost:8000/api/v1/predictions/test-eleve/simulate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "absences_30j": 12,
    "retards_30j": 5,
    "moyenne_generale": 7.5,
    "devoirs_non_rendus": 6,
    "factures_impayees": 2,
    "progression_lms": 15.0
  }' | jq .
```

Réponse attendue :
```json
{
  "eleve_id": "test-eleve",
  "risk_score": 0.8234,
  "risk_level": "ELEVE",
  "top_factors": [
    "12 absences ce mois",
    "Moyenne générale 7.5/20",
    "6 devoirs non rendus"
  ]
}
```

### 6.9 OostudyBot — Chat (streaming)

```bash
# Mode non-streaming (plus simple pour tester)
curl -s -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Quelle est la moyenne de ma classe ce trimestre ?"}],
    "stream": false
  }' | jq .

# Mode streaming (SSE)
curl -N -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Résume les absences de cette semaine."}],
    "stream": true
  }'
# Les données arrivent en Server-Sent Events : data: {"text":"..."}
```

---

## 7. Tester les services directement (sans Kong)

Utile pour le débogage unitaire :

```bash
# core-admin-service (port 3001)
curl -s http://localhost:3001/health | jq .

# ai-prediction-service (port 3008) — sans auth pour /health
curl -s http://localhost:3008/health | jq .

# Simulation via FastAPI docs (Swagger UI)
open http://localhost:3008/docs
```

---

## 8. Exécuter les tests unitaires

### Tous les services en une commande

```bash
make test-local
```

### Par service

```bash
# Node.js (Vitest)
cd services/lms-service && npm test
cd services/chatbot-service && npm test
cd services/analytics-service && npm test

# Python (pytest)
cd services/ai-prediction-service
python -m pytest tests/ -v
```

### Résultats attendus

```
✓ renderConsignes — replaces template variables
✓ isValidDateLimite — accepts ISO datetime
✓ calculerStatutRendu — marks on-time submission
✓ DropoutPredictor — heuristic low risk
✓ DropoutPredictor — heuristic high risk
✓ tauxPresence — returns 90 when 10% absent
✓ tauxRecouvrement — calculates correct percentage
...
```

---

## 9. Tests de charge k6

```bash
# Prérequis : installer k6
# macOS : brew install k6
# Linux : sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
#         echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
#         sudo apt-get update && sudo apt-get install k6

# Smoke test (1 VU, vérification rapide)
k6 run \
  --env BASE_URL=http://localhost:8000 \
  --env JWT_TOKEN=$TOKEN \
  infrastructure/k6/smoke.js

# Load test (50 VUs, profil établissement 1500 élèves)
k6 run \
  --env BASE_URL=http://localhost:8000 \
  --env JWT_TOKEN=$TOKEN \
  --env SCHOOL_ID=$SCHOOL_ID \
  infrastructure/k6/load.js
```

### SLOs à atteindre avant la mise en production

| Métrique | Seuil |
|----------|-------|
| `http_req_duration` p(95) | < 500ms (lectures) |
| `write_duration_p95` p(95) | < 2000ms |
| `http_req_failed` | < 1% |
| `custom_error_rate` | < 1% |

---

## 10. Démarrage partiel (machine avec peu de RAM)

Si votre machine dispose de moins de 8 Go de RAM, démarrez uniquement les services nécessaires :

```bash
# Scénario A — Tester uniquement core-admin + finance
docker compose up -d postgres-core-admin postgres-finance redis zookeeper kafka keycloak kong core-admin-service finance-service

# Scénario B — Tester uniquement l'IA
docker compose up -d postgres-ai redis ai-prediction-service

# Scénario C — Tester le chatbot
docker compose up -d redis chatbot-service
# (nécessite ANTHROPIC_API_KEY valide dans .env)
```

---

## 11. Résolution des problèmes fréquents

### "port already in use"
```bash
# Trouver quel processus utilise le port (ex: 5432)
lsof -i :5432
# Ou changer les ports dans docker-compose.yml (colonne "ports")
```

### Keycloak ne démarre pas
```bash
docker compose logs keycloak | tail -50
# Vérifier que postgres-keycloak est healthy avant keycloak
docker compose ps postgres-keycloak
```

### Service en "restarting"
```bash
# Voir l'erreur exacte
docker compose logs <nom-service> --tail=20

# Vérifier les variables d'environnement
docker compose config | grep -A 5 <nom-service>
```

### Kafka consumer ne reçoit pas de messages
```bash
# Lister les topics créés
docker exec erp-kafka kafka-topics.sh --list --bootstrap-server localhost:9092

# Consommer un topic manuellement
docker exec -it erp-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic lms.cours.publie \
  --from-beginning
```

### Réinitialiser un service depuis zéro
```bash
# Arrêter + supprimer le volume du service (ex: lms)
docker compose stop lms-service postgres-lms
docker compose rm -f postgres-lms
docker volume rm erp-scolaire_pg_lms
docker compose up -d postgres-lms lms-service
```

### Tout réinitialiser
```bash
make nuke   # Demande confirmation avant de supprimer toutes les données
```

---

## 12. Architecture des services

```
                    ┌────────────────────────────┐
Browser/App ──────▶ │  Kong API Gateway :8000    │ ◀── Prometheus :9090
                    └──────────┬─────────────────┘
                               │ JWT RS256 (Keycloak)
              ┌────────────────┼────────────────────────────────┐
              │                │                                │
         ┌────▼────┐    ┌──────▼──────┐    ┌──────────┐   ┌────▼────────┐
         │ core-   │    │ attendance  │    │ finance  │   │  gradebook  │
         │ admin   │    │ :3003       │    │ :3004    │   │  :3005      │
         │ :3001   │    └─────────────┘    └──────────┘   └─────────────┘
         └─────────┘
              │                         Apache Kafka
         ┌────▼──────────────────────────────────────────────────────┐
         │  lms:3006  notification:3007  ai:3008  chatbot:3009       │
         │  analytics:3010   (tous consomment des events Kafka)       │
         └────────────────────────────────────────────────────────────┘
              │
         ┌────▼──────────────────────────────────────────────────────┐
         │  11× PostgreSQL  │  Redis  │  Keycloak  │  Zookeeper/Kafka │
         └────────────────────────────────────────────────────────────┘
```

---

## 13. Variables d'environnement — référence complète

| Variable | Requis | Description |
|----------|--------|-------------|
| `*_DB_PASSWORD` | ✅ | Mots de passe de chaque base PostgreSQL |
| `KC_DB_PASSWORD` | ✅ | Mot de passe PostgreSQL de Keycloak |
| `KC_ADMIN_PASSWORD` | ✅ | Mot de passe admin console Keycloak |
| `REDIS_PASSWORD` | ✅ | Mot de passe Redis |
| `ENCRYPTION_KEY` | ✅ | Clé AES-256 (64 hex chars) — `openssl rand -hex 32` |
| `QR_HMAC_SECRET` | ✅ | Secret HMAC QR-code (64 hex chars) |
| `JWT_PUBLIC_KEY` | ✅ après §4 | Clé publique RS256 Keycloak |
| `ANTHROPIC_API_KEY` | ✅ chatbot | Clé API Anthropic (sk-ant-...) |
| `WHATSAPP_*` | ❌ dev | Credentials Meta WhatsApp Business |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ❌ dev | Service account Firebase (push notif) |
| `SENDGRID_API_KEY` | ❌ dev | API key SendGrid (emails) |
| `TWILIO_*` | ❌ dev | Credentials Twilio (SMS) |
| `CMI_*` | ❌ dev | Credentials paiement CMI Maroc |
| `STRIPE_*` | ❌ dev | Credentials Stripe |
| `S3_*` | ❌ dev | Credentials S3/MinIO (fichiers LMS) |

---

*ERP Scolaire 360° — Mois 5 — Go-live ready*
