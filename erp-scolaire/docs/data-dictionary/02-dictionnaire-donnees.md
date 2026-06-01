# Dictionnaire de Données Préliminaire — ERP Scolaire 360°

**Version :** 1.0  
**Date :** 2026-05-07

---

## Conventions

- `PK` : Clé primaire (UUID v7 par défaut pour la scalabilité temporelle)
- `FK` : Clé étrangère
- `IDX` : Index recommandé
- `ENC` : Champ chiffré at-rest (AES-256)
- Types : `UUID`, `VARCHAR(n)`, `TEXT`, `INTEGER`, `DECIMAL(p,s)`, `BOOLEAN`, `TIMESTAMP WITH TIME ZONE`, `JSONB`

---

## Domaine 1 : Core Admin

### Table `schools`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identifiant unique de l'établissement |
| `nom` | VARCHAR(200) | NOT NULL | Raison sociale officielle |
| `code_etablissement` | VARCHAR(20) | UNIQUE NOT NULL | Code Massar ou interne |
| `type` | ENUM | NOT NULL | `PRIMAIRE`, `COLLEGE`, `LYCEE`, `MULTI_CYCLE` |
| `adresse` | TEXT | NOT NULL | Adresse complète |
| `ville` | VARCHAR(100) | NOT NULL IDX | Ville |
| `telephone` | VARCHAR(20) | | Numéro principal |
| `email_direction` | VARCHAR(150) | NOT NULL | Email de la direction |
| `logo_url` | VARCHAR(500) | | URL du logo (S3) |
| `config_pedagogique` | JSONB | | Paramètres : système de notation, langue, etc. |
| `timezone` | VARCHAR(50) | NOT NULL DEFAULT 'Africa/Casablanca' | Fuseau horaire |
| `actif` | BOOLEAN | NOT NULL DEFAULT true | Soft delete |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `annees_scolaires`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `libelle` | VARCHAR(20) | NOT NULL | Ex: `2025-2026` |
| `date_debut` | DATE | NOT NULL | |
| `date_fin` | DATE | NOT NULL | |
| `statut` | ENUM | NOT NULL | `PLANIFIEE`, `EN_COURS`, `TERMINEE` |
| `calendrier_config` | JSONB | | Vacances, jours fériés, trimestres |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `niveaux`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `code` | VARCHAR(20) | NOT NULL | Ex: `6EME`, `5EME`, `1BAC`, `TCS` |
| `libelle` | VARCHAR(100) | NOT NULL | Libellé complet |
| `cycle` | ENUM | NOT NULL | `PRIMAIRE`, `COLLEGE`, `LYCEE` |
| `ordre` | INTEGER | NOT NULL | Pour trier les niveaux |

---

### Table `classes`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `niveau_id` | UUID | FK niveaux.id NOT NULL | |
| `nom` | VARCHAR(50) | NOT NULL | Ex: `6ème A`, `Terminale S1` |
| `effectif_max` | INTEGER | NOT NULL DEFAULT 35 | Capacité maximale |
| `titulaire_id` | UUID | FK enseignants.id | Professeur principal |
| `salle_principale_id` | UUID | FK salles.id | Salle attitrée (optionnel) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `eleves`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `numero_massar` | VARCHAR(20) | UNIQUE | Code d'identification national (Massar) |
| `numero_interne` | VARCHAR(20) | NOT NULL IDX | Numéro d'inscription interne |
| `nom` | VARCHAR(100) | NOT NULL | Nom de famille |
| `prenom` | VARCHAR(100) | NOT NULL | Prénom(s) |
| `date_naissance` | DATE | NOT NULL ENC | Date de naissance |
| `lieu_naissance` | VARCHAR(100) | ENC | Lieu de naissance |
| `sexe` | ENUM | NOT NULL | `M`, `F` |
| `nationalite` | VARCHAR(50) | NOT NULL DEFAULT 'Marocaine' | |
| `adresse` | TEXT | ENC | Adresse domicile |
| `telephone_urgence` | VARCHAR(20) | ENC | |
| `photo_url` | VARCHAR(500) | | URL photo (S3) |
| `numero_cnie` | VARCHAR(20) | UNIQUE ENC | CIN / CNIE |
| `groupe_sanguin` | VARCHAR(5) | ENC | |
| `allergies` | TEXT | ENC | Allergies connues |
| `antecedents_medicaux` | TEXT | ENC | Antécédents médicaux |
| `mutuelle` | VARCHAR(100) | ENC | Nom de la mutuelle |
| `bourse_type` | ENUM | | `AUCUNE`, `NATIONALE`, `ETRANGERE`, `ETABLISSEMENT` |
| `bourse_montant` | DECIMAL(10,2) | | Montant de la bourse |
| `statut` | ENUM | NOT NULL DEFAULT 'ACTIF' | `ACTIF`, `TRANSFERE`, `DIPLOME`, `EXCLU`, `DECEDE` |
| `date_inscription` | DATE | NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `inscriptions`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL IDX | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `date_inscription` | DATE | NOT NULL | |
| `statut` | ENUM | NOT NULL DEFAULT 'CONFIRMEE' | `PROVISOIRE`, `CONFIRMEE`, `ANNULEE` |
| `documents_fournis` | JSONB | | Checklist des documents |
| `commentaire` | TEXT | | |
| `created_by` | UUID | FK users.id | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | | (eleve_id, annee_scolaire_id) | Un élève = une inscription/an |

