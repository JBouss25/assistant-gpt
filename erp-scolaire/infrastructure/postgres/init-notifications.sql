-- Notification Service — Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE notif_canal      AS ENUM ('WHATSAPP','PUSH','EMAIL','SMS');
CREATE TYPE notif_statut     AS ENUM ('EN_ATTENTE','ENVOYE','ECHEC','IGNORE');
CREATE TYPE notif_priorite   AS ENUM ('HIGH','NORMAL','LOW');

-- ─────────────────────────────────────────────────────────
-- TEMPLATES DE NOTIFICATION (multilingue)
-- ─────────────────────────────────────────────────────────

CREATE TABLE notification_templates (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,  -- ex: PARENT_ABSENCE_ALERT
    canal       notif_canal NOT NULL,
    langue      VARCHAR(5)  NOT NULL DEFAULT 'fr',
    sujet       VARCHAR(200),                  -- pour Email
    corps       TEXT        NOT NULL,          -- avec {{variables}}
    waba_template_name VARCHAR(100),           -- Nom du template WhatsApp Business approuvé
    actif       BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_template_code_canal_langue UNIQUE (code, canal, langue)
);

CREATE INDEX idx_templates_code ON notification_templates(code, canal, langue) WHERE actif = true;

-- ─────────────────────────────────────────────────────────
-- PRÉFÉRENCES UTILISATEUR (opt-out par canal)
-- ─────────────────────────────────────────────────────────

CREATE TABLE user_notification_prefs (
    user_id         UUID        NOT NULL,
    school_id       UUID        NOT NULL,
    canal           notif_canal NOT NULL,
    actif           BOOLEAN     NOT NULL DEFAULT true,
    fcm_token       VARCHAR(300),   -- Token Firebase pour Push
    whatsapp_optin  BOOLEAN     NOT NULL DEFAULT true,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, canal)
);

-- ─────────────────────────────────────────────────────────
-- JOURNAL D'ENVOI (partitionné par mois)
-- ─────────────────────────────────────────────────────────

CREATE TABLE notification_logs (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL,
    recipient_id    UUID        NOT NULL,           -- user_id du destinataire
    eleve_id        UUID,                           -- élève concerné (si applicable)
    template_code   VARCHAR(100) NOT NULL,
    canal           notif_canal NOT NULL,
    priorite        notif_priorite NOT NULL DEFAULT 'NORMAL',
    statut          notif_statut NOT NULL DEFAULT 'EN_ATTENTE',
    payload         JSONB       NOT NULL DEFAULT '{}', -- variables utilisées
    provider_ref    VARCHAR(200),                    -- ID message WhatsApp/Email/SMS
    erreur          TEXT,
    tentatives      INTEGER     NOT NULL DEFAULT 0,
    prochaine_tentative TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions
CREATE TABLE notification_logs_2025_q3 PARTITION OF notification_logs FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE notification_logs_2025_q4 PARTITION OF notification_logs FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE notification_logs_2026_q1 PARTITION OF notification_logs FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE notification_logs_2026_q2 PARTITION OF notification_logs FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE notification_logs_2026_q3 PARTITION OF notification_logs FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE notification_logs_2026_q4 PARTITION OF notification_logs FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE INDEX idx_notif_logs_recipient ON notification_logs(recipient_id, created_at DESC);
CREATE INDEX idx_notif_logs_eleve     ON notification_logs(eleve_id, created_at DESC) WHERE eleve_id IS NOT NULL;
CREATE INDEX idx_notif_logs_pending   ON notification_logs(statut, prochaine_tentative)
    WHERE statut IN ('EN_ATTENTE', 'ECHEC') AND tentatives < 3;

-- ─────────────────────────────────────────────────────────
-- DONNÉES DE SEED — Templates de base
-- ─────────────────────────────────────────────────────────

INSERT INTO notification_templates (code, canal, langue, sujet, corps, waba_template_name) VALUES

-- Absence — WhatsApp
('PARENT_ABSENCE_ALERT', 'WHATSAPP', 'fr', NULL,
 'Bonjour, votre enfant *{{eleve_prenom}} {{eleve_nom}}* est absent(e) le *{{date}}* à *{{heure}}* ({{matiere}}). Veuillez justifier cette absence via le portail ou contacter l''établissement.',
 'parent_absence_alert_v1'),

-- Absence — Email
('PARENT_ABSENCE_ALERT', 'EMAIL', 'fr',
 'Absence signalée — {{eleve_prenom}} {{eleve_nom}}',
 '<h2>Absence signalée</h2><p>Votre enfant <strong>{{eleve_prenom}} {{eleve_nom}}</strong> est absent(e) le <strong>{{date}}</strong> au cours de <strong>{{matiere}}</strong> ({{heure}}).</p><p>Merci de justifier cette absence via <a href="{{portail_url}}">le portail parents</a>.</p>',
 NULL),

-- Retard — WhatsApp
('PARENT_RETARD_ALERT', 'WHATSAPP', 'fr', NULL,
 'Information : votre enfant *{{eleve_prenom}} {{eleve_nom}}* est arrivé(e) avec *{{minutes_retard}} minutes de retard* le {{date}} au cours de {{matiere}}.',
 'parent_retard_alert_v1'),

-- Bulletin publié — WhatsApp
('BULLETIN_PUBLIE', 'WHATSAPP', 'fr', NULL,
 'Les bulletins du *{{periode}}* sont disponibles pour *{{eleve_prenom}} {{eleve_nom}}*. Consultez-les sur le portail : {{portail_url}}',
 'bulletin_publie_v1'),

-- Bulletin publié — Email
('BULLETIN_PUBLIE', 'EMAIL', 'fr',
 'Bulletin {{periode}} disponible — {{eleve_prenom}} {{eleve_nom}}',
 '<h2>Bulletin disponible</h2><p>Le bulletin du <strong>{{periode}}</strong> de <strong>{{eleve_prenom}} {{eleve_nom}}</strong> est disponible.</p><p><a href="{{portail_url}}">Télécharger le bulletin</a></p>',
 NULL),

-- Relance paiement — WhatsApp
('RELANCE_PAIEMENT_1', 'WHATSAPP', 'fr', NULL,
 'Rappel : la facture n°*{{numero_facture}}* d''un montant de *{{montant}} MAD* est en attente de règlement depuis {{jours_retard}} jours. Réglez en ligne : {{portail_url}}',
 'relance_paiement_1_v1'),

('RELANCE_PAIEMENT_2', 'WHATSAPP', 'fr', NULL,
 '⚠️ 2ème rappel : facture n°*{{numero_facture}}* — *{{montant}} MAD* non réglée. Veuillez régulariser rapidement ou contacter l''administration.',
 'relance_paiement_2_v1'),

('RELANCE_PAIEMENT_3', 'WHATSAPP', 'fr', NULL,
 '🔴 Dernier rappel : facture n°*{{numero_facture}}* — *{{montant}} MAD*. Sans régularisation sous 48h, un entretien avec l''administration sera programmé.',
 'relance_paiement_3_v1'),

-- Nouveau devoir LMS — Push
('NOUVEAU_DEVOIR_LMS', 'PUSH', 'fr', 'Nouveau devoir',
 '{{matiere}} : "{{titre_devoir}}" — À rendre avant le {{date_limite}}',
 NULL),

-- Devoir corrigé — Push
('DEVOIR_CORRIGE', 'PUSH', 'fr', 'Devoir corrigé',
 'Votre devoir "{{titre_devoir}}" a été corrigé. Note : {{note}}/{{bareme}}',
 NULL);
