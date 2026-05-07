-- Timetable Service — Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────

CREATE TYPE jour_semaine    AS ENUM ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI');
CREATE TYPE creneau_type    AS ENUM ('COURS','RECREATION','PAUSE_DEJEUNER');
CREATE TYPE salle_type      AS ENUM ('STANDARD','INFORMATIQUE','LABORATOIRE','SPORT','AMPHITHEATRE','BIBLIOTHEQUE');
CREATE TYPE edt_statut      AS ENUM ('BROUILLON','VALIDE','ARCHIVE');
CREATE TYPE generation_statut AS ENUM ('EN_ATTENTE','EN_COURS','TERMINE','ECHEC');

-- ─────────────────────────────────────────────────────────
-- SALLES
-- ─────────────────────────────────────────────────────────

CREATE TABLE salles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL,
    nom             VARCHAR(50) NOT NULL,
    batiment        VARCHAR(50),
    etage           INTEGER,
    capacite        INTEGER     NOT NULL,
    type            salle_type  NOT NULL DEFAULT 'STANDARD',
    equipements     JSONB       NOT NULL DEFAULT '[]',
    accessible_pmr  BOOLEAN     NOT NULL DEFAULT false,
    actif           BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_salle_school_nom UNIQUE (school_id, nom)
);

CREATE INDEX idx_salles_school ON salles(school_id) WHERE actif = true;

-- ─────────────────────────────────────────────────────────
-- CRÉNEAUX HORAIRES
-- ─────────────────────────────────────────────────────────

CREATE TABLE creneaux (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID            NOT NULL,
    jour        jour_semaine    NOT NULL,
    heure_debut TIME            NOT NULL,
    heure_fin   TIME            NOT NULL,
    ordre       INTEGER         NOT NULL,
    type        creneau_type    NOT NULL DEFAULT 'COURS',
    CONSTRAINT uq_creneau_school_jour_debut UNIQUE (school_id, jour, heure_debut),
    CONSTRAINT chk_heures CHECK (heure_fin > heure_debut)
);

CREATE INDEX idx_creneaux_school_jour ON creneaux(school_id, jour, ordre);

-- ─────────────────────────────────────────────────────────
-- CONTRAINTES ENSEIGNANT (disponibilités / indisponibilités)
-- ─────────────────────────────────────────────────────────

CREATE TABLE contraintes_enseignant (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL,
    enseignant_id   UUID        NOT NULL,
    annee_scolaire_id UUID      NOT NULL,
    creneau_id      UUID        NOT NULL REFERENCES creneaux(id) ON DELETE CASCADE,
    disponible      BOOLEAN     NOT NULL DEFAULT false, -- false = indisponible sur ce créneau
    motif           VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contrainte_ens_creneau UNIQUE (enseignant_id, creneau_id, annee_scolaire_id)
);

CREATE INDEX idx_contraintes_ens ON contraintes_enseignant(enseignant_id, annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- MATIÈRES × CLASSES (volume horaire)
-- ─────────────────────────────────────────────────────────

CREATE TABLE matieres_classes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    classe_id           UUID        NOT NULL,
    matiere_id          UUID        NOT NULL,
    enseignant_id       UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    heures_semaine      DECIMAL(4,1) NOT NULL,
    salle_preferee_id   UUID        REFERENCES salles(id),
    type_salle_requis   salle_type,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_matiere_classe_annee UNIQUE (classe_id, matiere_id, annee_scolaire_id)
);

CREATE INDEX idx_matieres_classes_classe ON matieres_classes(classe_id, annee_scolaire_id);
CREATE INDEX idx_matieres_classes_ens ON matieres_classes(enseignant_id, annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- EMPLOIS DU TEMPS (sessions planifiées)
-- ─────────────────────────────────────────────────────────

CREATE TABLE emplois_du_temps (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    classe_id           UUID        NOT NULL,
    matiere_id          UUID        NOT NULL,
    enseignant_id       UUID        NOT NULL,
    salle_id            UUID        NOT NULL REFERENCES salles(id),
    creneau_id          UUID        NOT NULL REFERENCES creneaux(id),
    date_debut_validite DATE        NOT NULL,
    date_fin_validite   DATE,
    est_remplacement    BOOLEAN     NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Contraintes d'unicité : pas de double-booking
    CONSTRAINT uq_edt_enseignant UNIQUE (enseignant_id, creneau_id, date_debut_validite),
    CONSTRAINT uq_edt_salle      UNIQUE (salle_id,      creneau_id, date_debut_validite),
    CONSTRAINT uq_edt_classe     UNIQUE (classe_id,     creneau_id, date_debut_validite)
);

CREATE INDEX idx_edt_classe_creneau  ON emplois_du_temps(classe_id, creneau_id);
CREATE INDEX idx_edt_ens_annee       ON emplois_du_temps(enseignant_id, annee_scolaire_id);
CREATE INDEX idx_edt_school_annee    ON emplois_du_temps(school_id, annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- JOBS DE GÉNÉRATION (suivi des lancements d'algorithme)
-- ─────────────────────────────────────────────────────────

CREATE TABLE generation_jobs (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID            NOT NULL,
    annee_scolaire_id   UUID            NOT NULL,
    statut              generation_statut NOT NULL DEFAULT 'EN_ATTENTE',
    declanche_par       UUID            NOT NULL,
    config              JSONB           NOT NULL DEFAULT '{}',
    nb_sessions_totales INTEGER,
    nb_sessions_placees INTEGER,
    conflits            JSONB,          -- liste des conflits non résolus
    duree_ms            INTEGER,        -- durée de l'algorithme en ms
    log_messages        TEXT[],
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gen_jobs_school ON generation_jobs(school_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_edt_updated_at BEFORE UPDATE ON emplois_du_temps FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gen_updated_at BEFORE UPDATE ON generation_jobs   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