---

### Table `responsables_legaux`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `lien` | ENUM | NOT NULL | `PERE`, `MERE`, `TUTEUR`, `AUTRE` |
| `nom_complet` | VARCHAR(200) | NOT NULL | |
| `telephone_principal` | VARCHAR(20) | NOT NULL ENC IDX | Pour WhatsApp notifications |
| `telephone_secondaire` | VARCHAR(20) | ENC | |
| `email` | VARCHAR(150) | ENC IDX | |
| `profession` | VARCHAR(100) | | |
| `adresse` | TEXT | ENC | |
| `est_contact_urgence` | BOOLEAN | NOT NULL DEFAULT false | |
| `est_autorise_retrait` | BOOLEAN | NOT NULL DEFAULT true | |
| `user_id` | UUID | FK users.id | Lien vers compte portail parents |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `enseignants`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `user_id` | UUID | FK users.id UNIQUE | Lien compte utilisateur |
| `matricule` | VARCHAR(30) | NOT NULL UNIQUE | Matricule national ou interne |
| `nom` | VARCHAR(100) | NOT NULL | |
| `prenom` | VARCHAR(100) | NOT NULL | |
| `date_naissance` | DATE | ENC | |
| `cnie` | VARCHAR(20) | UNIQUE ENC | |
| `telephone` | VARCHAR(20) | ENC | |
| `email_perso` | VARCHAR(150) | ENC | |
| `email_pro` | VARCHAR(150) | NOT NULL | Email institutionnel |
| `type_contrat` | ENUM | NOT NULL | `TITULAIRE`, `VACATAIRE`, `CONTRACTUEL`, `REMPLACANT` |
| `date_embauche` | DATE | NOT NULL | |
| `date_fin_contrat` | DATE | | Si contractuel/vacataire |
| `specialite_principale` | VARCHAR(100) | NOT NULL | Matière principale |
| `specialites_secondaires` | JSONB | | Array de matières |
| `diplomes` | JSONB | ENC | Titre, établissement, année |
| `heures_service_hebdo` | INTEGER | | Heures contractuelles/semaine |
| `statut` | ENUM | NOT NULL DEFAULT 'ACTIF' | `ACTIF`, `CONGE`, `DETACHE`, `RETRAITE`, `QUITTE` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `matieres`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `code` | VARCHAR(20) | NOT NULL | Ex: `MATH`, `FR`, `PHY` |
| `libelle` | VARCHAR(100) | NOT NULL | Libellé officiel |
| `libelle_arabe` | VARCHAR(100) | | |
| `coefficient_defaut` | DECIMAL(4,2) | NOT NULL DEFAULT 1.0 | Coefficient par défaut |
| `domaine` | ENUM | | `SCIENTIFIQUE`, `LITTERAIRE`, `LANGUES`, `TECHNOLOGIQUE`, `SPORT`, `ARTISTIQUE` |
| `est_obligatoire` | BOOLEAN | NOT NULL DEFAULT true | |

---

## Domaine 2 : Vie Scolaire

