-- AI Prediction Service — Initial Schema
-- Vues matérialisées agrégeant les données des autres services (via Debezium CDC ou ETL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────
-- Tables sources dénormalisées (alimentées par CDC/ETL)
-- ─────────────────────────────────────────────────────────

CREATE TABLE absences_raw (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id    UUID NOT NULL,
    school_id   UUID NOT NULL,
    date        DATE NOT NULL,
    justifiee   BOOLEAN NOT NULL DEFAULT false,
    is_retard   BOOLEAN NOT NULL DEFAULT false,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_absences_raw_eleve_date ON absences_raw(eleve_id, date DESC);

CREATE TABLE notes_raw (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID NOT NULL,
    school_id       UUID NOT NULL,
    note            NUMERIC(5,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_raw_eleve ON notes_raw(eleve_id, created_at DESC);

CREATE TABLE devoirs_raw (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID NOT NULL,
    school_id       UUID NOT NULL,
    devoir_id       UUID NOT NULL,
    rendu           BOOLEAN NOT NULL DEFAULT false,
    date_limite     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devoirs_raw_eleve ON devoirs_raw(eleve_id, created_at DESC);

CREATE TABLE factures_raw (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id    UUID NOT NULL,
    school_id   UUID NOT NULL,
    montant     NUMERIC(10,2) NOT NULL,
    statut      VARCHAR(20) NOT NULL DEFAULT 'IMPAYEE',
    echeance    DATE NOT NULL,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_factures_raw_eleve ON factures_raw(eleve_id, statut);

CREATE TABLE progressions_raw (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID NOT NULL,
    school_id       UUID NOT NULL,
    cours_id        UUID NOT NULL,
    pourcentage     NUMERIC(5,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (eleve_id, cours_id)
);
CREATE INDEX idx_progressions_raw_eleve ON progressions_raw(eleve_id);

-- ─────────────────────────────────────────────────────────
-- Vues matérialisées pour le feature store
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW mv_absences_30j AS
SELECT
    eleve_id,
    school_id,
    COUNT(*) FILTER (WHERE justifiee = false) AS absences_30j,
    COUNT(*) FILTER (WHERE is_retard = true)  AS retards_30j
FROM absences_raw
WHERE date >= CURRENT_DATE - 30
GROUP BY eleve_id, school_id
WITH DATA;
CREATE UNIQUE INDEX ON mv_absences_30j(eleve_id);

CREATE MATERIALIZED VIEW mv_moyenne_generale AS
SELECT
    eleve_id,
    school_id,
    COALESCE(ROUND(AVG(note)::numeric, 2), 10.0) AS moyenne_generale
FROM notes_raw
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY eleve_id, school_id
WITH DATA;
CREATE UNIQUE INDEX ON mv_moyenne_generale(eleve_id);

CREATE MATERIALIZED VIEW mv_lms_stats AS
SELECT
    d.eleve_id,
    d.school_id,
    COUNT(*) FILTER (WHERE d.rendu = false AND d.date_limite < NOW()) AS devoirs_non_rendus,
    COALESCE(AVG(p.pourcentage), 0) AS progression_lms
FROM devoirs_raw d
LEFT JOIN progressions_raw p ON p.eleve_id = d.eleve_id
WHERE d.created_at >= NOW() - INTERVAL '30 days'
GROUP BY d.eleve_id, d.school_id
WITH DATA;
CREATE UNIQUE INDEX ON mv_lms_stats(eleve_id);

CREATE MATERIALIZED VIEW mv_factures_impayees AS
SELECT
    eleve_id,
    school_id,
    COUNT(*) AS factures_impayees
FROM factures_raw
WHERE statut = 'IMPAYEE'
GROUP BY eleve_id, school_id
WITH DATA;
CREATE UNIQUE INDEX ON mv_factures_impayees(eleve_id);

-- ─────────────────────────────────────────────────────────
-- Historique des prédictions
-- ─────────────────────────────────────────────────────────

CREATE TABLE predictions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id    UUID NOT NULL,
    school_id   UUID NOT NULL,
    risk_score  NUMERIC(5,4) NOT NULL,
    risk_level  VARCHAR(10) NOT NULL,
    top_factors JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_predictions_eleve ON predictions(eleve_id, created_at DESC);
CREATE INDEX idx_predictions_school_risk ON predictions(school_id, risk_level, created_at DESC);

-- Rafraîchissement automatique des vues matérialisées (à lancer via pg_cron en prod)
-- CALL refresh_mv_all();
CREATE OR REPLACE PROCEDURE refresh_mv_all()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_absences_30j;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_moyenne_generale;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_lms_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_factures_impayees;
END;
$$;
