-- =============================================================
-- SEED DEMO — ERP Scolaire 360°
-- École Al-Khawarizmi, Casablanca — données de démonstration
-- =============================================================

-- ─────────────────────────────────────────────────────────
-- BASE: pg_core_admin
-- ─────────────────────────────────────────────────────────
\c pg_core_admin

-- École
INSERT INTO schools (id, nom, code_etablissement, type, adresse, ville, telephone, email_direction)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Lycée Privé Al-Khawarizmi',
  'LPAK-CASA-001',
  'LYCEE',
  '45 Boulevard Zerktouni, Maarif',
  'Casablanca',
  '+212522223344',
  'direction@alkhawarizmi.ma'
);

-- Années scolaires
INSERT INTO annees_scolaires (id, school_id, libelle, date_debut, date_fin, statut)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2023-2024', '2023-09-04', '2024-06-28', 'TERMINEE'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2024-2025', '2024-09-02', '2025-06-27', 'EN_COURS');

-- Niveaux
INSERT INTO niveaux (id, school_id, code, libelle, cycle, ordre)
VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '2BAC-SC', '2ème Bac Sciences', 'LYCEE', 3),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '2BAC-LL', '2ème Bac Lettres', 'LYCEE', 3),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', '1BAC-SC', '1ère Bac Sciences', 'LYCEE', 2),
  ('a3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', '1BAC-LL', '1ère Bac Lettres', 'LYCEE', 2),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'TC', 'Tronc Commun', 'LYCEE', 1);