### Table `salles`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `nom` | VARCHAR(50) | NOT NULL | Ex: `Salle B203`, `Labo Chimie 1` |
| `batiment` | VARCHAR(50) | | |
| `etage` | INTEGER | | |
| `capacite` | INTEGER | NOT NULL | Nombre de places |
| `type` | ENUM | NOT NULL | `STANDARD`, `INFORMATIQUE`, `LABORATOIRE`, `SPORT`, `AMPHITHEATRE`, `BIBLIOTHEQUE` |
| `equipements` | JSONB | | Array: `["PROJECTEUR", "TABLEAU_INTERACTIF", "CLIMATISATION"]` |
| `accessible_pmr` | BOOLEAN | NOT NULL DEFAULT false | Accessibilité PMR |
| `actif` | BOOLEAN | NOT NULL DEFAULT true | |

---

### Table `creneaux`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `jour` | ENUM | NOT NULL | `LUNDI`, `MARDI`, `MERCREDI`, `JEUDI`, `VENDREDI`, `SAMEDI` |
| `heure_debut` | TIME | NOT NULL | |
| `heure_fin` | TIME | NOT NULL | |
| `ordre` | INTEGER | NOT NULL | Position dans la journée |
| `type` | ENUM | NOT NULL DEFAULT 'COURS' | `COURS`, `RECREATION`, `PAUSE_DEJEUNER` |

---

### Table `emplois_du_temps`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL IDX | |
| `matiere_id` | UUID | FK matieres.id NOT NULL | |
| `enseignant_id` | UUID | FK enseignants.id NOT NULL IDX | |
| `salle_id` | UUID | FK salles.id NOT NULL | |
| `creneau_id` | UUID | FK creneaux.id NOT NULL | |
| `date_debut_validite` | DATE | NOT NULL | Début de la période de validité |
| `date_fin_validite` | DATE | | Fin (NULL = jusqu'à la fin de l'année) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | | (enseignant_id, creneau_id, date_debut_validite) | Pas de double-booking enseignant |
| UNIQUE | | (salle_id, creneau_id, date_debut_validite) | Pas de double-booking salle |
| UNIQUE | | (classe_id, creneau_id, date_debut_validite) | Pas de double-booking classe |

---

### Table `absences`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `emploi_du_temps_id` | UUID | FK emplois_du_temps.id NOT NULL | |
| `date` | DATE | NOT NULL IDX | |
| `type` | ENUM | NOT NULL DEFAULT 'ABSENCE' | `ABSENCE`, `RETARD`, `EXCLUSION_COURS` |
| `minutes_retard` | INTEGER | | Si type = RETARD |
| `justifie` | BOOLEAN | NOT NULL DEFAULT false | |
| `motif` | TEXT | | |
| `document_url` | VARCHAR(500) | | Justificatif scannéé (S3) |
| `saisi_par` | UUID | FK users.id NOT NULL | |
| `methode_pointage` | ENUM | NOT NULL DEFAULT 'MANUEL' | `MANUEL`, `QR_CODE`, `BIOMETRIQUE` |
| `notification_envoyee` | BOOLEAN | NOT NULL DEFAULT false | WhatsApp envoyé ? |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

## Domaine 3 : Pédagogie / Notes

### Table `periodes_evaluation`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `libelle` | VARCHAR(50) | NOT NULL | Ex: `1er Trimestre`, `Semestre 1` |
| `type` | ENUM | NOT NULL | `TRIMESTRE`, `SEMESTRE` |
| `date_debut` | DATE | NOT NULL | |
| `date_fin` | DATE | NOT NULL | |
| `ordre` | INTEGER | NOT NULL | |
| `bulletins_publies` | BOOLEAN | NOT NULL DEFAULT false | |

---

### Table `devoirs`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL IDX | |
| `matiere_id` | UUID | FK matieres.id NOT NULL | |
| `enseignant_id` | UUID | FK enseignants.id NOT NULL | |
| `periode_id` | UUID | FK periodes_evaluation.id NOT NULL IDX | |
| `libelle` | VARCHAR(200) | NOT NULL | Ex: `Contrôle n°2 - Fonctions` |
| `type` | ENUM | NOT NULL | `DEVOIR_SURVEILLE`, `DEVOIR_MAISON`, `INTERROGATION`, `EXAMEN`, `PROJET`, `ORAL` |
| `date_evaluation` | DATE | NOT NULL IDX | |
| `bareme` | DECIMAL(5,2) | NOT NULL DEFAULT 20.0 | Note maximale |
| `coefficient` | DECIMAL(4,2) | NOT NULL DEFAULT 1.0 | Coefficient dans la période |
| `est_renseigne` | BOOLEAN | NOT NULL DEFAULT false | Toutes les notes saisies ? |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `notes`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `devoir_id` | UUID | FK devoirs.id NOT NULL IDX | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `note` | DECIMAL(5,2) | | NULL = absent ou non noté |
| `absent` | BOOLEAN | NOT NULL DEFAULT false | Absent lors de l'évaluation |
| `dispense` | BOOLEAN | NOT NULL DEFAULT false | Dispensé (sport, etc.) |
| `mention` | VARCHAR(200) | | Observation courte de l'enseignant |
| `saisie_par` | UUID | FK users.id NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | | (devoir_id, eleve_id) | Une note par élève par devoir |

