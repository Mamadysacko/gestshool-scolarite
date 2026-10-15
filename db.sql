-- ============================================================
-- GESTION SCOLAIRE - SCHEMA NORMALISE ORIENTE SCOLARITE
-- MySQL 8.0.16+
-- ============================================================

DROP DATABASE IF EXISTS gestion_scolaire;
CREATE DATABASE ibk_school
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ibk_school;

-- ============================================================
-- 1. ECOLE
-- ============================================================
CREATE TABLE ecole (
    id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    nom VARCHAR(150) NOT NULL,
    code_ecole VARCHAR(50) NOT NULL UNIQUE,
    sigle VARCHAR(30),
    devise VARCHAR(10) NOT NULL DEFAULT 'GNF',
    logo VARCHAR(255),
    email VARCHAR(150),
    telephone VARCHAR(30),
    adresse VARCHAR(255),
    quartier VARCHAR(100),
    CONSTRAINT chk_ecole_unique CHECK (id = 1)
) ENGINE=InnoDB;

-- ============================================================
-- 2. ADMIN
-- ============================================================
CREATE TABLE admin (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    tel VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    utilisateur VARCHAR(100) NOT NULL UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 3. ANNEE SCOLAIRE
-- ============================================================
CREATE TABLE annee_scolaire (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    annee VARCHAR(20) NOT NULL UNIQUE,
    date_debut DATE,
    date_fin DATE,
    statut ENUM('preparation','ouverte','cloturee')
        NOT NULL DEFAULT 'preparation',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_annee_dates
        CHECK (date_debut IS NULL OR date_fin IS NULL
               OR date_fin >= date_debut),
    KEY idx_annee_statut (statut)
) ENGINE=InnoDB;

-- ============================================================
-- 4. CATEGORIE
-- ============================================================
CREATE TABLE categorie (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO categorie (nom) VALUES
('Primaire'), ('Collège'), ('Lycée');

-- ============================================================
-- 5. CLASSE
-- ============================================================
CREATE TABLE classe (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_annee INT UNSIGNED NOT NULL,
    id_categorie TINYINT UNSIGNED NOT NULL,
    nom VARCHAR(50) NOT NULL,
    capacite SMALLINT UNSIGNED,
    UNIQUE KEY uk_classe_annee_nom (id_annee, nom),
    UNIQUE KEY uk_classe_contexte (id, id_annee),
    CONSTRAINT fk_classe_annee
        FOREIGN KEY (id_annee)
        REFERENCES annee_scolaire(id) ON DELETE RESTRICT,
    CONSTRAINT fk_classe_categorie
        FOREIGN KEY (id_categorie)
        REFERENCES categorie(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 6. ELEVE
-- ============================================================
CREATE TABLE eleve (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    matricule VARCHAR(50) NOT NULL UNIQUE,
    prenom VARCHAR(100) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    sexe ENUM('M','F') NOT NULL,
    date_naissance DATE,
    lieu_naissance VARCHAR(150),
    photo VARCHAR(255),
    nom_parent VARCHAR(150),
    telephone_parent VARCHAR(30),
    adresse VARCHAR(255),
    actif TINYINT(1) NOT NULL DEFAULT 1,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_eleve_id_matricule (id, matricule)
) ENGINE=InnoDB;

-- ============================================================
-- 7. INSCRIPTION  (couvre inscription + réinscription)
--    type_inscription : nouvelle / reinscription
-- ============================================================
CREATE TABLE inscription_eleve (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_eleve INT UNSIGNED NOT NULL,
    id_annee INT UNSIGNED NOT NULL,
    id_classe INT UNSIGNED NOT NULL,
    type_inscription ENUM('nouvelle','reinscription')
        NOT NULL DEFAULT 'nouvelle',
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statut ENUM('inscrit','transfere','termine','abandon')
        NOT NULL DEFAULT 'inscrit',

    UNIQUE KEY uk_eleve_annee (id_eleve, id_annee),
    UNIQUE KEY uk_inscription_contexte (id, id_eleve),
    UNIQUE KEY uk_inscription_classe_annee (id, id_classe, id_annee),
    UNIQUE KEY uk_inscription_classe (id, id_classe),

    CONSTRAINT fk_inscription_eleve
        FOREIGN KEY (id_eleve) REFERENCES eleve(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_inscription_annee
        FOREIGN KEY (id_annee) REFERENCES annee_scolaire(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_inscription_classe
        FOREIGN KEY (id_classe, id_annee)
        REFERENCES classe(id, id_annee) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 8. PASSAGE CLASSE (réinscription / décision annuelle)
-- ============================================================
CREATE TABLE passage_classe (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_eleve INT UNSIGNED NOT NULL,
    id_inscription_precedente BIGINT UNSIGNED NOT NULL,
    id_inscription_suivante BIGINT UNSIGNED NOT NULL,
    decision ENUM('admis','redoublement','orientation','transfert')
        NOT NULL,
    date_decision DATE,
    commentaire VARCHAR(255),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_passage_source (id_inscription_precedente),
    UNIQUE KEY uk_passage_destination (id_inscription_suivante),
    CONSTRAINT chk_passage_diff
        CHECK (id_inscription_precedente <> id_inscription_suivante),

    CONSTRAINT fk_passage_source
        FOREIGN KEY (id_inscription_precedente, id_eleve)
        REFERENCES inscription_eleve(id, id_eleve) ON DELETE RESTRICT,
    CONSTRAINT fk_passage_destination
        FOREIGN KEY (id_inscription_suivante, id_eleve)
        REFERENCES inscription_eleve(id, id_eleve) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 9. TARIF CLASSE ANNEE
--    Un enregistrement par (classe, année) = tarif annuel global
-- ============================================================
CREATE TABLE tarif_classe_annee (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_classe INT UNSIGNED NOT NULL,
    id_annee INT UNSIGNED NOT NULL,
    montant_annuel DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    devise VARCHAR(10) NOT NULL DEFAULT 'GNF',
    actif TINYINT(1) NOT NULL DEFAULT 1,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_tarif_classe_annee (id_classe, id_annee),
    UNIQUE KEY uk_tarif_contexte (id, id_classe, id_annee),

    CONSTRAINT chk_tarif_montant CHECK (montant_annuel >= 0),

    CONSTRAINT fk_tarif_classe
        FOREIGN KEY (id_classe, id_annee)
        REFERENCES classe(id, id_annee) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 10. TRANCHE TARIF
--     3 tranches par tarif (num_tranche 1..3)
--     peut aussi porter des frais annexes (inscription, etc.)
-- ============================================================
CREATE TABLE tranche_tarif (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_tarif INT UNSIGNED NOT NULL,
    num_tranche TINYINT UNSIGNED NOT NULL,   -- 1, 2, 3
    libelle VARCHAR(100) NOT NULL,           -- 1ère tranche, ...
    montant DECIMAL(12,2) NOT NULL,
    date_limite DATE,
    ordre TINYINT UNSIGNED NOT NULL DEFAULT 1,

    UNIQUE KEY uk_tranche_num (id_tarif, num_tranche),
    UNIQUE KEY uk_tranche_contexte (id, id_tarif),

    CONSTRAINT chk_tranche_num CHECK (num_tranche BETWEEN 1 AND 3),
    CONSTRAINT chk_tranche_montant CHECK (montant >= 0),

    CONSTRAINT fk_tranche_tarif
        FOREIGN KEY (id_tarif)
        REFERENCES tarif_classe_annee(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 11. ECHEANCE ELEVE
--     Générée à l'inscription : 1 ligne par tranche de la classe
-- ============================================================
CREATE TABLE echeance_eleve (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_inscription BIGINT UNSIGNED NOT NULL,
    id_tranche INT UNSIGNED NOT NULL,
    montant_du DECIMAL(12,2) NOT NULL,
    montant_paye DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    remise DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    date_limite DATE,
    statut ENUM('impayee','partielle','payee','en_retard','annulee')
        NOT NULL DEFAULT 'impayee',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_echeance_inscription_tranche (id_inscription, id_tranche),
    KEY idx_echeance_statut (statut),
    KEY idx_echeance_limite (date_limite),

    CONSTRAINT chk_echeance_montant CHECK (montant_du >= 0),
    CONSTRAINT chk_echeance_paye CHECK (montant_paye >= 0),
    CONSTRAINT chk_echeance_remise CHECK (remise >= 0),

    CONSTRAINT fk_echeance_inscription
        FOREIGN KEY (id_inscription)
        REFERENCES inscription_eleve(id) ON DELETE CASCADE,
    CONSTRAINT fk_echeance_tranche
        FOREIGN KEY (id_tranche)
        REFERENCES tranche_tarif(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 12. PAIEMENT
--     Plusieurs paiements possibles pour une même échéance (tranche)
-- ============================================================
CREATE TABLE paiement (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_echeance BIGINT UNSIGNED NOT NULL,
    id_inscription BIGINT UNSIGNED NOT NULL,   -- dénormalisé pour requêtes rapides
    montant DECIMAL(12,2) NOT NULL,
    mode_paiement ENUM('espece','virement','cheque','mobile_money','carte','autre')
        NOT NULL DEFAULT 'espece',
    reference VARCHAR(100),                    -- n° reçu, transaction...
    date_paiement DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_admin INT UNSIGNED,                     -- caissier / opérateur
    observation VARCHAR(255),
    annule TINYINT(1) NOT NULL DEFAULT 0,      -- soft delete / annulation
    date_annulation DATETIME NULL,
    motif_annulation VARCHAR(255),

    KEY idx_paiement_echeance (id_echeance),
    KEY idx_paiement_inscription (id_inscription),
    KEY idx_paiement_date (date_paiement),

    CONSTRAINT chk_paiement_montant CHECK (montant > 0),

    CONSTRAINT fk_paiement_echeance
        FOREIGN KEY (id_echeance)
        REFERENCES echeance_eleve(id) ON DELETE RESTRICT,
    CONSTRAINT fk_paiement_inscription
        FOREIGN KEY (id_inscription)
        REFERENCES inscription_eleve(id) ON DELETE RESTRICT,
    CONSTRAINT fk_paiement_admin
        FOREIGN KEY (id_admin)
        REFERENCES admin(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 13. FRAIS ANNEXES (optionnel mais utile)
--     ex : frais d'inscription, tenue, cantine, transport...
-- ============================================================
CREATE TABLE frais_annexe (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_annee INT UNSIGNED NOT NULL,
    id_categorie TINYINT UNSIGNED NULL,       -- NULL = toutes catégories
    libelle VARCHAR(150) NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    obligatoire TINYINT(1) NOT NULL DEFAULT 0,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_frais_montant CHECK (montant >= 0),

    CONSTRAINT fk_frais_annee
        FOREIGN KEY (id_annee) REFERENCES annee_scolaire(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_frais_categorie
        FOREIGN KEY (id_categorie) REFERENCES categorie(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 14. PAIEMENT FRAIS ANNEXE
-- ============================================================
CREATE TABLE paiement_frais_annexe (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_inscription BIGINT UNSIGNED NOT NULL,
    id_frais INT UNSIGNED NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    mode_paiement ENUM('espece','virement','cheque','mobile_money','carte','autre')
        NOT NULL DEFAULT 'espece',
    reference VARCHAR(100),
    date_paiement DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_admin INT UNSIGNED,

    KEY idx_pfa_inscription (id_inscription),

    CONSTRAINT chk_pfa_montant CHECK (montant > 0),

    CONSTRAINT fk_pfa_inscription
        FOREIGN KEY (id_inscription)
        REFERENCES inscription_eleve(id) ON DELETE CASCADE,
    CONSTRAINT fk_pfa_frais
        FOREIGN KEY (id_frais)
        REFERENCES frais_annexe(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pfa_admin
        FOREIGN KEY (id_admin)
        REFERENCES admin(id) ON DELETE SET NULL
) ENGINE=InnoDB;