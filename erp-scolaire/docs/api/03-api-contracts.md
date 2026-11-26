# Contrats d'API — ERP Scolaire 360°

**Version :** 1.0 | **Standard :** OpenAPI 3.1

---

## Endpoints critiques (MVP)

### Auth
```
POST   /api/v1/auth/login          → JWT access + refresh token
POST   /api/v1/auth/refresh        → Renouvellement du token
POST   /api/v1/auth/logout         → Révocation du token
```

### Core Admin
```
GET    /api/v1/schools/:id/students              → Liste élèves (paginée)
POST   /api/v1/schools/:id/students              → Créer un élève
GET    /api/v1/schools/:id/students/:eleve_id    → Profil complet élève
PUT    /api/v1/schools/:id/students/:eleve_id    → Mettre à jour
GET    /api/v1/schools/:id/teachers              → Liste enseignants
POST   /api/v1/schools/:id/enrollments           → Inscrire un élève
```

### Assiduité
```
POST   /api/v1/attendance/record             → Enregistrer absence/retard
GET    /api/v1/attendance/student/:id        → Historique d'un élève
GET    /api/v1/attendance/class/:id/today    → Appel du jour
PATCH  /api/v1/attendance/:id/justify        → Justifier une absence
```

### Notes & Bulletins
```
GET    /api/v1/grades/class/:id/subject/:matiere_id    → Notes d'une classe
POST   /api/v1/grades/bulk                             → Saisie en masse (array)
GET    /api/v1/bulletins/student/:id/period/:periode_id → Bulletin complet
POST   /api/v1/bulletins/generate                      → Déclencher génération (async)
PATCH  /api/v1/bulletins/:id/publish                   → Publier aux parents
```

### Finance
```
GET    /api/v1/finance/invoices?student_id=&status=    → Liste factures
POST   /api/v1/finance/invoices                        → Créer une facture
POST   /api/v1/finance/payments/initiate               → Initier paiement CMI/Stripe
POST   /api/v1/finance/payments/webhook                → Webhook banque (non authentifié)
GET    /api/v1/finance/dashboard/school/:id            → KPIs financiers
```

### IA
```
GET    /api/v1/ai/dropout-risk/class/:id               → Scores décrochage d'une classe
GET    /api/v1/ai/dropout-risk/student/:id             → Score détaillé + SHAP
POST   /api/v1/ai/chatbot/message                      → Envoyer message OostudyBot
POST   /api/v1/ai/appreciation/generate                → Générer appréciation (enseignant)
```

---

## Format de réponse standard

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 4000,
    "total_pages": 200
  },
  "error": null
}
```

## Format d'erreur

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ 'email' est invalide",
    "details": [
      { "field": "email", "message": "Format email invalide" }
    ]
  }
}
```

## Headers obligatoires

```
Authorization: Bearer <jwt_access_token>
X-School-ID: <school_uuid>          ← Multi-tenant routing
Content-Type: application/json
X-Request-ID: <uuid>                ← Tracing distribué
```