---

### Table `moyennes_periodiques`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL | |
| `matiere_id` | UUID | FK matieres.id NOT NULL | |
| `periode_id` | UUID | FK periodes_evaluation.id NOT NULL IDX | |
| `moyenne` | DECIMAL(5,2) | NOT NULL | Moyenne calculée |
| `rang_classe` | INTEGER | | Rang dans la classe |
| `moyenne_classe` | DECIMAL(5,2) | | Moyenne de la classe (dénormalisée) |
| `appreciation_texte` | TEXT | | Appréciation (saisie ou générée IA) |
| `appreciation_ia` | BOOLEAN | NOT NULL DEFAULT false | Générée par IA ? |
| `appreciation_validee` | BOOLEAN | NOT NULL DEFAULT false | Validée par l'enseignant ? |
| `calculee_le` | TIMESTAMPTZ | NOT NULL | |
| UNIQUE | | (eleve_id, matiere_id, periode_id) | |

---

### Table `bulletins`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL | |
| `periode_id` | UUID | FK periodes_evaluation.id NOT NULL IDX | |
| `moyenne_generale` | DECIMAL(5,2) | NOT NULL | |
| `rang_general` | INTEGER | | |
| `mention` | ENUM | | `PASSABLE`, `ASSEZ_BIEN`, `BIEN`, `TRES_BIEN`, `EXCELLENT` |
| `appreciation_conseil` | TEXT | | Appréciation du conseil de classe |
| `decision` | ENUM | | `PASSAGE`, `REDOUBLEMENT`, `ORIENTATION`, `FELICITATIONS`, `ENCOURAGEMENTS`, `AVERTISSEMENT_TRAVAIL`, `AVERTISSEMENT_CONDUITE` |
| `pdf_url` | VARCHAR(500) | | URL du bulletin PDF (S3) |
| `publie` | BOOLEAN | NOT NULL DEFAULT false | Visible par les parents ? |
| `publie_le` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | | (eleve_id, periode_id) | Un bulletin par élève par période |

---

## Domaine 4 : Finance

### Table `familles_tarifs`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `libelle` | VARCHAR(100) | NOT NULL | Ex: `Cycle Lycée - Tarif Standard` |
| `description` | TEXT | | |

---

### Table `postes_facturation`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `famille_tarif_id` | UUID | FK familles_tarifs.id NOT NULL IDX | |
| `libelle` | VARCHAR(200) | NOT NULL | Ex: `Frais de scolarité T1`, `Cantine Octobre` |
| `type` | ENUM | NOT NULL | `SCOLARITE`, `INSCRIPTION`, `CANTINE`, `TRANSPORT`, `ACTIVITE`, `AUTRE` |
| `montant_ht` | DECIMAL(10,2) | NOT NULL | |
| `tva_taux` | DECIMAL(5,2) | NOT NULL DEFAULT 0.0 | Taux TVA en % |
| `montant_ttc` | DECIMAL(10,2) | GENERATED | Calculé automatiquement |
| `echeance` | DATE | NOT NULL | Date limite de paiement |
| `obligatoire` | BOOLEAN | NOT NULL DEFAULT true | |

---

