-- Analytics Service — Initial Schema
-- Base de lecture seule, alimentée par Debezium CDC depuis les autres services

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Élèves dénormalisés ────────────────────────────────────────────────────

CREATE TABLE eleves (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    nom         VARCHAR(100) NOT NULL,
    prenom      VARCHAR(100) NOT NULL,
    classe_id   UUID,
    actif       BOOLEAN NOT NULL DEFAULT true,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_eleves_school ON eleves(school_id);
CREATE INDEX idx_eleves_classe ON eleves(classe_id);

-- ── Classes ────────────────────────────────────────────────────────────────

CREATE TABLE classes (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    nom         VARCHAR(50) NOT NULL,
    niveau      VARCHAR(30) NOT NULL,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_classes_school ON classes(school_id);

-- ── Enseignants ────────────────────────────────────────────────────────────

CREATE TABLE enseignants (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    nom         VARCHAR(100) NOT NULL,
    actif       BOOLEAN NOT NULL DEFAULT true,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_enseignants_school ON enseignants(school_id);

-- ── Sujets / Matières ─────────────────────────────────────────────────────

CREATE TABLE sujets (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    nom         VARCHAR(100) NOT NULL,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sujets_school ON sujets(school_id);

-- ── Absences ───────────────────────────────────────────────────────────────

CREATE TABLE absences (
    id          UUID PRIMARY KEY,
    eleve_id    UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    classe_id   UUID,
    school_id   UUID NOT NULL,
    date        DATE NOT NULL,
    justifiee   BOOLEAN NOT NULL DEFAULT false,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_absences_eleve_date ON absences(eleve_id, date DESC);
CREATE INDEX idx_absences_school_date ON absences(school_id, date DESC);
CREATE INDEX idx_absences_classe_date ON absences(classe_id, date DESC);

-- ── Notes ─────────────────────────────────────────────────────────────────

CREATE TABLE notes (
    id          UUID PRIMARY KEY,
    eleve_id    UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    sujet_id    UUID REFERENCES sujets(id),
    school_id   UUID NOT NULL,
    note        NUMERIC(5,2) NOT NULL CHECK (note >= 0 AND note <= 20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_eleve ON notes(eleve_id, created_at DESC);
CREATE INDEX idx_notes_school ON notes(school_id, created_at DESC);
CREATE INDEX idx_notes_sujet ON notes(sujet_id);

-- ── Factures ───────────────────────────────────────────────────────────────

CREATE TABLE factures (
    id              UUID PRIMARY KEY,
    eleve_id        UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    school_id       UUID NOT NULL,
    montant         NUMERIC(10,2) NOT NULL,
    statut          VARCHAR(20) NOT NULL DEFAULT 'IMPAYEE',
    echeance        DATE NOT NULL,
    date_paiement   DATE,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_factures_school_statut ON factures(school_id, statut);
CREATE INDEX idx_factures_echeance ON factures(echeance DESC);

-- ── Cours & Progression LMS ────────────────────────────────────────────────

CREATE TABLE cours (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    titre       VARCHAR(200) NOT NULL,
    statut      VARCHAR(20) NOT NULL DEFAULT 'BROUILLON',
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cours_school ON cours(school_id, statut);

CREATE TABLE devoirs (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL,
    classe_id   UUID,
    date_limite TIMESTAMPTZ NOT NULL,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devoirs_school ON devoirs(school_id, date_limite DESC);

CREATE TABLE rendus_devoirs (
    id              UUID PRIMARY KEY,
    devoir_id       UUID NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    eleve_id        UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    rendu_en_retard BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rendus_devoir ON rendus_devoirs(devoir_id);

CREATE TABLE progressions_lms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id    UUID NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    cours_id    UUID NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    pourcentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (eleve_id, cours_id)
);
CREATE INDEX idx_progressions_eleve ON progressions_lms(eleve_id);
CREATE INDEX idx_progressions_cours ON progressions_lms(cours_id);
