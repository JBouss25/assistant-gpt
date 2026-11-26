-- Finance Service — Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE facture_statut     AS ENUM ('EN_ATTENTE','PARTIELLE','REGLEE','EN_RETARD','ANNULEE');
CREATE TYPE paiement_mode      AS ENUM ('ESPECES','CHEQUE','VIREMENT','CMI_ONLINE','STRIPE','AUTRE');
CREATE TYPE paiement_statut    AS ENUM ('EN_ATTENTE','CONFIRME','ECHEC','REMBOURSE');
CREATE TYPE poste_type         AS ENUM ('SCOLARITE','INSCRIPTION','CANTINE','TRANSPORT','ACTIVITE','AUTRE');
CREATE TYPE relance_statut     AS ENUM ('PLANIFIEE','ENVOYEE','IGNOREE','REGLEE');

-- ─────────────────────────────────────────────────────────
-- FAMILLES DE TARIFS
-- ─────────────────────────────────────────────────────────

CREATE TABLE familles_tarifs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    libelle             VARCHAR(100) NOT NULL,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_famille_school_annee_libelle UNIQUE (school_id, annee_scolaire_id, libelle)
);

CREATE INDEX idx_familles_school_annee ON familles_tarifs(school_id, annee_scolaire_id);

-- ─────────────────────────────────────────────────────────
-- POSTES DE FACTURATION (lignes de tarif)
-- ─────────────────────────────────────────────────────────

CREATE TABLE postes_facturation (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    famille_tarif_id    UUID        NOT NULL REFERENCES familles_tarifs(id) ON DELETE CASCADE,
    libelle             VARCHAR(200) NOT NULL,
    type                poste_type  NOT NULL,
    montant_ht          DECIMAL(10,2) NOT NULL CHECK (montant_ht >= 0),
    tva_taux            DECIMAL(5,2)  NOT NULL DEFAULT 0.0 CHECK (tva_taux >= 0),
    montant_ttc         DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(montant_ht * (1 + tva_taux / 100), 2)) STORED,
    echeance            DATE        NOT NULL,
    obligatoire         BOOLEAN     NOT NULL DEFAULT true,
    ordre               INTEGER     NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_postes_famille ON postes_facturation(famille_tarif_id);

-- ─────────────────────────────────────────────────────────
-- FACTURES
-- ─────────────────────────────────────────────────────────

CREATE TABLE factures (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id           UUID        NOT NULL,
    numero_facture      VARCHAR(30) NOT NULL UNIQUE,
    eleve_id            UUID        NOT NULL,
    annee_scolaire_id   UUID        NOT NULL,
    date_emission       DATE        NOT NULL DEFAULT CURRENT_DATE,
    date_echeance       DATE        NOT NULL,
    montant_total       DECIMAL(10,2) NOT NULL CHECK (montant_total >= 0),
    montant_regle       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    montant_restant     DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(montant_total - montant_regle, 2)) STORED,
    statut              facture_statut NOT NULL DEFAULT 'EN_ATTENTE',
    pdf_url             VARCHAR(500),
    notes_internes      TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_factures_eleve        ON factures(eleve_id);
CREATE INDEX idx_factures_school_annee ON factures(school_id, annee_scolaire_id);
CREATE INDEX idx_factures_statut_echeance ON factures(statut, date_echeance)
    WHERE statut IN ('EN_ATTENTE', 'PARTIELLE', 'EN_RETARD');

-- ─────────────────────────────────────────────────────────
-- LIGNES DE FACTURE
-- ─────────────────────────────────────────────────────────

CREATE TABLE lignes_facture (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    facture_id      UUID        NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    poste_id        UUID        REFERENCES postes_facturation(id),
    libelle         VARCHAR(200) NOT NULL,
    type            poste_type  NOT NULL,
    montant_ht      DECIMAL(10,2) NOT NULL,
    tva_taux        DECIMAL(5,2)  NOT NULL DEFAULT 0.0,
    montant_ttc     DECIMAL(10,2) NOT NULL,
    ordre           INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX idx_lignes_facture ON lignes_facture(facture_id);

-- ─────────────────────────────────────────────────────────
-- PAIEMENTS
-- ─────────────────────────────────────────────────────────

CREATE TABLE paiements (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    facture_id          UUID        NOT NULL REFERENCES factures(id),
    montant             DECIMAL(10,2) NOT NULL CHECK (montant > 0),
    date_paiement       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    mode                paiement_mode NOT NULL,
    reference_externe   VARCHAR(200),               -- Ref CMI / Stripe
    statut              paiement_statut NOT NULL DEFAULT 'CONFIRME',
    metadata_gateway    JSONB        NOT NULL DEFAULT '{}', -- Payload brut CMI/Stripe
    encaisse_par        UUID,
    recu_url            VARCHAR(500),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paiements_facture   ON paiements(facture_id);
CREATE INDEX idx_paiements_reference ON paiements(reference_externe) WHERE reference_externe IS NOT NULL;
CREATE INDEX idx_paiements_statut    ON paiements(statut, created_at DESC)
    WHERE statut = 'EN_ATTENTE';

-- ─────────────────────────────────────────────────────────
-- RELANCES AUTOMATIQUES
-- ─────────────────────────────────────────────────────────

CREATE TABLE relances (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    facture_id      UUID        NOT NULL REFERENCES factures(id),
    school_id       UUID        NOT NULL,
    numero_relance  INTEGER     NOT NULL DEFAULT 1, -- 1ère, 2ème, 3ème relance
    planifiee_le    DATE        NOT NULL,
    envoyee_le      TIMESTAMPTZ,
    statut          relance_statut NOT NULL DEFAULT 'PLANIFIEE',
    canal           VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP', -- WHATSAPP, EMAIL, SMS
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_relance_facture_num UNIQUE (facture_id, numero_relance)
);

CREATE INDEX idx_relances_planifiee ON relances(planifiee_le, statut)
    WHERE statut = 'PLANIFIEE';

-- ─────────────────────────────────────────────────────────
-- SÉQUENCES DE NUMÉROTATION (par école × année)
-- ─────────────────────────────────────────────────────────

CREATE TABLE sequences_facture (
    school_id           UUID    NOT NULL,
    annee_scolaire_id   UUID    NOT NULL,
    dernier_numero      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (school_id, annee_scolaire_id)
);

-- Fonction pour générer le prochain numéro de facture de façon atomique
CREATE OR REPLACE FUNCTION next_invoice_number(p_school_id UUID, p_annee_id UUID, p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_num INTEGER;
BEGIN
    INSERT INTO sequences_facture (school_id, annee_scolaire_id, dernier_numero)
    VALUES (p_school_id, p_annee_id, 1)
    ON CONFLICT (school_id, annee_scolaire_id)
    DO UPDATE SET dernier_numero = sequences_facture.dernier_numero + 1
    RETURNING dernier_numero INTO v_num;

    RETURN p_prefix || '-' || LPAD(v_num::TEXT, 5, '0');
END;
$$;

-- Triggers updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_factures_updated_at BEFORE UPDATE ON factures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