### Table `factures`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `numero_facture` | VARCHAR(30) | NOT NULL UNIQUE | Ex: `2025-09-0001` (séquence/an) |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `date_emission` | DATE | NOT NULL | |
| `date_echeance` | DATE | NOT NULL IDX | |
| `montant_total` | DECIMAL(10,2) | NOT NULL | |
| `montant_regle` | DECIMAL(10,2) | NOT NULL DEFAULT 0.00 | |
| `montant_restant` | DECIMAL(10,2) | GENERATED | |
| `statut` | ENUM | NOT NULL DEFAULT 'EN_ATTENTE' IDX | `EN_ATTENTE`, `PARTIELLE`, `REGLEE`, `EN_RETARD`, `ANNULEE` |
| `pdf_url` | VARCHAR(500) | | |
| `notes_internes` | TEXT | | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `paiements`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `facture_id` | UUID | FK factures.id NOT NULL IDX | |
| `montant` | DECIMAL(10,2) | NOT NULL | |
| `date_paiement` | TIMESTAMPTZ | NOT NULL | |
| `mode` | ENUM | NOT NULL | `ESPECES`, `CHEQUE`, `VIREMENT`, `CMI_ONLINE`, `STRIPE`, `AUTRE` |
| `reference_externe` | VARCHAR(100) | | Référence transaction banque/CMI/Stripe |
| `statut` | ENUM | NOT NULL DEFAULT 'CONFIRME' | `EN_ATTENTE`, `CONFIRME`, `ECHEC`, `REMBOURSE` |
| `encaisse_par` | UUID | FK users.id | |
| `recu_url` | VARCHAR(500) | | URL du reçu PDF (S3) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

## Domaine 5 : LMS

### Table `cours`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `enseignant_id` | UUID | FK enseignants.id NOT NULL IDX | |
| `matiere_id` | UUID | FK matieres.id NOT NULL | |
| `annee_scolaire_id` | UUID | FK annees_scolaires.id NOT NULL IDX | |
| `titre` | VARCHAR(200) | NOT NULL | |
| `description` | TEXT | | |
| `niveau_id` | UUID | FK niveaux.id | |
| `est_public` | BOOLEAN | NOT NULL DEFAULT false | Partageable entre établissements |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `ressources`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `cours_id` | UUID | FK cours.id NOT NULL IDX | |
| `titre` | VARCHAR(200) | NOT NULL | |
| `type` | ENUM | NOT NULL | `DOCUMENT_PDF`, `VIDEO`, `AUDIO`, `LIEN_EXTERNE`, `IMAGE`, `EXERCICE_INTERACTIF` |
| `url` | VARCHAR(500) | NOT NULL | URL S3 ou externe |
| `taille_octets` | BIGINT | | |
| `duree_minutes` | INTEGER | | Pour vidéos/audio |
| `ordre` | INTEGER | NOT NULL DEFAULT 0 | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `devoirs_lms`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `cours_id` | UUID | FK cours.id NOT NULL IDX | |
| `titre` | VARCHAR(200) | NOT NULL | |
| `consignes` | TEXT | NOT NULL | |
| `date_limite` | TIMESTAMPTZ | NOT NULL IDX | |
| `note_maximale` | DECIMAL(5,2) | | Si noté |
| `type_rendu` | ENUM | NOT NULL | `FICHIER`, `TEXTE_EN_LIGNE`, `QCM`, `LIEN` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `rendus`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `devoir_lms_id` | UUID | FK devoirs_lms.id NOT NULL IDX | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `date_rendu` | TIMESTAMPTZ | NOT NULL | |
| `contenu_texte` | TEXT | | Si type TEXTE_EN_LIGNE |
| `fichier_url` | VARCHAR(500) | | Si type FICHIER (S3) |
| `en_retard` | BOOLEAN | NOT NULL DEFAULT false | |
| `note_obtenue` | DECIMAL(5,2) | | |
| `feedback_enseignant` | TEXT | | |
| `feedback_ia` | TEXT | | Analyse sémantique IA |
| `statut` | ENUM | NOT NULL DEFAULT 'RENDU' | `RENDU`, `CORRIGE`, `NOTE` |
| UNIQUE | | (devoir_lms_id, eleve_id) | Un rendu par élève |

---

## Domaine 6 : IA & Analytics

### Table `scores_decrochage`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `eleve_id` | UUID | FK eleves.id NOT NULL IDX | |
| `classe_id` | UUID | FK classes.id NOT NULL | |
| `score` | DECIMAL(5,2) | NOT NULL | Score 0-100 (100 = risque maximal) |
| `features_snapshot` | JSONB | | Valeurs des features au moment du calcul |
| `shap_values` | JSONB | | Explication SHAP par feature |
| `niveau_alerte` | ENUM | NOT NULL | `VERT`, `ORANGE`, `ROUGE` |
| `alerte_envoyee` | BOOLEAN | NOT NULL DEFAULT false | Conseiller notifié ? |
| `traite_par` | UUID | FK users.id | Conseiller ayant traité |
| `notes_conseiller` | TEXT | | |
| `calculee_le` | TIMESTAMPTZ | NOT NULL IDX | |
| `modele_version` | VARCHAR(50) | NOT NULL | Version du modèle ML utilisé |

