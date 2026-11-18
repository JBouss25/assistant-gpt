-- Core Admin Service — Initial Schema
-- PostgreSQL 16 | TimescaleDB extension pour les séries temporelles

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────

CREATE TYPE school_type         AS ENUM ('PRIMAIRE', 'COLLEGE', 'LYCEE', 'MULTI_CYCLE');
CREATE TYPE cycle_type          AS ENUM ('PRIMAIRE', 'COLLEGE', 'LYCEE');
CREATE TYPE annee_statut        AS ENUM ('PLANIFIEE', 'EN_COURS', 'TERMINEE');
CREATE TYPE eleve_statut        AS ENUM ('ACTIF', 'TRANSFERE', 'DIPLOME', 'EXCLU', 'DECEDE');
CREATE TYPE sexe_type           AS ENUM ('M', 'F');
CREATE TYPE bourse_type         AS ENUM ('AUCUNE', 'NATIONALE', 'ETRANGERE', 'ETABLISSEMENT');
CREATE TYPE inscription_statut  AS ENUM ('PROVISOIRE', 'CONFIRMEE', 'ANNULEE');
CREATE TYPE responsable_lien    AS ENUM ('PERE', 'MERE', 'TUTEUR', 'AUTRE');
CREATE TYPE contrat_type        AS ENUM ('TITULAIRE', 'VACATAIRE', 'CONTRACTUEL', 'REMPLACANT');
CREATE TYPE enseignant_statut   AS ENUM ('ACTIF', 'CONGE', 'DETACHE', 'RETRAITE', 'QUITTE');
CREATE TYPE matiere_domaine     AS ENUM ('SCIENTIFIQUE', 'LITTERAIRE', 'LANGUES', 'TECHNOLOGIQUE', 'SPORT', 'ARTISTIQUE');
CREATE TYPE user_role           AS ENUM ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'PARENT', 'FINANCE_OFFICER', 'HR_OFFICER', 'COUNSELOR');

-- ─────────────────────────────────────────────────────────
-- USERS (miroir Keycloak — synchronisé par webhook)
-- ─────────────────────────────────────────────────────────

