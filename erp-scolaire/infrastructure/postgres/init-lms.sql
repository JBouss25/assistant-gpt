-- LMS Service — Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE ressource_type   AS ENUM ('DOCUMENT_PDF','VIDEO','AUDIO','LIEN_EXTERNE','IMAGE','EXERCICE_INTERACTIF','ARCHIVE');
CREATE TYPE rendu_statut     AS ENUM ('RENDU','EN_RETARD','CORRIGE','NOTE');
CREATE TYPE cours_visibilite AS ENUM ('BROUILLON','PUBLIE','ARCHIVE');

-- ─────────────────────────────────────────────────────────
-- COURS
-- ─────────────────────────────────────────────────────────

CREATE TABLE cours (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    enseignant_id       UUID        NOT NULL,
    matiere_id          UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    niveau_id           UUID,
    titre               VARCHAR(200) NOT NULL,
    description         TEXT,
    visibilite          cours_visibilite NOT NULL DEFAULT 'BROUILLON',
    est_public          BOOLEAN     NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cours_school_matiere  ON cours(school_id, matiere_id, annee_scolaire_id);
CREATE INDEX idx_cours_enseignant      ON cours(enseignant_id);

-- ─────────────────────────────────────────────────────────
-- ABONNEMENTS (classe → cours)
-- ─────────────────────────────────────────────────────────

CREATE TABLE cours_classes (
    cours_id    UUID NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    classe_id   UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cours_id, classe_id)
);

CREATE INDEX idx_cours_classes_classe ON cours_classes(classe_id);

-- ─────────────────────────────────────────────────────────
-- SECTIONS (chapitres d'un cours)
-- ─────────────────────────────────────────────────────────

CREATE TABLE sections (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cours_id    UUID        NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    titre       VARCHAR(200) NOT NULL,
    description TEXT,
    ordre       INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sections_cours ON sections(cours_id, ordre);

-- ─────────────────────────────────────────────────────────
-- RESSOURCES PÉDAGOGIQUES
-- ─────────────────────────────────────────────────────────

CREATE TABLE ressources (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id      UUID        REFERENCES sections(id) ON DELETE CASCADE,
    cours_id        UUID        NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    titre           VARCHAR(200) NOT NULL,
    type            ressource_type NOT NULL,
    url             VARCHAR(500) NOT NULL,   -- URL S3 ou externe
    taille_octets   BIGINT,
    duree_minutes   INTEGER,                  -- vidéo/audio
    description     TEXT,
    ordre           INTEGER     NOT NULL DEFAULT 0,
    telechargeable  BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ressources_cours   ON ressources(cours_id, ordre);
CREATE INDEX idx_ressources_section ON ressources(section_id, ordre);

-- ─────────────────────────────────────────────────────────
-- DEVOIRS LMS
-- ─────────────────────────────────────────────────────────

CREATE TABLE devoirs_lms (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cours_id        UUID        NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    section_id      UUID        REFERENCES sections(id),
    titre           VARCHAR(200) NOT NULL,
    consignes       TEXT        NOT NULL,
    date_limite     TIMESTAMPTZ NOT NULL,
    note_maximale   DECIMAL(5,2),
    type_rendu      VARCHAR(20) NOT NULL DEFAULT 'FICHIER',  -- FICHIER, TEXTE, QCM, LIEN
    types_fichiers  JSONB       NOT NULL DEFAULT '["pdf","docx","txt"]',
    taille_max_mb   INTEGER     NOT NULL DEFAULT 10,
    publier_notes   BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devoirs_lms_cours      ON devoirs_lms(cours_id);
CREATE INDEX idx_devoirs_lms_deadline   ON devoirs_lms(date_limite) WHERE date_limite > NOW();

-- ─────────────────────────────────────────────────────────
-- RENDUS (soumissions élèves)
-- ─────────────────────────────────────────────────────────

CREATE TABLE rendus (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    devoir_lms_id       UUID        NOT NULL REFERENCES devoirs_lms(id) ON DELETE CASCADE,
    eleve_id            UUID        NOT NULL,
    date_rendu          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contenu_texte       TEXT,
    fichier_url         VARCHAR(500),
    fichier_nom         VARCHAR(200),
    taille_octets       BIGINT,
    en_retard           BOOLEAN     NOT NULL DEFAULT false,
    note_obtenue        DECIMAL(5,2),
    feedback_enseignant TEXT,
    feedback_ia         TEXT,
    statut              rendu_statut NOT NULL DEFAULT 'RENDU',
    corrige_par         UUID,
    corrige_le          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rendu_devoir_eleve UNIQUE (devoir_lms_id, eleve_id)
);

CREATE INDEX idx_rendus_devoir  ON rendus(devoir_lms_id, statut);
CREATE INDEX idx_rendus_eleve   ON rendus(eleve_id);
CREATE INDEX idx_rendus_note    ON rendus(devoir_lms_id) WHERE note_obtenue IS NOT NULL;

-- ─────────────────────────────────────────────────────────
-- PROGRESSION ÉLÈVE (vues des ressources, complétion)
-- ─────────────────────────────────────────────────────────

CREATE TABLE progressions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id        UUID        NOT NULL,
    cours_id        UUID        NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
    ressource_id    UUID        REFERENCES ressources(id) ON DELETE CASCADE,
    vue_le          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duree_secondes  INTEGER     NOT NULL DEFAULT 0,
    completee       BOOLEAN     NOT NULL DEFAULT false,
    CONSTRAINT uq_progression_eleve_ressource UNIQUE (eleve_id, ressource_id)
);

CREATE INDEX idx_progressions_cours_eleve ON progressions(cours_id, eleve_id);

-- Triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_cours_updated_at      BEFORE UPDATE ON cours        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_devoirs_lms_upd       BEFORE UPDATE ON devoirs_lms  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rendus_updated_at     BEFORE UPDATE ON rendus       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