---

### Table `interactions_chatbot`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK schools.id NOT NULL IDX | |
| `user_id` | UUID | FK users.id IDX | NULL si non authentifié |
| `session_id` | UUID | NOT NULL IDX | Regroupement de la conversation |
| `role` | ENUM | NOT NULL | `USER`, `ASSISTANT` |
| `message` | TEXT | NOT NULL | |
| `intent_detectee` | VARCHAR(100) | | Intent classifiée |
| `confiance` | DECIMAL(4,3) | | Score de confiance 0-1 |
| `sources_rag` | JSONB | | Documents sources utilisés |
| `escalade_humaine` | BOOLEAN | NOT NULL DEFAULT false | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() IDX | |

---

## Domaine 7 : Auth & Utilisateurs

### Table `users`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | Identique à l'ID Keycloak |
| `school_id` | UUID | FK schools.id IDX | NULL pour SUPER_ADMIN |
| `email` | VARCHAR(150) | NOT NULL UNIQUE IDX | |
| `role` | ENUM | NOT NULL IDX | `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, `STUDENT`, `PARENT`, `FINANCE_OFFICER`, `HR_OFFICER`, `COUNSELOR` |
| `actif` | BOOLEAN | NOT NULL DEFAULT true | |
| `derniere_connexion` | TIMESTAMPTZ | | |
| `preferences` | JSONB | | Langue, thème, notifications |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

---

### Table `audit_logs`
| Colonne | Type | Contrainte | Description |
|---------|------|-----------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | IDX | |
| `user_id` | UUID | FK users.id IDX | |
| `action` | VARCHAR(100) | NOT NULL IDX | Ex: `NOTE_MODIFIEE`, `BULLETIN_PUBLIE` |
| `entite_type` | VARCHAR(50) | NOT NULL | Ex: `notes`, `bulletins` |
| `entite_id` | UUID | NOT NULL | |
| `valeur_avant` | JSONB | | État avant modification |
| `valeur_apres` | JSONB | | État après modification |
| `ip_address` | INET | | |
| `user_agent` | TEXT | | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() IDX | Partitionné par mois |

---

## Index critiques recommandés

```sql
-- Performance des requêtes les plus fréquentes

-- Emploi du temps d'un élève
CREATE INDEX idx_inscriptions_eleve_annee ON inscriptions(eleve_id, annee_scolaire_id);
CREATE INDEX idx_edt_classe_creneau ON emplois_du_temps(classe_id, creneau_id, date_debut_validite);

-- Absences (requêtes temps réel)
CREATE INDEX idx_absences_eleve_date ON absences(eleve_id, date DESC);
CREATE INDEX idx_absences_justifie ON absences(justifie) WHERE justifie = false;

-- Notes et bulletins
CREATE INDEX idx_notes_devoir ON notes(devoir_id) INCLUDE (eleve_id, note);
CREATE INDEX idx_moyennes_eleve_periode ON moyennes_periodiques(eleve_id, periode_id);

-- Finance (relances)
CREATE INDEX idx_factures_statut_echeance ON factures(statut, date_echeance) WHERE statut IN ('EN_ATTENTE', 'EN_RETARD');

-- IA - Score décrochage le plus récent
CREATE INDEX idx_scores_decrochage_eleve_recent ON scores_decrochage(eleve_id, calculee_le DESC);
CREATE INDEX idx_scores_decrochage_alerte ON scores_decrochage(school_id, niveau_alerte) WHERE niveau_alerte IN ('ORANGE', 'ROUGE');
```

---

## Notes de conception

1. **UUIDs v7** : Ordonnés temporellement, meilleurs pour les index B-tree que les UUID v4 aléatoires.
2. **Soft Delete** : Préféré pour les entités clés (élèves, enseignants) — colonne `statut` ou `actif` plutôt que suppression physique.
3. **JSONB** : Utilisé pour les données semi-structurées configurables par établissement. Indexable avec GIN si nécessaire.
4. **Partitionnement PostgreSQL** : `absences`, `audit_logs`, `interactions_chatbot` → partitionnées par `RANGE(created_at)` par mois.
5. **Colonnes chiffrées** : Chiffrées via `pgcrypto` au niveau applicatif avant insertion, jamais via trigger DB (performance).