CREATE TABLE users (
    id          UUID        PRIMARY KEY,           -- ID identique à Keycloak
    school_id   UUID,                              -- NULL pour SUPER_ADMIN
    email       VARCHAR(150) NOT NULL UNIQUE,
    role        user_role   NOT NULL,
    actif       BOOLEAN     NOT NULL DEFAULT true,
    derniere_connexion TIMESTAMPTZ,
    preferences JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_school_role ON users(school_id, role) WHERE actif = true;

-- ─────────────────────────────────────────────────────────
-- SCHOOLS
-- ─────────────────────────────────────────────────────────

CREATE TABLE schools (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                 VARCHAR(200) NOT NULL,
    code_etablissement  VARCHAR(20) NOT NULL UNIQUE,
    type                school_type NOT NULL,
    adresse             TEXT        NOT NULL,
    ville               VARCHAR(100) NOT NULL,
    telephone           VARCHAR(20),
    email_direction     VARCHAR(150) NOT NULL,
    logo_url            VARCHAR(500),
    config_pedagogique  JSONB       NOT NULL DEFAULT '{}',
    timezone            VARCHAR(50) NOT NULL DEFAULT 'Africa/Casablanca',
    actif               BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schools_ville ON schools(ville);

-- FK différée pour éviter les dépendances circulaires avec users
ALTER TABLE users ADD CONSTRAINT fk_users_school
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────
-- ANNEES SCOLAIRES
-- ─────────────────────────────────────────────────────────

CREATE TABLE annees_scolaires (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    libelle         VARCHAR(20) NOT NULL,
    date_debut      DATE        NOT NULL,
    date_fin        DATE        NOT NULL,
    statut          annee_statut NOT NULL DEFAULT 'PLANIFIEE',
    calendrier_config JSONB     NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_annee_school_libelle UNIQUE (school_id, libelle),
    CONSTRAINT chk_dates CHECK (date_fin > date_debut)
);

CREATE INDEX idx_annees_school_statut ON annees_scolaires(school_id, statut);

-- ─────────────────────────────────────────────────────────
-- NIVEAUX
-- ─────────────────────────────────────────────────────────

CREATE TABLE niveaux (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    code        VARCHAR(20) NOT NULL,
    libelle     VARCHAR(100) NOT NULL,
    cycle       cycle_type  NOT NULL,
    ordre       INTEGER     NOT NULL,
    CONSTRAINT uq_niveau_school_code UNIQUE (school_id, code)
);

-- ─────────────────────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────────────────────

CREATE TABLE classes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL REFERENCES schools(id),
    annee_scolaire_id   UUID        NOT NULL REFERENCES annees_scolaires(id),
    niveau_id           UUID        NOT NULL REFERENCES niveaux(id),
    nom                 VARCHAR(50) NOT NULL,
    effectif_max        INTEGER     NOT NULL DEFAULT 35,
    titulaire_id        UUID,                          -- FK enseignants (service séparé) — optionnel
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_school_annee ON classes(school_id, annee_scolaire_id);
CREATE INDEX idx_classes_niveau ON classes(niveau_id);

-- ─────────────────────────────────────────────────────────
-- ELEVES  (données PII chiffrées via pgcrypto au niveau applicatif)
-- ─────────────────────────────────────────────────────────

CREATE TABLE eleves (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL REFERENCES schools(id),
    numero_massar       VARCHAR(20) UNIQUE,
    numero_interne      VARCHAR(20) NOT NULL,
    nom                 VARCHAR(100) NOT NULL,
    prenom              VARCHAR(100) NOT NULL,
    date_naissance      BYTEA       NOT NULL,          -- ENC: AES-256
    lieu_naissance      BYTEA,                         -- ENC
    sexe                sexe_type   NOT NULL,
    nationalite         VARCHAR(50) NOT NULL DEFAULT 'Marocaine',
    adresse             BYTEA,                         -- ENC
    telephone_urgence   BYTEA,                         -- ENC
    photo_url           VARCHAR(500),
    numero_cnie         BYTEA,                         -- ENC (UNIQUE enforced in app layer)
    groupe_sanguin      BYTEA,                         -- ENC
    allergies           BYTEA,                         -- ENC
    antecedents_medicaux BYTEA,                        -- ENC
    mutuelle            BYTEA,                         -- ENC
    bourse_type         bourse_type NOT NULL DEFAULT 'AUCUNE',
    bourse_montant      DECIMAL(10,2),
    statut              eleve_statut NOT NULL DEFAULT 'ACTIF',
    date_inscription    DATE        NOT NULL,
    user_id             UUID        REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_interne_school UNIQUE (school_id, numero_interne)
);

CREATE INDEX idx_eleves_school_statut ON eleves(school_id, statut);
CREATE INDEX idx_eleves_massar ON eleves(numero_massar) WHERE numero_massar IS NOT NULL;

-- ─────────────────────────────────────────────────────────
-- INSCRIPTIONS
-- ─────────────────────────────────────────────────────────

CREATE TABLE inscriptions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id            UUID        NOT NULL REFERENCES eleves(id),
    classe_id           UUID        NOT NULL REFERENCES classes(id),
    annee_scolaire_id   UUID        NOT NULL REFERENCES annees_scolaires(id),
    date_inscription    DATE        NOT NULL,
    statut              inscription_statut NOT NULL DEFAULT 'CONFIRMEE',
    documents_fournis   JSONB       NOT NULL DEFAULT '{}',
    commentaire         TEXT,
    created_by          UUID        REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eleve_annee UNIQUE (eleve_id, annee_scolaire_id)
);

CREATE INDEX idx_inscriptions_classe ON inscriptions(classe_id);
CREATE INDEX idx_inscriptions_annee ON inscriptions(annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- RESPONSABLES LÉGAUX
-- ─────────────────────────────────────────────────────────

CREATE TABLE responsables_legaux (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id                UUID        NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    lien                    responsable_lien NOT NULL,
    nom_complet             VARCHAR(200) NOT NULL,
    telephone_principal     BYTEA       NOT NULL,       -- ENC
    telephone_secondaire    BYTEA,                      -- ENC
    email                   BYTEA,                      -- ENC
    profession              VARCHAR(100),
    adresse                 BYTEA,                      -- ENC
    est_contact_urgence     BOOLEAN     NOT NULL DEFAULT false,
    est_autorise_retrait    BOOLEAN     NOT NULL DEFAULT true,
    user_id                 UUID        REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_responsables_eleve ON responsables_legaux(eleve_id);

-- ─────────────────────────────────────────────────────────
-- ENSEIGNANTS
-- ─────────────────────────────────────────────────────────

CREATE TABLE enseignants (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id               UUID        NOT NULL REFERENCES schools(id),
    user_id                 UUID        UNIQUE REFERENCES users(id),
    matricule               VARCHAR(30) NOT NULL,
    nom                     VARCHAR(100) NOT NULL,
    prenom                  VARCHAR(100) NOT NULL,
    date_naissance          BYTEA,                      -- ENC
    cnie                    BYTEA,                      -- ENC
    telephone               BYTEA,                      -- ENC
    email_perso             BYTEA,                      -- ENC
    email_pro               VARCHAR(150) NOT NULL,
    type_contrat            contrat_type NOT NULL,
    date_embauche           DATE        NOT NULL,
    date_fin_contrat        DATE,
    specialite_principale   VARCHAR(100) NOT NULL,
    specialites_secondaires JSONB       NOT NULL DEFAULT '[]',
    diplomes                BYTEA,                      -- ENC (JSONB sérialisé)
    heures_service_hebdo    INTEGER,
    statut                  enseignant_statut NOT NULL DEFAULT 'ACTIF',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_matricule_school UNIQUE (school_id, matricule)
);

CREATE INDEX idx_enseignants_school_statut ON enseignants(school_id, statut);

-- ─────────────────────────────────────────────────────────
-- MATIÈRES
-- ─────────────────────────────────────────────────────────

CREATE TABLE matieres (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL REFERENCES schools(id),
    code                VARCHAR(20) NOT NULL,
    libelle             VARCHAR(100) NOT NULL,
    libelle_arabe       VARCHAR(100),
    coefficient_defaut  DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    domaine             matiere_domaine,
    est_obligatoire     BOOLEAN     NOT NULL DEFAULT true,
    CONSTRAINT uq_matiere_school_code UNIQUE (school_id, code)
);

-- ─────────────────────────────────────────────────────────
-- AUDIT LOG (partitionné par mois)
-- ─────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    school_id       UUID,
    user_id         UUID        REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    entite_type     VARCHAR(50) NOT NULL,
    entite_id       UUID        NOT NULL,
    valeur_avant    JSONB,
    valeur_apres    JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partitions initiales (générées par la migration, puis auto-créées par pg_partman)
CREATE TABLE audit_logs_2025_q1 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE audit_logs_2025_q2 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE audit_logs_2025_q3 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE audit_logs_2025_q4 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE audit_logs_2026_q1 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_q2 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

CREATE INDEX idx_audit_school_action ON audit_logs(school_id, action, created_at DESC);
CREATE INDEX idx_audit_entite ON audit_logs(entite_type, entite_id, created_at DESC);

-- ─────────────────────────────────────────────────────────
-- TRIGGER : updated_at automatique
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_eleves_updated_at        BEFORE UPDATE ON eleves        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_enseignants_updated_at   BEFORE UPDATE ON enseignants   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schools_updated_at       BEFORE UPDATE ON schools       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
