-- Attendance Service — Schema
-- PostgreSQL 16 + TimescaleDB (séries temporelles)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- TimescaleDB activé sur le container dédié
-- CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ─────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────

CREATE TYPE absence_type        AS ENUM ('ABSENCE','RETARD','EXCLUSION_COURS');
CREATE TYPE pointage_methode    AS ENUM ('MANUEL','QR_CODE','BIOMETRIQUE','IMPORTATION');
CREATE TYPE notif_statut        AS ENUM ('EN_ATTENTE','ENVOYE','ECHEC','NON_REQUIS');

-- ─────────────────────────────────────────────────────────
-- ABSENCES (table principale — hypertable TimescaleDB)
-- ─────────────────────────────────────────────────────────

CREATE TABLE absences (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    school_id               UUID        NOT NULL,
    eleve_id                UUID        NOT NULL,
    emploi_du_temps_id      UUID        NOT NULL,  -- référence cross-service (pas de FK)
    classe_id               UUID        NOT NULL,
    matiere_id              UUID        NOT NULL,
    enseignant_id           UUID        NOT NULL,
    date                    DATE        NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type                    absence_type NOT NULL DEFAULT 'ABSENCE',
    minutes_retard          INTEGER,
    justifie                BOOLEAN     NOT NULL DEFAULT false,
    motif                   TEXT,
    document_url            VARCHAR(500),
    saisi_par               UUID        NOT NULL,
    methode_pointage        pointage_methode NOT NULL DEFAULT 'MANUEL',
    notif_parent_statut     notif_statut NOT NULL DEFAULT 'EN_ATTENTE',
    notif_parent_envoyee_le TIMESTAMPTZ,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions par trimestre (étendues au besoin)
CREATE TABLE absences_2025_q3 PARTITION OF absences FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE absences_2025_q4 PARTITION OF absences FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE absences_2026_q1 PARTITION OF absences FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE absences_2026_q2 PARTITION OF absences FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE absences_2026_q3 PARTITION OF absences FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE absences_2026_q4 PARTITION OF absences FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE INDEX idx_absences_eleve_date    ON absences(eleve_id, date DESC);
CREATE INDEX idx_absences_school_date   ON absences(school_id, date DESC);
CREATE INDEX idx_absences_edt           ON absences(emploi_du_temps_id, date);
CREATE INDEX idx_absences_notif_pending ON absences(notif_parent_statut, created_at)
    WHERE notif_parent_statut = 'EN_ATTENTE';

-- ─────────────────────────────────────────────────────────
-- TOKENS QR CODE (tokens de pointage à usage limité)
-- ─────────────────────────────────────────────────────────

CREATE TABLE qr_tokens (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    emploi_du_temps_id  UUID        NOT NULL,
    classe_id           UUID        NOT NULL,
    date_cours          DATE        NOT NULL,
    token_hash          VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 du token
    expire_at           TIMESTAMPTZ NOT NULL,
    nb_scans            INTEGER     NOT NULL DEFAULT 0,
    nb_scans_max        INTEGER     NOT NULL DEFAULT 200, -- = effectif max classe
    cree_par            UUID        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_tokens_hash      ON qr_tokens(token_hash) WHERE expire_at > NOW();
CREATE INDEX idx_qr_tokens_edt_date  ON qr_tokens(emploi_du_temps_id, date_cours);

-- ─────────────────────────────────────────────────────────
-- SCANS QR CODE (journal des pointages par QR)
-- ─────────────────────────────────────────────────────────

CREATE TABLE qr_scans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id    UUID        NOT NULL REFERENCES qr_tokens(id),
    eleve_id    UUID        NOT NULL,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address  INET,
    user_agent  TEXT,
    CONSTRAINT uq_scan_eleve_token UNIQUE (token_id, eleve_id)
);

CREATE INDEX idx_qr_scans_token ON qr_scans(token_id);

-- ─────────────────────────────────────────────────────────
-- STATS D'ASSIDUITÉ (vue matérialisée — rafraîchie quotidiennement)
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW mv_stats_assiduite AS
SELECT
    school_id,
    eleve_id,
    classe_id,
    DATE_TRUNC('month', date)   AS mois,
    COUNT(*)                    AS nb_absences_total,
    COUNT(*) FILTER (WHERE type = 'ABSENCE' AND NOT justifie) AS nb_absences_injustifiees,
    COUNT(*) FILTER (WHERE type = 'RETARD')                   AS nb_retards,
    SUM(COALESCE(minutes_retard, 0))                          AS total_minutes_retard
FROM absences
GROUP BY school_id, eleve_id, classe_id, DATE_TRUNC('month', date)
WITH DATA;

CREATE UNIQUE INDEX ON mv_stats_assiduite(school_id, eleve_id, classe_id, mois);
