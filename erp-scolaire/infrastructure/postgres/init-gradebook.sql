-- Gradebook Service — Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE devoir_type     AS ENUM ('DEVOIR_SURVEILLE','DEVOIR_MAISON','INTERROGATION','EXAMEN','PROJET','ORAL');
CREATE TYPE mention_type    AS ENUM ('PASSABLE','ASSEZ_BIEN','BIEN','TRES_BIEN','EXCELLENT');
CREATE TYPE decision_type   AS ENUM ('PASSAGE','REDOUBLEMENT','ORIENTATION','FELICITATIONS','ENCOURAGEMENTS','AVERTISSEMENT_TRAVAIL','AVERTISSEMENT_CONDUITE');
CREATE TYPE periode_type    AS ENUM ('TRIMESTRE','SEMESTRE');

-- ─────────────────────────────────────────────────────────
-- PÉRIODES D'ÉVALUATION
-- ─────────────────────────────────────────────────────────

CREATE TABLE periodes_evaluation (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    libelle             VARCHAR(50) NOT NULL,
    type                periode_type NOT NULL DEFAULT 'TRIMESTRE',
    date_debut          DATE        NOT NULL,
    date_fin            DATE        NOT NULL,
    ordre               INTEGER     NOT NULL,
    bulletins_publies   BOOLEAN     NOT NULL DEFAULT false,
    publication_le      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_periode_school_annee_ordre UNIQUE (school_id, annee_scolaire_id, ordre),
    CONSTRAINT chk_periode_dates CHECK (date_fin > date_debut)
);

CREATE INDEX idx_periodes_school_annee ON periodes_evaluation(school_id, annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- DEVOIRS / ÉVALUATIONS
-- ─────────────────────────────────────────────────────────

CREATE TABLE devoirs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL,
    classe_id       UUID        NOT NULL,
    matiere_id      UUID        NOT NULL,
    enseignant_id   UUID        NOT NULL,
    periode_id      UUID        NOT NULL REFERENCES periodes_evaluation(id),
    libelle         VARCHAR(200) NOT NULL,
    type            devoir_type NOT NULL,
    date_evaluation DATE        NOT NULL,
    bareme          DECIMAL(5,2) NOT NULL DEFAULT 20.0 CHECK (bareme > 0),
    coefficient     DECIMAL(4,2) NOT NULL DEFAULT 1.0  CHECK (coefficient > 0),
    est_renseigne   BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devoirs_classe_periode  ON devoirs(classe_id, periode_id);
CREATE INDEX idx_devoirs_enseignant      ON devoirs(enseignant_id, date_evaluation DESC);
CREATE INDEX idx_devoirs_non_renseignes  ON devoirs(classe_id, est_renseigne) WHERE est_renseigne = false;

-- ─────────────────────────────────────────────────────────
-- NOTES
-- ─────────────────────────────────────────────────────────

CREATE TABLE notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    devoir_id   UUID        NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    eleve_id    UUID        NOT NULL,
    note        DECIMAL(5,2) CHECK (note IS NULL OR note >= 0),
    absent      BOOLEAN     NOT NULL DEFAULT false,
    dispense    BOOLEAN     NOT NULL DEFAULT false,
    mention     VARCHAR(200),
    saisie_par  UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_note_devoir_eleve UNIQUE (devoir_id, eleve_id),
    CONSTRAINT chk_note_coherence CHECK (
        (absent = false AND dispense = false AND note IS NOT NULL) OR
        (absent = true  AND note IS NULL) OR
        (dispense = true AND note IS NULL)
    )
);

CREATE INDEX idx_notes_devoir  ON notes(devoir_id) INCLUDE (eleve_id, note, absent, dispense);
CREATE INDEX idx_notes_eleve   ON notes(eleve_id);

-- ─────────────────────────────────────────────────────────
-- MOYENNES PÉRIODIQUES (dénormalisées pour la performance)
-- ─────────────────────────────────────────────────────────

CREATE TABLE moyennes_periodiques (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id            UUID        NOT NULL,
    classe_id           UUID        NOT NULL,
    matiere_id          UUID        NOT NULL,
    periode_id          UUID        NOT NULL REFERENCES periodes_evaluation(id),
    school_id           UUID        NOT NULL,
    moyenne             DECIMAL(5,2) NOT NULL,
    rang_classe         INTEGER,
    moyenne_classe      DECIMAL(5,2),
    nb_devoirs          INTEGER     NOT NULL DEFAULT 0,
    appreciation_texte  TEXT,
    appreciation_ia     BOOLEAN     NOT NULL DEFAULT false,
    appreciation_validee BOOLEAN    NOT NULL DEFAULT false,
    calculee_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_moyenne_eleve_matiere_periode UNIQUE (eleve_id, matiere_id, periode_id)
);

CREATE INDEX idx_moyennes_eleve_periode ON moyennes_periodiques(eleve_id, periode_id);
CREATE INDEX idx_moyennes_classe_periode ON moyennes_periodiques(classe_id, periode_id, matiere_id);

-- ─────────────────────────────────────────────────────────
-- BULLETINS
-- ─────────────────────────────────────────────────────────

CREATE TABLE bulletins (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    eleve_id            UUID        NOT NULL,
    classe_id           UUID        NOT NULL,
    periode_id          UUID        NOT NULL REFERENCES periodes_evaluation(id),
    moyenne_generale    DECIMAL(5,2) NOT NULL,
    rang_general        INTEGER,
    nb_eleves_classe    INTEGER,
    moyenne_classe      DECIMAL(5,2),
    mention             mention_type,
    appreciation_conseil TEXT,
    decision            decision_type,
    pdf_url             VARCHAR(500),
    publie              BOOLEAN     NOT NULL DEFAULT false,
    publie_le           TIMESTAMPTZ,
    genere_le           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bulletin_eleve_periode UNIQUE (eleve_id, periode_id)
);

CREATE INDEX idx_bulletins_eleve    ON bulletins(eleve_id, periode_id);
CREATE INDEX idx_bulletins_classe   ON bulletins(classe_id, periode_id);
CREATE INDEX idx_bulletins_publie   ON bulletins(publie, publie_le) WHERE publie = true;

-- Triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_devoirs_updated_at BEFORE UPDATE ON devoirs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notes_updated_at   BEFORE UPDATE ON notes   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