-- Matières (12)
INSERT INTO matieres (id, school_id, code, libelle, libelle_arabe, coefficient_defaut, domaine, est_obligatoire)
VALUES
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'MATH', 'Mathématiques', 'الرياضيات', 7.00, 'SCIENTIFIQUE', true),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'PHY', 'Physique-Chimie', 'الفيزياء والكيمياء', 6.00, 'SCIENTIFIQUE', true),
  ('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'SVT', 'Sciences de la Vie et de la Terre', 'علوم الحياة والأرض', 5.00, 'SCIENTIFIQUE', true),
  ('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'FR', 'Français', 'الفرنسية', 3.00, 'LANGUES', true),
  ('a4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'AR', 'Arabe', 'العربية', 3.00, 'LITTERAIRE', true),
  ('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'EN', 'Anglais', 'الإنجليزية', 2.00, 'LANGUES', true),
  ('a4000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'INFO', 'Informatique', 'الإعلاميات', 2.00, 'TECHNOLOGIQUE', true),
  ('a4000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'HIST', 'Histoire-Géographie', 'التاريخ والجغرافيا', 2.00, 'LITTERAIRE', true),
  ('a4000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'ISL', 'Éducation Islamique', 'التربية الإسلامية', 2.00, 'LITTERAIRE', true),
  ('a4000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'EPS', 'Éducation Physique', 'التربية البدنية', 1.00, 'SPORT', false),
  ('a4000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'PHILO', 'Philosophie', 'الفلسفة', 2.00, 'LITTERAIRE', true),
  ('a4000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'ECO', 'Économie-Gestion', 'الاقتصاد', 2.00, 'TECHNOLOGIQUE', false);

-- Enseignants (10)
INSERT INTO enseignants (id, school_id, matricule, nom, prenom, email_pro, type_contrat, date_embauche, specialite_principale, heures_service_hebdo, statut,
  date_naissance, cnie, telephone, email_perso)
VALUES
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'ENS-001', 'Benali', 'Mohammed', 'mbenali@alkhawarizmi.ma', 'TITULAIRE', '2015-09-01', 'Mathématiques', 18, 'ACTIF',
    encode(convert_to('1980-03-15', 'UTF8'), 'escape'), encode(convert_to('AB123456', 'UTF8'), 'escape'), encode(convert_to('+212661001001', 'UTF8'), 'escape'), encode(convert_to('mbenali@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'ENS-002', 'Tahiri', 'Fatima', 'ftahiri@alkhawarizmi.ma', 'TITULAIRE', '2012-09-01', 'Physique-Chimie', 18, 'ACTIF',
    encode(convert_to('1978-07-22', 'UTF8'), 'escape'), encode(convert_to('CD234567', 'UTF8'), 'escape'), encode(convert_to('+212661002002', 'UTF8'), 'escape'), encode(convert_to('ftahiri@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'ENS-003', 'Ouazzani', 'Karim', 'kouazzani@alkhawarizmi.ma', 'TITULAIRE', '2018-09-01', 'Sciences de la Vie et de la Terre', 18, 'ACTIF',
    encode(convert_to('1985-11-30', 'UTF8'), 'escape'), encode(convert_to('EF345678', 'UTF8'), 'escape'), encode(convert_to('+212661003003', 'UTF8'), 'escape'), encode(convert_to('kouazzani@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'ENS-004', 'Dupont', 'Nathalie', 'ndupont@alkhawarizmi.ma', 'CONTRACTUEL', '2020-09-01', 'Français', 15, 'ACTIF',
    encode(convert_to('1988-02-14', 'UTF8'), 'escape'), encode(convert_to('GH456789', 'UTF8'), 'escape'), encode(convert_to('+212661004004', 'UTF8'), 'escape'), encode(convert_to('ndupont@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'ENS-005', 'Alaoui', 'Hassan', 'halaoui@alkhawarizmi.ma', 'TITULAIRE', '2010-09-01', 'Arabe', 18, 'ACTIF',
    encode(convert_to('1975-06-10', 'UTF8'), 'escape'), encode(convert_to('IJ567890', 'UTF8'), 'escape'), encode(convert_to('+212661005005', 'UTF8'), 'escape'), encode(convert_to('halaoui@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'ENS-006', 'Smith', 'Sarah', 'ssmith@alkhawarizmi.ma', 'VACATAIRE', '2022-09-01', 'Anglais', 12, 'ACTIF',
    encode(convert_to('1992-09-05', 'UTF8'), 'escape'), encode(convert_to('KL678901', 'UTF8'), 'escape'), encode(convert_to('+212661006006', 'UTF8'), 'escape'), encode(convert_to('ssmith@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'ENS-007', 'Benmoussa', 'Youssef', 'ybenmoussa@alkhawarizmi.ma', 'TITULAIRE', '2016-09-01', 'Informatique', 15, 'ACTIF',
    encode(convert_to('1982-04-20', 'UTF8'), 'escape'), encode(convert_to('MN789012', 'UTF8'), 'escape'), encode(convert_to('+212661007007', 'UTF8'), 'escape'), encode(convert_to('ybenmoussa@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'ENS-008', 'Chraibi', 'Leila', 'lchraibi@alkhawarizmi.ma', 'TITULAIRE', '2014-09-01', 'Histoire-Géographie', 18, 'ACTIF',
    encode(convert_to('1979-12-01', 'UTF8'), 'escape'), encode(convert_to('OP890123', 'UTF8'), 'escape'), encode(convert_to('+212661008008', 'UTF8'), 'escape'), encode(convert_to('lchraibi@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'ENS-009', 'Idrissi', 'Rachid', 'ridrissi@alkhawarizmi.ma', 'TITULAIRE', '2011-09-01', 'Éducation Islamique', 18, 'ACTIF',
    encode(convert_to('1976-08-25', 'UTF8'), 'escape'), encode(convert_to('QR901234', 'UTF8'), 'escape'), encode(convert_to('+212661009009', 'UTF8'), 'escape'), encode(convert_to('ridrissi@gmail.com', 'UTF8'), 'escape')),
  ('a5000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'ENS-010', 'Mansouri', 'Amine', 'amansouri@alkhawarizmi.ma', 'TITULAIRE', '2019-09-01', 'Philosophie', 18, 'ACTIF',
    encode(convert_to('1986-01-17', 'UTF8'), 'escape'), encode(convert_to('ST012345', 'UTF8'), 'escape'), encode(convert_to('+212661010010', 'UTF8'), 'escape'), encode(convert_to('amansouri@gmail.com', 'UTF8'), 'escape'));

-- Classes (8 classes, année 2024-2025)
INSERT INTO classes (id, school_id, annee_scolaire_id, niveau_id, nom, effectif_max, titulaire_id)
VALUES
  ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', '2BAC-SC-A', 35, 'a5000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', '2BAC-SC-B', 35, 'a5000000-0000-0000-0000-000000000002'),
  ('a6000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', '2BAC-LL-A', 32, 'a5000000-0000-0000-0000-000000000005'),
  ('a6000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', '1BAC-SC-A', 35, 'a5000000-0000-0000-0000-000000000003'),
  ('a6000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', '1BAC-SC-B', 35, 'a5000000-0000-0000-0000-000000000007'),
  ('a6000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000004', '1BAC-LL-A', 32, 'a5000000-0000-0000-0000-000000000004'),
  ('a6000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000005', 'TC-A', 35, 'a5000000-0000-0000-0000-000000000008'),
  ('a6000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000005', 'TC-B', 35, 'a5000000-0000-0000-0000-000000000006');

-- Élèves (150 élèves — représentatif)
-- Prénoms / Noms marocains courants
-- PII (date_naissance, lieu_naissance, adresse, téléphone, cnie) stockés en BYTEA (encode demo)
INSERT INTO eleves (id, school_id, numero_massar, numero_interne, nom, prenom, date_naissance, lieu_naissance, sexe, nationalite, adresse, telephone_urgence, bourse_type, statut, date_inscription)
SELECT
  ('b' || LPAD((n)::text, 7, '0') || '-0000-0000-0000-' || LPAD((n*100)::text, 12, '0'))::uuid,
  'a1000000-0000-0000-0000-000000000001',
  'G' || LPAD(n::text, 9, '0'),
  'INT-' || LPAD(n::text, 5, '0'),
  (ARRAY['Benali','Tahiri','Alaoui','Chraibi','Idrissi','Mansouri','Benmoussa','Ouazzani','Rachidi','Ziani',
         'Lamrani','Bennani','Tazi','Fassi','Kettani','Berrada','Sebti','Ghali','Bouazza','Hajji',
         'El Amrani','El Fassi','El Idrissi','El Mansouri','Ait Benali'])[((n-1) % 25) + 1],
  (ARRAY['Mohammed','Fatima','Youssef','Aicha','Khalid','Maryam','Hamza','Sara','Amine','Nadia',
         'Omar','Zineb','Tariq','Houda','Reda','Imane','Bilal','Sanaa','Ilyas','Rim',
         'Adam','Hajar','Mehdi','Loubna','Saad'])[((n-1) % 25) + 1],
  encode(convert_to((2004 + (n % 4))::text || '-' || LPAD(((n % 12) + 1)::text, 2, '0') || '-' || LPAD(((n % 28) + 1)::text, 2, '0'), 'UTF8'), 'escape'),
  encode(convert_to((ARRAY['Casablanca','Rabat','Marrakech','Fès','Meknès','Agadir','Tanger','Oujda'])[(n % 8) + 1], 'UTF8'), 'escape'),
  CASE WHEN n % 2 = 0 THEN 'F' ELSE 'M' END,
  'Marocaine',
  encode(convert_to('N° ' || n || ', Rue des Fleurs, Casablanca', 'UTF8'), 'escape'),
  encode(convert_to('+2126' || LPAD((60000000 + n)::text, 8, '0'), 'UTF8'), 'escape'),
  CASE WHEN n % 15 = 0 THEN 'NATIONALE' ELSE 'AUCUNE' END,
  'ACTIF',
  CURRENT_DATE - INTERVAL '1 year'
FROM generate_series(1, 150) AS n;

-- Inscriptions (tous les élèves dans la bonne classe selon leur numéro)
INSERT INTO inscriptions (id, eleve_id, classe_id, annee_scolaire_id, date_inscription, statut)
SELECT
  gen_random_uuid(),
  ('b' || LPAD((n)::text, 7, '0') || '-0000-0000-0000-' || LPAD((n*100)::text, 12, '0'))::uuid,
  (ARRAY[
    'a6000000-0000-0000-0000-000000000001',
    'a6000000-0000-0000-0000-000000000002',
    'a6000000-0000-0000-0000-000000000003',
    'a6000000-0000-0000-0000-000000000004',
    'a6000000-0000-0000-0000-000000000005',
    'a6000000-0000-0000-0000-000000000006',
    'a6000000-0000-0000-0000-000000000007',
    'a6000000-0000-0000-0000-000000000008'
  ])[((n-1) % 8) + 1]::uuid,
  'a2000000-0000-0000-0000-000000000002',
  CURRENT_DATE - INTERVAL '2 months',
  'CONFIRMEE'
FROM generate_series(1, 150) AS n;

-- ─────────────────────────────────────────────────────────
-- BASE: pg_finance
-- ─────────────────────────────────────────────────────────
\c pg_finance

-- Familles de tarifs
INSERT INTO familles_tarifs (id, school_id, annee_scolaire_id, libelle, description)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'Standard', 'Tarif scolarité standard 2024-2025'),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'Boursier', 'Tarif réduit pour boursiers');

-- Postes de facturation
INSERT INTO postes_facturation (id, famille_tarif_id, libelle, type, montant_ht, tva_taux, echeance, obligatoire, ordre)
VALUES
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Frais de scolarité — 1er semestre', 'SCOLARITE', 9500.00, 0, '2024-10-15', true, 1),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Frais de scolarité — 2ème semestre', 'SCOLARITE', 9500.00, 0, '2025-02-15', true, 2),
  ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Frais d''inscription', 'INSCRIPTION', 1200.00, 0, '2024-09-15', true, 0),
  ('c2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'Cantine — Annuel', 'CANTINE', 4800.00, 0, '2024-10-01', false, 3),
  ('c2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'Frais de scolarité — 1er semestre (boursier)', 'SCOLARITE', 4750.00, 0, '2024-10-15', true, 1),
  ('c2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000002', 'Frais de scolarité — 2ème semestre (boursier)', 'SCOLARITE', 4750.00, 0, '2025-02-15', true, 2);

-- Séquences de numérotation
INSERT INTO sequences_facture (school_id, annee_scolaire_id, dernier_numero)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 0);

-- Factures (150 élèves × 1 facture semestre 1)
INSERT INTO factures (id, school_id, numero_facture, eleve_id, annee_scolaire_id, date_emission, date_echeance, montant_total, montant_regle, statut)
SELECT
  ('c3' || LPAD(n::text, 6, '0') || '-0000-0000-0000-' || LPAD((n*7)::text, 12, '0'))::uuid,
  'a1000000-0000-0000-0000-000000000001',
  'FAC-2425-' || LPAD(n::text, 5, '0'),
  ('b' || LPAD(n::text, 7, '0') || '-0000-0000-0000-' || LPAD((n*100)::text, 12, '0'))::uuid,
  'a2000000-0000-0000-0000-000000000002',
  '2024-09-15',
  '2024-10-15',
  CASE WHEN n % 15 = 0 THEN 4750.00 + 1200.00 ELSE 9500.00 + 1200.00 END,
  CASE
    WHEN n % 5 = 0 THEN 0.00          -- impayée (20%)
    WHEN n % 5 = 1 THEN               -- partiellement réglée (20%)
      CASE WHEN n % 15 = 0 THEN 2375.00 ELSE 5350.00 END
    ELSE                               -- réglée (60%)
      CASE WHEN n % 15 = 0 THEN 5950.00 ELSE 10700.00 END
  END,
  CASE
    WHEN n % 5 = 0 THEN 'EN_ATTENTE'
    WHEN n % 5 = 1 THEN 'PARTIELLE'
    ELSE 'REGLEE'
  END
FROM generate_series(1, 150) AS n;

-- Paiements pour factures réglées ou partielles
INSERT INTO paiements (id, facture_id, montant, date_paiement, mode, statut)
SELECT
  gen_random_uuid(),
  ('c3' || LPAD(n::text, 6, '0') || '-0000-0000-0000-' || LPAD((n*7)::text, 12, '0'))::uuid,
  CASE
    WHEN n % 5 = 1 THEN
      CASE WHEN n % 15 = 0 THEN 2375.00 ELSE 5350.00 END
    ELSE
      CASE WHEN n % 15 = 0 THEN 5950.00 ELSE 10700.00 END
  END,
  NOW() - INTERVAL '15 days',
  (ARRAY['ESPECES','CHEQUE','VIREMENT','CMI_ONLINE'])[(n % 4) + 1],
  'CONFIRME'
FROM generate_series(1, 150) AS n
WHERE n % 5 != 0;

-- ─────────────────────────────────────────────────────────
-- BASE: pg_gradebook
-- ─────────────────────────────────────────────────────────
\c pg_gradebook

-- Périodes d'évaluation (3 trimestres 2024-2025)
INSERT INTO periodes_evaluation (id, school_id, annee_scolaire_id, libelle, type, date_debut, date_fin, ordre, bulletins_publies)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', '1er Trimestre 2024-2025', 'TRIMESTRE', '2024-09-02', '2024-12-20', 1, true),
  ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', '2ème Trimestre 2024-2025', 'TRIMESTRE', '2025-01-06', '2025-03-28', 2, false),
  ('d1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', '3ème Trimestre 2024-2025', 'TRIMESTRE', '2025-04-07', '2025-06-27', 3, false);

-- Devoirs (DS Maths T1 pour toutes les classes sciences)
INSERT INTO devoirs (id, school_id, classe_id, matiere_id, enseignant_id, periode_id, libelle, type, date_evaluation, bareme, coefficient)
VALUES
  ('d2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'DS1 Mathématiques — 2BAC-SC-A', 'DEVOIR_SURVEILLE', '2024-10-15', 20, 2),
  ('d2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'DS1 Mathématiques — 2BAC-SC-B', 'DEVOIR_SURVEILLE', '2024-10-15', 20, 2),
  ('d2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'DS1 Physique-Chimie — 2BAC-SC-A', 'DEVOIR_SURVEILLE', '2024-10-22', 20, 2),
  ('d2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'DS1 Mathématiques — 1BAC-SC-A', 'DEVOIR_SURVEILLE', '2024-10-16', 20, 2),
  ('d2000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'DS1 Arabe — 2BAC-LL-A', 'DEVOIR_SURVEILLE', '2024-10-17', 20, 2);

-- Marquer devoirs comme renseignés
UPDATE devoirs SET est_renseigne = true WHERE id IN (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003'
);

-- Notes pour DS1 Maths 2BAC-SC-A (élèves 1 à 19 — classe A, odd numbers map to class 1)
INSERT INTO notes (id, devoir_id, eleve_id, note, absent, saisie_par)
SELECT
  gen_random_uuid(),
  'd2000000-0000-0000-0000-000000000001',
  ('b' || LPAD(n::text, 7, '0') || '-0000-0000-0000-' || LPAD((n*100)::text, 12, '0'))::uuid,
  ROUND((7 + (random() * 13))::numeric, 2),
  false,
  'a5000000-0000-0000-0000-000000000001'
FROM generate_series(1, 2, 8) AS n  -- élèves dans 2BAC-SC-A (n%8=0 => classe idx 0)
UNION ALL
SELECT gen_random_uuid(), 'd2000000-0000-0000-0000-000000000001',
  ('b' || LPAD(n::text, 7, '0') || '-0000-0000-0000-' || LPAD((n*100)::text, 12, '0'))::uuid,
  ROUND((6 + (random() * 14))::numeric, 2), false, 'a5000000-0000-0000-0000-000000000001'
FROM generate_series(9, 150, 8) AS n;

-- ─────────────────────────────────────────────────────────
-- BASE: pg_attendance
-- ─────────────────────────────────────────────────────────
\c pg_attendance

-- Absences sur les 30 derniers jours (quelques élèves)
INSERT INTO absences (id, school_id, eleve_id, emploi_du_temps_id, classe_id, matiere_id, enseignant_id, date, created_at, type, justifie, motif, saisi_par, methode_pointage, notif_parent_statut)
SELECT
  gen_random_uuid(),
  'a1000000-0000-0000-0000-000000000001',
  ('b' || LPAD(eleve_num::text, 7, '0') || '-0000-0000-0000-' || LPAD((eleve_num*100)::text, 12, '0'))::uuid,
  gen_random_uuid(),  -- emploi_du_temps_id fictif
  'a6000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  CURRENT_DATE - (abs_day || ' days')::interval,
  NOW() - (abs_day || ' days')::interval,
  CASE WHEN eleve_num % 3 = 0 THEN 'RETARD' ELSE 'ABSENCE' END,
  CASE WHEN eleve_num % 4 = 0 THEN true ELSE false END,
  CASE WHEN eleve_num % 4 = 0 THEN 'Certificat médical' ELSE NULL END,
  'a5000000-0000-0000-0000-000000000001',
  'MANUEL',
  CASE WHEN eleve_num % 2 = 0 THEN 'ENVOYE' ELSE 'EN_ATTENTE' END
FROM
  (SELECT * FROM generate_series(1, 25) AS eleve_num) eleves,
  (SELECT * FROM generate_series(1, 5) AS abs_day) days
WHERE (eleve_num + abs_day) % 3 = 0;

-- ─────────────────────────────────────────────────────────
-- RÉSUMÉ
-- ─────────────────────────────────────────────────────────
-- École : Al-Khawarizmi (Casablanca)
-- 2 années scolaires, 5 niveaux, 8 classes, 10 enseignants, 12 matières
-- 150 élèves inscrits
-- 150 factures (60% réglées, 20% partielles, 20% en attente)
-- 5 devoirs, notes générées pour 2BAC-SC-A
-- ~40 absences/retards sur 30 jours
