-- =============================================================================
--  BAQALA - Gestion intelligente de boutique alimentaire
--  schema.sql - MySQL 8.0+ (InnoDB, utf8mb4)
--
--  Contenu :
--    1. Base de données et paramètres de session
--    2. Référentiels (langues, rôles, utilisateurs, paramètres, séquences)
--    3. Catalogue (catégories, unités, taxes, fournisseurs, produits, lots)
--    4. Stock (mouvements, achats fournisseurs)
--    5. Clients et crédit client
--    6. Caisse (caisses, sessions, ventes, lignes, taxes, paiements)
--    7. Trésorerie (catégories et mouvements de cash)
--    8. Smart Agent (alertes, promotions, associations produits)
--    9. Journal d'audit
--   10. Vues de reporting
--   11. Procédures stockées (stock, POS, caisse, comptabilité, Smart Agent)
--   12. Triggers d'audit
--   13. Données initiales
--
--  Exécution :  mysql -u root -p < schema.sql
--  Compte par défaut : admin / Admin@123  (à changer dès la première connexion)
--
--  Conventions :
--    * Montants  : DECIMAL(14,2)   * Quantités : DECIMAL(12,3) (produits au poids)
--    * Taux      : DECIMAL(7,3)    * Dates     : DATETIME en heure locale du magasin
--    * L'application renseigne @app_user_id sur chaque connexion pour l'audit.
-- =============================================================================

DROP DATABASE IF EXISTS baqala;
CREATE DATABASE baqala CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baqala;

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 1;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =============================================================================
-- 2. RÉFÉRENTIELS
-- =============================================================================

CREATE TABLE languages (
    code          CHAR(2)      NOT NULL,
    name          VARCHAR(50)  NOT NULL,
    native_name   VARCHAR(50)  NOT NULL,
    direction     ENUM('ltr','rtl') NOT NULL DEFAULT 'ltr',
    is_default    TINYINT(1)   NOT NULL DEFAULT 0,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order    SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE roles (
    id            TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(30)  NOT NULL,
    name          VARCHAR(60)  NOT NULL,
    permissions   JSON         NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE users (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_id             TINYINT UNSIGNED NOT NULL,
    username            VARCHAR(50)  NOT NULL,
    full_name           VARCHAR(120) NOT NULL,
    email               VARCHAR(150) NULL,
    phone               VARCHAR(30)  NULL,
    password_hash       VARCHAR(255) NOT NULL,
    pin_code_hash       VARCHAR(255) NULL COMMENT 'PIN rapide pour la caisse',
    modules             JSON         NULL COMMENT 'Modules autorisés (NULL = tous ceux du rôle)',
    preferred_language  CHAR(2)      NOT NULL DEFAULT 'en',
    must_change_password TINYINT(1)  NOT NULL DEFAULT 0,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    last_login_at       DATETIME     NULL,
    deleted_at          DATETIME     NULL COMMENT 'Utilisateur supprimé (conservé pour l''historique des ventes)',
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    KEY ix_users_role (role_id),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_users_language FOREIGN KEY (preferred_language) REFERENCES languages (code)
) ENGINE=InnoDB;

CREATE TABLE settings (
    setting_key   VARCHAR(80)  NOT NULL,
    setting_value VARCHAR(500) NOT NULL,
    value_type    ENUM('string','int','decimal','bool','json') NOT NULL DEFAULT 'string',
    description   VARCHAR(255) NULL,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- Numérotation continue des documents (tickets, achats...) sans trou.
CREATE TABLE document_sequences (
    doc_type      VARCHAR(30)  NOT NULL,
    prefix        VARCHAR(10)  NOT NULL,
    next_value    BIGINT UNSIGNED NOT NULL DEFAULT 1,
    padding       TINYINT UNSIGNED NOT NULL DEFAULT 6,
    reset_yearly  TINYINT(1)   NOT NULL DEFAULT 1,
    current_year  SMALLINT     NOT NULL,
    PRIMARY KEY (doc_type)
) ENGINE=InnoDB;

-- =============================================================================
-- 3. CATALOGUE
-- =============================================================================

CREATE TABLE categories (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    parent_id     INT UNSIGNED NULL,
    code          VARCHAR(40)  NOT NULL,
    name          VARCHAR(120) NOT NULL COMMENT 'Nom par défaut (en)',
    sort_order    SMALLINT     NOT NULL DEFAULT 0,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_code (code),
    KEY ix_categories_parent (parent_id),
    CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE category_translations (
    category_id   INT UNSIGNED NOT NULL,
    language_code CHAR(2)      NOT NULL,
    name          VARCHAR(120) NOT NULL,
    PRIMARY KEY (category_id, language_code),
    CONSTRAINT fk_cattr_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
    CONSTRAINT fk_cattr_language FOREIGN KEY (language_code) REFERENCES languages (code)
) ENGINE=InnoDB;

CREATE TABLE units (
    id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(10)  NOT NULL,
    name          VARCHAR(40)  NOT NULL,
    allows_decimal TINYINT(1)  NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_units_code (code)
) ENGINE=InnoDB;

CREATE TABLE taxes (
    id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(30)  NOT NULL,
    name          VARCHAR(80)  NOT NULL,
    tax_type      ENUM('PERCENT','FIXED') NOT NULL DEFAULT 'PERCENT'
                  COMMENT 'PERCENT = % du montant HT, FIXED = montant par unité vendue',
    rate          DECIMAL(10,3) NOT NULL DEFAULT 0,
    applies_to    ENUM('SALES','PURCHASES','BOTH') NOT NULL DEFAULT 'BOTH',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_taxes_code (code),
    CONSTRAINT ck_taxes_rate CHECK (rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE tax_translations (
    tax_id        SMALLINT UNSIGNED NOT NULL,
    language_code CHAR(2)      NOT NULL,
    name          VARCHAR(80)  NOT NULL,
    PRIMARY KEY (tax_id, language_code),
    CONSTRAINT fk_taxtr_tax FOREIGN KEY (tax_id) REFERENCES taxes (id) ON DELETE CASCADE,
    CONSTRAINT fk_taxtr_language FOREIGN KEY (language_code) REFERENCES languages (code)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(150) NOT NULL,
    contact_name  VARCHAR(120) NULL,
    phone         VARCHAR(30)  NULL,
    email         VARCHAR(150) NULL,
    address       VARCHAR(255) NULL,
    tax_number    VARCHAR(50)  NULL,
    lead_time_days SMALLINT UNSIGNED NOT NULL DEFAULT 3 COMMENT 'Délai de livraison moyen',
    balance       DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Montant dû au fournisseur',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_suppliers_name (name)
) ENGINE=InnoDB;

CREATE TABLE products (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sku                 VARCHAR(50)  NOT NULL,
    barcode             VARCHAR(64)  NULL,
    name                VARCHAR(150) NOT NULL COMMENT 'Nom par défaut (en)',
    category_id         INT UNSIGNED NULL,
    unit_id             SMALLINT UNSIGNED NOT NULL,
    default_supplier_id INT UNSIGNED NULL,
    purchase_price      DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Dernier prix d''achat HT',
    avg_cost            DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Coût moyen pondéré',
    sale_price          DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Prix de vente (TTC ou HT selon prices_include_tax)',
    stock_qty           DECIMAL(12,3) NOT NULL DEFAULT 0,
    min_stock           DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'Seuil d''alerte critique',
    reorder_qty         DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'Quantité de réassort par défaut',
    track_expiry        TINYINT(1)   NOT NULL DEFAULT 0,
    shelf_life_days     SMALLINT UNSIGNED NULL,
    is_weighed          TINYINT(1)   NOT NULL DEFAULT 0,
    is_active           TINYINT(1)   NOT NULL DEFAULT 1,
    image_url           VARCHAR(255) NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME     NULL COMMENT 'Suppression logique',
    PRIMARY KEY (id),
    UNIQUE KEY uq_products_sku (sku),
    UNIQUE KEY uq_products_barcode (barcode),
    KEY ix_products_category (category_id),
    KEY ix_products_supplier (default_supplier_id),
    KEY ix_products_low_stock (is_active, stock_qty, min_stock),
    FULLTEXT KEY ft_products_name (name),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
    CONSTRAINT fk_products_unit FOREIGN KEY (unit_id) REFERENCES units (id),
    CONSTRAINT fk_products_supplier FOREIGN KEY (default_supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
    CONSTRAINT ck_products_prices CHECK (purchase_price >= 0 AND sale_price >= 0 AND min_stock >= 0)
) ENGINE=InnoDB;

CREATE TABLE product_translations (
    product_id    INT UNSIGNED NOT NULL,
    language_code CHAR(2)      NOT NULL,
    name          VARCHAR(150) NOT NULL,
    PRIMARY KEY (product_id, language_code),
    FULLTEXT KEY ft_prodtr_name (name),
    CONSTRAINT fk_prodtr_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_prodtr_language FOREIGN KEY (language_code) REFERENCES languages (code)
) ENGINE=InnoDB;

-- Un produit peut porter plusieurs taxes (ex. TVA + accise).
CREATE TABLE product_taxes (
    product_id    INT UNSIGNED NOT NULL,
    tax_id        SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (product_id, tax_id),
    KEY ix_prodtax_tax (tax_id),
    CONSTRAINT fk_prodtax_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_prodtax_tax FOREIGN KEY (tax_id) REFERENCES taxes (id)
) ENGINE=InnoDB;

-- Lots : chaque entrée en stock crée un lot ; la date de péremption vit ici.
-- La somme des qty_remaining d'un produit = products.stock_qty (hors stock négatif).
CREATE TABLE product_batches (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id    INT UNSIGNED NOT NULL,
    batch_no      VARCHAR(50)  NULL,
    expiry_date   DATE         NULL,
    unit_cost     DECIMAL(14,4) NOT NULL DEFAULT 0,
    qty_received  DECIMAL(12,3) NOT NULL,
    qty_remaining DECIMAL(12,3) NOT NULL,
    received_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_batches_fefo (product_id, qty_remaining, expiry_date),
    KEY ix_batches_expiry (expiry_date, qty_remaining),
    CONSTRAINT fk_batches_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT ck_batches_qty CHECK (qty_remaining >= 0)
) ENGINE=InnoDB;

-- =============================================================================
-- 4. STOCK & ACHATS
-- =============================================================================

CREATE TABLE stock_movements (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id    INT UNSIGNED NOT NULL,
    batch_id      BIGINT UNSIGNED NULL,
    movement_type ENUM('PURCHASE','SALE','SALE_RETURN','WASTE','ADJUSTMENT_IN','ADJUSTMENT_OUT',
                       'SUPPLIER_RETURN','OPENING') NOT NULL,
    quantity      DECIMAL(12,3) NOT NULL COMMENT 'Signée : + entrée, - sortie',
    unit_cost     DECIMAL(14,4) NOT NULL DEFAULT 0,
    balance_after DECIMAL(12,3) NOT NULL COMMENT 'Stock du produit après le mouvement',
    reference_type VARCHAR(30)  NULL COMMENT 'sale, purchase, adjustment...',
    reference_id  BIGINT UNSIGNED NULL,
    reason        VARCHAR(255) NULL,
    user_id       INT UNSIGNED NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_stockmv_product_date (product_id, created_at),
    KEY ix_stockmv_type_date (movement_type, created_at),
    KEY ix_stockmv_reference (reference_type, reference_id),
    KEY ix_stockmv_batch (batch_id),
    CONSTRAINT fk_stockmv_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_stockmv_batch FOREIGN KEY (batch_id) REFERENCES product_batches (id),
    CONSTRAINT fk_stockmv_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE purchases (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    purchase_no     VARCHAR(30)  NOT NULL,
    supplier_id     INT UNSIGNED NOT NULL,
    supplier_invoice_no VARCHAR(60) NULL,
    status          ENUM('DRAFT','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
    payment_status  ENUM('UNPAID','PARTIAL','PAID') NOT NULL DEFAULT 'UNPAID',
    subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'HT',
    tax_total       DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Taxe payée (déductible)',
    total           DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes           VARCHAR(500) NULL,
    ordered_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_at     DATETIME     NULL,
    user_id         INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_purchases_no (purchase_no),
    KEY ix_purchases_supplier (supplier_id, ordered_at),
    KEY ix_purchases_status_date (status, received_at),
    CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id),
    CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE purchase_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    purchase_id   BIGINT UNSIGNED NOT NULL,
    product_id    INT UNSIGNED NOT NULL,
    batch_id      BIGINT UNSIGNED NULL COMMENT 'Lot créé à la réception',
    batch_no      VARCHAR(50)  NULL,
    expiry_date   DATE         NULL,
    quantity      DECIMAL(12,3) NOT NULL,
    unit_cost     DECIMAL(14,4) NOT NULL COMMENT 'HT',
    net_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    line_total    DECIMAL(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_puritems_purchase (purchase_id),
    KEY ix_puritems_product (product_id),
    CONSTRAINT fk_puritems_purchase FOREIGN KEY (purchase_id) REFERENCES purchases (id) ON DELETE CASCADE,
    CONSTRAINT fk_puritems_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_puritems_batch FOREIGN KEY (batch_id) REFERENCES product_batches (id),
    CONSTRAINT ck_puritems_qty CHECK (quantity > 0 AND unit_cost >= 0)
) ENGINE=InnoDB;

-- Taxe payée sur achats, figée par ligne (traçabilité TVA déductible).
CREATE TABLE purchase_item_taxes (
    purchase_item_id BIGINT UNSIGNED NOT NULL,
    tax_id        SMALLINT UNSIGNED NOT NULL,
    tax_type      ENUM('PERCENT','FIXED') NOT NULL,
    rate          DECIMAL(10,3) NOT NULL,
    taxable_amount DECIMAL(14,2) NOT NULL,
    tax_amount    DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (purchase_item_id, tax_id),
    KEY ix_puritax_tax (tax_id),
    CONSTRAINT fk_puritax_item FOREIGN KEY (purchase_item_id) REFERENCES purchase_items (id) ON DELETE CASCADE,
    CONSTRAINT fk_puritax_tax FOREIGN KEY (tax_id) REFERENCES taxes (id)
) ENGINE=InnoDB;

-- =============================================================================
-- 5. CLIENTS & CRÉDIT
-- =============================================================================

CREATE TABLE customers (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(30)  NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(30)  NULL,
    email         VARCHAR(150) NULL,
    address       VARCHAR(255) NULL,
    credit_limit  DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '0 = crédit interdit',
    balance       DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Dette en cours du client',
    loyalty_points INT UNSIGNED NOT NULL DEFAULT 0,
    is_walk_in    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Client comptoir anonyme',
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_code (code),
    KEY ix_customers_phone (phone),
    KEY ix_customers_name (full_name)
) ENGINE=InnoDB;

CREATE TABLE customer_ledger (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id   INT UNSIGNED NOT NULL,
    entry_type    ENUM('CREDIT_SALE','REPAYMENT','SALE_VOID','ADJUSTMENT') NOT NULL,
    amount        DECIMAL(14,2) NOT NULL COMMENT '+ augmente la dette, - la réduit',
    balance_after DECIMAL(14,2) NOT NULL,
    sale_id       BIGINT UNSIGNED NULL,
    payment_method ENUM('CASH','CARD','MOBILE','BANK') NULL,
    notes         VARCHAR(255) NULL,
    user_id       INT UNSIGNED NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_custledger_customer (customer_id, created_at),
    CONSTRAINT fk_custledger_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
    CONSTRAINT fk_custledger_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

-- =============================================================================
-- 6. CAISSE & VENTES
-- =============================================================================

CREATE TABLE cash_registers (
    id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(20)  NOT NULL,
    name          VARCHAR(60)  NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_registers_code (code)
) ENGINE=InnoDB;

CREATE TABLE cash_sessions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    register_id     SMALLINT UNSIGNED NOT NULL,
    opened_by       INT UNSIGNED NOT NULL,
    closed_by       INT UNSIGNED NULL,
    status          ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
    opening_float   DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Fond de caisse',
    expected_cash   DECIMAL(14,2) NULL,
    counted_cash    DECIMAL(14,2) NULL,
    difference      DECIMAL(14,2) NULL COMMENT 'compté - attendu (écart)',
    notes           VARCHAR(500) NULL,
    opened_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at       DATETIME     NULL,
    -- Garantit une seule session ouverte par caisse.
    open_register_guard SMALLINT UNSIGNED AS (IF(status = 'OPEN', register_id, NULL)) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_one_open (open_register_guard),
    KEY ix_sessions_register_date (register_id, opened_at),
    CONSTRAINT fk_sessions_register FOREIGN KEY (register_id) REFERENCES cash_registers (id),
    CONSTRAINT fk_sessions_opened_by FOREIGN KEY (opened_by) REFERENCES users (id),
    CONSTRAINT fk_sessions_closed_by FOREIGN KEY (closed_by) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE sales (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    receipt_no      VARCHAR(30)  NOT NULL,
    session_id      BIGINT UNSIGNED NOT NULL,
    customer_id     INT UNSIGNED NULL,
    user_id         INT UNSIGNED NOT NULL,
    status          ENUM('COMPLETED','VOIDED') NOT NULL DEFAULT 'COMPLETED',
    subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Total HT après remises',
    discount_total  DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_total       DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Taxe collectée',
    total           DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'TTC à payer',
    cost_total      DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Coût des marchandises vendues',
    paid_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
    change_due      DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Rendu monnaie',
    language_code   CHAR(2)      NOT NULL DEFAULT 'en' COMMENT 'Langue du ticket',
    notes           VARCHAR(255) NULL,
    voided_by       INT UNSIGNED NULL,
    voided_at       DATETIME     NULL,
    void_reason     VARCHAR(255) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sales_receipt (receipt_no),
    KEY ix_sales_date_status (created_at, status),
    KEY ix_sales_session (session_id),
    KEY ix_sales_customer (customer_id, created_at),
    KEY ix_sales_user_date (user_id, created_at),
    CONSTRAINT fk_sales_session FOREIGN KEY (session_id) REFERENCES cash_sessions (id),
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
    CONSTRAINT fk_sales_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_sales_voided_by FOREIGN KEY (voided_by) REFERENCES users (id),
    CONSTRAINT fk_sales_language FOREIGN KEY (language_code) REFERENCES languages (code)
) ENGINE=InnoDB;

ALTER TABLE customer_ledger
    ADD CONSTRAINT fk_custledger_sale FOREIGN KEY (sale_id) REFERENCES sales (id);

CREATE TABLE sale_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id       BIGINT UNSIGNED NOT NULL,
    product_id    INT UNSIGNED NOT NULL,
    product_name  VARCHAR(150) NOT NULL COMMENT 'Nom figé au moment de la vente',
    quantity      DECIMAL(12,3) NOT NULL,
    unit_price    DECIMAL(14,2) NOT NULL COMMENT 'Prix catalogue appliqué',
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    gross_amount  DECIMAL(14,2) NOT NULL COMMENT 'qty x prix - remise',
    net_amount    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Base HT',
    tax_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
    line_total    DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'TTC',
    unit_cost     DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Coût FEFO réel',
    promotion_id  INT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY ix_saleitems_sale (sale_id),
    KEY ix_saleitems_product (product_id),
    CONSTRAINT fk_saleitems_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
    CONSTRAINT fk_saleitems_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT ck_saleitems_qty CHECK (quantity > 0 AND discount_amount >= 0)
) ENGINE=InnoDB;

-- Taxe collectée, figée par ligne et par taxe.
CREATE TABLE sale_item_taxes (
    sale_item_id  BIGINT UNSIGNED NOT NULL,
    tax_id        SMALLINT UNSIGNED NOT NULL,
    tax_type      ENUM('PERCENT','FIXED') NOT NULL,
    rate          DECIMAL(10,3) NOT NULL,
    taxable_amount DECIMAL(14,2) NOT NULL,
    tax_amount    DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (sale_item_id, tax_id),
    KEY ix_saletax_tax (tax_id),
    CONSTRAINT fk_saletax_item FOREIGN KEY (sale_item_id) REFERENCES sale_items (id) ON DELETE CASCADE,
    CONSTRAINT fk_saletax_tax FOREIGN KEY (tax_id) REFERENCES taxes (id)
) ENGINE=InnoDB;

-- Paiements multiples par vente (paiement fractionné).
CREATE TABLE sale_payments (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id       BIGINT UNSIGNED NOT NULL,
    method        ENUM('CASH','CARD','MOBILE','CREDIT') NOT NULL,
    amount        DECIMAL(14,2) NOT NULL COMMENT 'Montant remis (espèces : avant rendu)',
    reference     VARCHAR(80)  NULL COMMENT 'N° autorisation carte, etc.',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_salepay_sale (sale_id),
    KEY ix_salepay_method_date (method, created_at),
    CONSTRAINT fk_salepay_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
    CONSTRAINT ck_salepay_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- =============================================================================
-- 7. TRÉSORERIE (CASH-FLOW)
-- =============================================================================

CREATE TABLE cash_categories (
    id            SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code          VARCHAR(30)  NOT NULL,
    name          VARCHAR(80)  NOT NULL,
    direction     ENUM('IN','OUT','BOTH') NOT NULL,
    is_operating_expense TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Compte dans la marge nette',
    is_system     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Géré automatiquement, non supprimable',
    PRIMARY KEY (id),
    UNIQUE KEY uq_cashcat_code (code)
) ENGINE=InnoDB;

CREATE TABLE cash_movements (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id      BIGINT UNSIGNED NULL COMMENT 'NULL = hors tiroir-caisse (banque)',
    category_id     SMALLINT UNSIGNED NOT NULL,
    direction       ENUM('IN','OUT') NOT NULL,
    payment_method  ENUM('CASH','CARD','MOBILE','BANK') NOT NULL DEFAULT 'CASH',
    amount          DECIMAL(14,2) NOT NULL COMMENT 'Montant TTC',
    tax_id          SMALLINT UNSIGNED NULL COMMENT 'Taxe déductible sur dépense',
    tax_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
    reference_type  VARCHAR(30)  NULL,
    reference_id    BIGINT UNSIGNED NULL,
    description     VARCHAR(255) NULL,
    user_id         INT UNSIGNED NULL,
    occurred_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_cashmv_session (session_id, payment_method),
    KEY ix_cashmv_date_cat (occurred_at, category_id),
    KEY ix_cashmv_reference (reference_type, reference_id),
    CONSTRAINT fk_cashmv_session FOREIGN KEY (session_id) REFERENCES cash_sessions (id),
    CONSTRAINT fk_cashmv_category FOREIGN KEY (category_id) REFERENCES cash_categories (id),
    CONSTRAINT fk_cashmv_tax FOREIGN KEY (tax_id) REFERENCES taxes (id),
    CONSTRAINT fk_cashmv_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_cashmv_amount CHECK (amount > 0 AND tax_amount >= 0 AND tax_amount <= amount)
) ENGINE=InnoDB;

-- =============================================================================
-- 8. SMART AGENT
-- =============================================================================

CREATE TABLE promotions (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id    INT UNSIGNED NOT NULL,
    discount_type ENUM('PERCENT','FIXED') NOT NULL DEFAULT 'PERCENT',
    discount_value DECIMAL(10,2) NOT NULL,
    reason        ENUM('MANUAL','NEAR_EXPIRY','SLOW_MOVING','CROSS_SELL') NOT NULL DEFAULT 'MANUAL',
    starts_at     DATETIME     NOT NULL,
    ends_at       DATETIME     NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    source_alert_id BIGINT UNSIGNED NULL,
    created_by    INT UNSIGNED NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_promos_product_period (product_id, is_active, starts_at, ends_at),
    CONSTRAINT fk_promos_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_promos_user FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT ck_promos_period CHECK (ends_at > starts_at AND discount_value > 0)
) ENGINE=InnoDB;

ALTER TABLE sale_items
    ADD CONSTRAINT fk_saleitems_promo FOREIGN KEY (promotion_id) REFERENCES promotions (id) ON DELETE SET NULL;

-- Alertes et recommandations produites par le moteur de règles.
-- dedupe_key évite les doublons : une alerte encore valide est mise à jour, pas recréée.
CREATE TABLE smart_alerts (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    alert_type    ENUM('LOW_STOCK','OUT_OF_STOCK','NEAR_EXPIRY','EXPIRED','REORDER',
                       'ANOMALY','PROMOTION','CROSS_SELL','CREDIT_RISK') NOT NULL,
    severity      ENUM('INFO','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
    status        ENUM('NEW','ACKNOWLEDGED','DISMISSED','RESOLVED') NOT NULL DEFAULT 'NEW',
    product_id    INT UNSIGNED NULL,
    batch_id      BIGINT UNSIGNED NULL,
    dedupe_key    VARCHAR(120) NOT NULL,
    message_key   VARCHAR(80)  NOT NULL COMMENT 'Clé i18n, ex. agent.lowStock',
    payload       JSON         NOT NULL COMMENT 'Paramètres du message et de la recommandation',
    score         DECIMAL(10,3) NOT NULL DEFAULT 0 COMMENT 'Priorité de tri',
    first_seen_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_seen_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    handled_by    INT UNSIGNED NULL,
    handled_at    DATETIME     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_alerts_dedupe (dedupe_key),
    KEY ix_alerts_status_type (status, alert_type, score),
    KEY ix_alerts_product (product_id),
    CONSTRAINT fk_alerts_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_batch FOREIGN KEY (batch_id) REFERENCES product_batches (id) ON DELETE SET NULL,
    CONSTRAINT fk_alerts_user FOREIGN KEY (handled_by) REFERENCES users (id)
) ENGINE=InnoDB;

ALTER TABLE promotions
    ADD CONSTRAINT fk_promos_alert FOREIGN KEY (source_alert_id) REFERENCES smart_alerts (id) ON DELETE SET NULL;

-- Règles d'association (panier) : "qui achète A achète aussi B".
CREATE TABLE product_associations (
    product_id         INT UNSIGNED NOT NULL,
    associated_id      INT UNSIGNED NOT NULL,
    pair_count         INT UNSIGNED NOT NULL,
    support            DECIMAL(8,5) NOT NULL COMMENT 'P(A et B)',
    confidence         DECIMAL(8,5) NOT NULL COMMENT 'P(B | A)',
    lift               DECIMAL(10,4) NOT NULL COMMENT 'confidence / P(B)',
    computed_at        DATETIME    NOT NULL,
    PRIMARY KEY (product_id, associated_id),
    KEY ix_assoc_lift (product_id, lift),
    CONSTRAINT fk_assoc_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_assoc_associated FOREIGN KEY (associated_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE agent_runs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    started_at    DATETIME(6)  NOT NULL,
    finished_at   DATETIME(6)  NULL,
    alerts_upserted INT UNSIGNED NOT NULL DEFAULT 0,
    alerts_resolved INT UNSIGNED NOT NULL DEFAULT 0,
    status        ENUM('RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'RUNNING',
    error_message VARCHAR(500) NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB;

-- =============================================================================
-- 9. JOURNAL D'AUDIT
-- =============================================================================

CREATE TABLE audit_logs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       INT UNSIGNED NULL,
    action        VARCHAR(40)  NOT NULL COMMENT 'CREATE, UPDATE, DELETE, LOGIN, VOID_SALE...',
    entity_type   VARCHAR(40)  NOT NULL,
    entity_id     VARCHAR(40)  NULL,
    old_values    JSON         NULL,
    new_values    JSON         NULL,
    ip_address    VARCHAR(45)  NULL,
    user_agent    VARCHAR(255) NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_audit_entity (entity_type, entity_id),
    KEY ix_audit_user_date (user_id, created_at),
    KEY ix_audit_date (created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- 10. VUES DE REPORTING
-- =============================================================================

-- État du stock par produit avec péremption la plus proche.
CREATE OR REPLACE VIEW v_product_stock_status AS
SELECT  p.id AS product_id, p.sku, p.barcode, p.name, p.category_id,
        p.stock_qty, p.min_stock, p.reorder_qty, p.sale_price, p.avg_cost,
        ROUND(p.stock_qty * p.avg_cost, 2) AS stock_value,
        (SELECT MIN(b.expiry_date) FROM product_batches b
          WHERE b.product_id = p.id AND b.qty_remaining > 0) AS next_expiry_date,
        CASE WHEN p.stock_qty <= 0 THEN 'OUT_OF_STOCK'
             WHEN p.stock_qty <= p.min_stock THEN 'LOW'
             ELSE 'OK' END AS stock_status
FROM products p
WHERE p.deleted_at IS NULL;

-- Grand livre de taxe : collectée (ventes) vs payée (achats + dépenses).
CREATE OR REPLACE VIEW v_tax_ledger AS
SELECT  'COLLECTED' AS flow, DATE(s.created_at) AS tax_date, sit.tax_id,
        sit.taxable_amount, sit.tax_amount, 'sale' AS source_type, s.id AS source_id
FROM sale_item_taxes sit
JOIN sale_items si ON si.id = sit.sale_item_id
JOIN sales s       ON s.id = si.sale_id AND s.status = 'COMPLETED'
UNION ALL
SELECT  'PAID', DATE(pu.received_at), pit.tax_id,
        pit.taxable_amount, pit.tax_amount, 'purchase', pu.id
FROM purchase_item_taxes pit
JOIN purchase_items pi ON pi.id = pit.purchase_item_id
JOIN purchases pu      ON pu.id = pi.purchase_id AND pu.status = 'RECEIVED'
UNION ALL
SELECT  'PAID', DATE(cm.occurred_at), cm.tax_id,
        cm.amount - cm.tax_amount, cm.tax_amount, 'cash_movement', cm.id
FROM cash_movements cm
WHERE cm.tax_id IS NOT NULL AND cm.tax_amount > 0 AND cm.direction = 'OUT';

-- Ventes journalières.
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT  DATE(s.created_at)      AS sale_date,
        COUNT(*)                AS tickets,
        SUM(s.subtotal)         AS revenue_net,
        SUM(s.tax_total)        AS tax_collected,
        SUM(s.total)            AS revenue_gross,
        SUM(s.cost_total)       AS cogs,
        SUM(s.subtotal - s.cost_total) AS gross_margin,
        ROUND(AVG(s.total), 2)  AS avg_basket
FROM sales s
WHERE s.status = 'COMPLETED'
GROUP BY DATE(s.created_at);

-- =============================================================================
-- 11. PROCÉDURES STOCKÉES & FONCTIONS
-- =============================================================================

DELIMITER $$

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------

CREATE FUNCTION fn_setting(p_key VARCHAR(80)) RETURNS VARCHAR(500)
READS SQL DATA
BEGIN
    DECLARE v VARCHAR(500);
    SELECT setting_value INTO v FROM settings WHERE setting_key = p_key;
    RETURN v;
END$$

-- Numéro de document suivant (verrou de ligne : pas de doublon en concurrence).
CREATE PROCEDURE sp_next_document_number(IN p_doc_type VARCHAR(30), OUT p_number VARCHAR(40))
BEGIN
    DECLARE v_prefix VARCHAR(10);
    DECLARE v_next BIGINT UNSIGNED;
    DECLARE v_pad TINYINT UNSIGNED;
    DECLARE v_reset TINYINT;
    DECLARE v_year SMALLINT;

    SELECT prefix, next_value, padding, reset_yearly, current_year
      INTO v_prefix, v_next, v_pad, v_reset, v_year
      FROM document_sequences WHERE doc_type = p_doc_type FOR UPDATE;

    IF v_prefix IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sequenceNotFound';
    END IF;

    IF v_reset = 1 AND v_year <> YEAR(CURDATE()) THEN
        SET v_next = 1, v_year = YEAR(CURDATE());
    END IF;

    SET p_number = CONCAT(v_prefix, '-', v_year, '-', LPAD(v_next, v_pad, '0'));

    UPDATE document_sequences
       SET next_value = v_next + 1, current_year = v_year
     WHERE doc_type = p_doc_type;
END$$

-- -----------------------------------------------------------------------------
-- STOCK
-- -----------------------------------------------------------------------------

-- Entrée de stock : crée un lot, met à jour stock et coût moyen pondéré.
CREATE PROCEDURE sp_stock_in(
    IN  p_product_id   INT UNSIGNED,
    IN  p_qty          DECIMAL(12,3),
    IN  p_unit_cost    DECIMAL(14,4),
    IN  p_batch_no     VARCHAR(50),
    IN  p_expiry_date  DATE,
    IN  p_type         VARCHAR(20),     -- PURCHASE | SALE_RETURN | ADJUSTMENT_IN | OPENING
    IN  p_ref_type     VARCHAR(30),
    IN  p_ref_id       BIGINT UNSIGNED,
    IN  p_reason       VARCHAR(255),
    IN  p_user_id      INT UNSIGNED,
    OUT p_batch_id     BIGINT UNSIGNED)
BEGIN
    DECLARE v_stock DECIMAL(12,3);
    DECLARE v_avg   DECIMAL(14,4);
    DECLARE v_new_stock DECIMAL(12,3);
    DECLARE v_absorbed DECIMAL(12,3) DEFAULT 0;

    IF p_qty IS NULL OR p_qty <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidQuantity';
    END IF;
    IF p_type NOT IN ('PURCHASE','SALE_RETURN','ADJUSTMENT_IN','OPENING') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidMovementType';
    END IF;

    SELECT stock_qty, avg_cost INTO v_stock, v_avg
      FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
    IF v_stock IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.productNotFound';
    END IF;

    SET v_new_stock = v_stock + p_qty;

    -- Si le stock était négatif, la partie qui comble le trou ne crée pas de lot disponible.
    IF v_stock < 0 THEN
        SET v_absorbed = LEAST(p_qty, -v_stock);
    END IF;

    INSERT INTO product_batches (product_id, batch_no, expiry_date, unit_cost, qty_received, qty_remaining)
    VALUES (p_product_id, p_batch_no, p_expiry_date, COALESCE(p_unit_cost, v_avg), p_qty, p_qty - v_absorbed);
    SET p_batch_id = LAST_INSERT_ID();

    -- Coût moyen pondéré sur le stock positif.
    IF p_unit_cost IS NOT NULL AND p_type IN ('PURCHASE','OPENING') THEN
        IF GREATEST(v_stock, 0) + p_qty > 0 THEN
            SET v_avg = (GREATEST(v_stock, 0) * v_avg + p_qty * p_unit_cost) / (GREATEST(v_stock, 0) + p_qty);
        END IF;
        UPDATE products
           SET stock_qty = v_new_stock, avg_cost = v_avg, purchase_price = ROUND(p_unit_cost, 2)
         WHERE id = p_product_id;
    ELSE
        UPDATE products SET stock_qty = v_new_stock WHERE id = p_product_id;
    END IF;

    INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity, unit_cost, balance_after,
                                 reference_type, reference_id, reason, user_id)
    VALUES (p_product_id, p_batch_id, p_type, p_qty, COALESCE(p_unit_cost, v_avg), v_new_stock,
            p_ref_type, p_ref_id, p_reason, p_user_id);
END$$

-- Sortie de stock en FEFO (premier expiré, premier sorti) ou sur un lot précis.
-- Retourne le coût unitaire moyen réellement sorti (pour le COGS).
CREATE PROCEDURE sp_stock_out(
    IN  p_product_id   INT UNSIGNED,
    IN  p_qty          DECIMAL(12,3),
    IN  p_batch_id     BIGINT UNSIGNED,  -- NULL = FEFO automatique
    IN  p_type         VARCHAR(20),      -- SALE | WASTE | ADJUSTMENT_OUT | SUPPLIER_RETURN
    IN  p_ref_type     VARCHAR(30),
    IN  p_ref_id       BIGINT UNSIGNED,
    IN  p_reason       VARCHAR(255),
    IN  p_user_id      INT UNSIGNED,
    OUT p_unit_cost    DECIMAL(14,4))
BEGIN
    DECLARE v_stock DECIMAL(12,3);
    DECLARE v_avg   DECIMAL(14,4);
    DECLARE v_left  DECIMAL(12,3);
    DECLARE v_take  DECIMAL(12,3);
    DECLARE v_total_cost DECIMAL(18,4) DEFAULT 0;
    DECLARE v_b_id  BIGINT UNSIGNED;
    DECLARE v_b_qty DECIMAL(12,3);
    DECLARE v_b_cost DECIMAL(14,4);
    DECLARE v_allow_negative TINYINT DEFAULT 0;
    DECLARE v_done  TINYINT DEFAULT 0;

    DECLARE cur_fefo CURSOR FOR
        SELECT id, qty_remaining, unit_cost FROM product_batches
         WHERE product_id = p_product_id AND qty_remaining > 0
           AND (p_batch_id IS NULL OR id = p_batch_id)
         ORDER BY (expiry_date IS NULL), expiry_date, received_at, id
         FOR UPDATE;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    IF p_qty IS NULL OR p_qty <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidQuantity';
    END IF;
    IF p_type NOT IN ('SALE','WASTE','ADJUSTMENT_OUT','SUPPLIER_RETURN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidMovementType';
    END IF;

    SELECT stock_qty, avg_cost INTO v_stock, v_avg
      FROM products WHERE id = p_product_id AND deleted_at IS NULL FOR UPDATE;
    IF v_stock IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.productNotFound';
    END IF;

    SET v_allow_negative = COALESCE(CAST(fn_setting('allow_negative_stock') AS UNSIGNED), 0);
    IF v_stock < p_qty AND (v_allow_negative = 0 OR p_type <> 'SALE') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.insufficientStock';
    END IF;

    SET v_left = p_qty;
    OPEN cur_fefo;
    fefo_loop: LOOP
        IF v_left <= 0 THEN LEAVE fefo_loop; END IF;
        FETCH cur_fefo INTO v_b_id, v_b_qty, v_b_cost;
        IF v_done = 1 THEN LEAVE fefo_loop; END IF;

        SET v_take = LEAST(v_left, v_b_qty);
        UPDATE product_batches SET qty_remaining = qty_remaining - v_take WHERE id = v_b_id;
        SET v_stock = v_stock - v_take;
        SET v_left = v_left - v_take;
        SET v_total_cost = v_total_cost + v_take * v_b_cost;

        INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity, unit_cost, balance_after,
                                     reference_type, reference_id, reason, user_id)
        VALUES (p_product_id, v_b_id, p_type, -v_take, v_b_cost, v_stock,
                p_ref_type, p_ref_id, p_reason, p_user_id);
    END LOOP;
    CLOSE cur_fefo;

    IF v_left > 0 THEN
        IF p_batch_id IS NOT NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.insufficientBatchQuantity';
        END IF;
        -- Vente en stock négatif autorisée : valorisée au coût moyen, signalée par le Smart Agent.
        SET v_stock = v_stock - v_left;
        SET v_total_cost = v_total_cost + v_left * v_avg;
        INSERT INTO stock_movements (product_id, batch_id, movement_type, quantity, unit_cost, balance_after,
                                     reference_type, reference_id, reason, user_id)
        VALUES (p_product_id, NULL, p_type, -v_left, v_avg, v_stock,
                p_ref_type, p_ref_id, CONCAT_WS(' | ', p_reason, 'NEGATIVE_STOCK'), p_user_id);
    END IF;

    UPDATE products SET stock_qty = v_stock WHERE id = p_product_id;
    SET p_unit_cost = ROUND(v_total_cost / p_qty, 4);
END$$

-- Perte / gaspillage (casse, périmé, vol constaté).
CREATE PROCEDURE sp_record_waste(
    IN p_product_id INT UNSIGNED, IN p_qty DECIMAL(12,3), IN p_batch_id BIGINT UNSIGNED,
    IN p_reason VARCHAR(255), IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE v_cost DECIMAL(14,4);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    START TRANSACTION;
    CALL sp_stock_out(p_product_id, p_qty, p_batch_id, 'WASTE', 'waste', NULL, p_reason, p_user_id, v_cost);
    COMMIT;
END$$

-- Ajustement d'inventaire : on saisit la quantité comptée, la procédure calcule l'écart.
CREATE PROCEDURE sp_adjust_stock(
    IN p_product_id INT UNSIGNED, IN p_counted_qty DECIMAL(12,3),
    IN p_reason VARCHAR(255), IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE v_stock DECIMAL(12,3);
    DECLARE v_delta DECIMAL(12,3);
    DECLARE v_cost DECIMAL(14,4);
    DECLARE v_batch BIGINT UNSIGNED;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidQuantity';
    END IF;

    START TRANSACTION;
    SELECT stock_qty INTO v_stock FROM products WHERE id = p_product_id FOR UPDATE;
    SET v_delta = p_counted_qty - v_stock;
    IF v_delta > 0 THEN
        CALL sp_stock_in(p_product_id, v_delta, NULL, NULL, NULL, 'ADJUSTMENT_IN',
                         'adjustment', NULL, p_reason, p_user_id, v_batch);
    ELSEIF v_delta < 0 THEN
        CALL sp_stock_out(p_product_id, -v_delta, NULL, 'ADJUSTMENT_OUT',
                          'adjustment', NULL, p_reason, p_user_id, v_cost);
    END IF;
    COMMIT;
END$$

-- Réception d'un bon d'achat : calcule les taxes déductibles, crée les lots, met à jour le stock.
CREATE PROCEDURE sp_receive_purchase(IN p_purchase_id BIGINT UNSIGNED, IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_item_id BIGINT UNSIGNED;
    DECLARE v_product_id INT UNSIGNED;
    DECLARE v_qty DECIMAL(12,3);
    DECLARE v_cost DECIMAL(14,4);
    DECLARE v_batch_no VARCHAR(50);
    DECLARE v_expiry DATE;
    DECLARE v_batch_id BIGINT UNSIGNED;
    DECLARE v_supplier INT UNSIGNED;
    DECLARE v_total DECIMAL(14,2);
    DECLARE v_done TINYINT DEFAULT 0;
    DECLARE cur_items CURSOR FOR
        SELECT id, product_id, quantity, unit_cost, batch_no, expiry_date
          FROM purchase_items WHERE purchase_id = p_purchase_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status, supplier_id INTO v_status, v_supplier
      FROM purchases WHERE id = p_purchase_id FOR UPDATE;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.purchaseNotFound';
    END IF;
    IF v_status <> 'DRAFT' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.purchaseNotDraft';
    END IF;

    -- Montants HT des lignes
    UPDATE purchase_items SET net_amount = ROUND(quantity * unit_cost, 2) WHERE purchase_id = p_purchase_id;

    -- Taxes déductibles par ligne (taxes du produit applicables aux achats)
    DELETE pit FROM purchase_item_taxes pit
      JOIN purchase_items pi ON pi.id = pit.purchase_item_id WHERE pi.purchase_id = p_purchase_id;
    INSERT INTO purchase_item_taxes (purchase_item_id, tax_id, tax_type, rate, taxable_amount, tax_amount)
    SELECT pi.id, t.id, t.tax_type, t.rate, pi.net_amount,
           CASE t.tax_type WHEN 'PERCENT' THEN ROUND(pi.net_amount * t.rate / 100, 2)
                           ELSE ROUND(pi.quantity * t.rate, 2) END
      FROM purchase_items pi
      JOIN product_taxes pt ON pt.product_id = pi.product_id
      JOIN taxes t ON t.id = pt.tax_id AND t.is_active = 1 AND t.applies_to IN ('PURCHASES','BOTH')
     WHERE pi.purchase_id = p_purchase_id;

    UPDATE purchase_items pi
       LEFT JOIN (SELECT purchase_item_id, SUM(tax_amount) AS tx FROM purchase_item_taxes GROUP BY purchase_item_id) x
              ON x.purchase_item_id = pi.id
       SET pi.tax_amount = COALESCE(x.tx, 0), pi.line_total = pi.net_amount + COALESCE(x.tx, 0)
     WHERE pi.purchase_id = p_purchase_id;

    OPEN cur_items;
    items_loop: LOOP
        FETCH cur_items INTO v_item_id, v_product_id, v_qty, v_cost, v_batch_no, v_expiry;
        IF v_done = 1 THEN LEAVE items_loop; END IF;
        CALL sp_stock_in(v_product_id, v_qty, v_cost, v_batch_no, v_expiry, 'PURCHASE',
                         'purchase', p_purchase_id, NULL, p_user_id, v_batch_id);
        UPDATE purchase_items SET batch_id = v_batch_id WHERE id = v_item_id;
    END LOOP;
    CLOSE cur_items;

    UPDATE purchases pu
       JOIN (SELECT purchase_id, SUM(net_amount) AS st, SUM(tax_amount) AS tx, SUM(line_total) AS tt
               FROM purchase_items WHERE purchase_id = p_purchase_id GROUP BY purchase_id) x
         ON x.purchase_id = pu.id
       SET pu.subtotal = x.st, pu.tax_total = x.tx, pu.total = x.tt,
           pu.status = 'RECEIVED', pu.received_at = NOW()
     WHERE pu.id = p_purchase_id;

    SELECT total - paid_total INTO v_total FROM purchases WHERE id = p_purchase_id;
    UPDATE suppliers SET balance = balance + v_total WHERE id = v_supplier;
    COMMIT;
END$$

-- Paiement fournisseur : sortie de trésorerie + mise à jour du solde.
CREATE PROCEDURE sp_pay_supplier(
    IN p_purchase_id BIGINT UNSIGNED, IN p_amount DECIMAL(14,2),
    IN p_method VARCHAR(10), IN p_session_id BIGINT UNSIGNED, IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE v_total DECIMAL(14,2);
    DECLARE v_paid  DECIMAL(14,2);
    DECLARE v_supplier INT UNSIGNED;
    DECLARE v_cat SMALLINT UNSIGNED;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT total, paid_total, supplier_id INTO v_total, v_paid, v_supplier
      FROM purchases WHERE id = p_purchase_id AND status = 'RECEIVED' FOR UPDATE;
    IF v_total IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.purchaseNotReceived';
    END IF;
    IF p_amount <= 0 OR p_amount > v_total - v_paid THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidAmount';
    END IF;

    SELECT id INTO v_cat FROM cash_categories WHERE code = 'SUPPLIER_PAYMENT';
    INSERT INTO cash_movements (session_id, category_id, direction, payment_method, amount,
                                reference_type, reference_id, description, user_id)
    VALUES (IF(p_method = 'CASH', p_session_id, NULL), v_cat, 'OUT', p_method, p_amount,
            'purchase', p_purchase_id, NULL, p_user_id);

    UPDATE purchases
       SET paid_total = paid_total + p_amount,
           payment_status = IF(paid_total + p_amount >= total, 'PAID', 'PARTIAL')
     WHERE id = p_purchase_id;
    UPDATE suppliers SET balance = balance - p_amount WHERE id = v_supplier;
    COMMIT;
END$$

-- -----------------------------------------------------------------------------
-- CAISSE : ouverture / fermeture / mouvements
-- -----------------------------------------------------------------------------

CREATE PROCEDURE sp_open_cash_session(
    IN p_register_id SMALLINT UNSIGNED, IN p_user_id INT UNSIGNED,
    IN p_opening_float DECIMAL(14,2), OUT p_session_id BIGINT UNSIGNED)
BEGIN
    IF EXISTS (SELECT 1 FROM cash_sessions WHERE register_id = p_register_id AND status = 'OPEN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sessionAlreadyOpen';
    END IF;
    INSERT INTO cash_sessions (register_id, opened_by, opening_float)
    VALUES (p_register_id, p_user_id, COALESCE(p_opening_float, 0));
    SET p_session_id = LAST_INSERT_ID();
END$$

-- Espèces attendues = fond de caisse + entrées espèces - sorties espèces.
CREATE FUNCTION fn_session_expected_cash(p_session_id BIGINT UNSIGNED) RETURNS DECIMAL(14,2)
READS SQL DATA
BEGIN
    DECLARE v_float DECIMAL(14,2);
    DECLARE v_net DECIMAL(14,2);
    SELECT opening_float INTO v_float FROM cash_sessions WHERE id = p_session_id;
    SELECT COALESCE(SUM(IF(direction = 'IN', amount, -amount)), 0) INTO v_net
      FROM cash_movements WHERE session_id = p_session_id AND payment_method = 'CASH';
    RETURN v_float + v_net;
END$$

CREATE PROCEDURE sp_close_cash_session(
    IN p_session_id BIGINT UNSIGNED, IN p_counted_cash DECIMAL(14,2),
    IN p_user_id INT UNSIGNED, IN p_notes VARCHAR(500))
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE v_expected DECIMAL(14,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT status INTO v_status FROM cash_sessions WHERE id = p_session_id FOR UPDATE;
    IF v_status IS NULL OR v_status <> 'OPEN' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sessionNotOpen';
    END IF;

    SET v_expected = fn_session_expected_cash(p_session_id);
    UPDATE cash_sessions
       SET status = 'CLOSED', closed_by = p_user_id, closed_at = NOW(),
           expected_cash = v_expected, counted_cash = p_counted_cash,
           difference = p_counted_cash - v_expected, notes = p_notes
     WHERE id = p_session_id;
    COMMIT;

    -- Rapport Z de la session
    SELECT cs.id AS session_id, cs.opened_at, cs.closed_at, cs.opening_float,
           cs.expected_cash, cs.counted_cash, cs.difference,
           (SELECT COUNT(*) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS tickets,
           (SELECT COALESCE(SUM(total), 0) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS sales_total,
           (SELECT COALESCE(SUM(tax_total), 0) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS tax_total
      FROM cash_sessions cs WHERE cs.id = p_session_id;

    -- Encaissements par mode de paiement (espèces nettes du rendu monnaie)
    SELECT sp.method,
           SUM(sp.amount) - IF(sp.method = 'CASH',
                (SELECT COALESCE(SUM(change_due), 0) FROM sales
                  WHERE session_id = p_session_id AND status = 'COMPLETED'), 0) AS amount
      FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE s.session_id = p_session_id AND s.status = 'COMPLETED'
     GROUP BY sp.method;
END$$

-- Entrée/sortie de trésorerie manuelle (dépense, loyer, salaire, apport, retrait...).
CREATE PROCEDURE sp_record_cash_movement(
    IN p_session_id BIGINT UNSIGNED, IN p_category_code VARCHAR(30), IN p_direction VARCHAR(3),
    IN p_method VARCHAR(10), IN p_amount DECIMAL(14,2), IN p_tax_id SMALLINT UNSIGNED,
    IN p_description VARCHAR(255), IN p_user_id INT UNSIGNED, OUT p_movement_id BIGINT UNSIGNED)
BEGIN
    DECLARE v_cat SMALLINT UNSIGNED;
    DECLARE v_cat_dir VARCHAR(4);
    DECLARE v_system TINYINT;
    DECLARE v_rate DECIMAL(10,3);
    DECLARE v_tax DECIMAL(14,2) DEFAULT 0;

    SELECT id, direction, is_system INTO v_cat, v_cat_dir, v_system
      FROM cash_categories WHERE code = p_category_code;
    IF v_cat IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.cashCategoryNotFound';
    END IF;
    IF v_system = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.cashCategoryIsSystem';
    END IF;
    IF v_cat_dir <> 'BOTH' AND v_cat_dir <> p_direction THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.cashDirectionMismatch';
    END IF;
    IF p_method = 'CASH' AND (p_session_id IS NULL OR NOT EXISTS
        (SELECT 1 FROM cash_sessions WHERE id = p_session_id AND status = 'OPEN')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sessionNotOpen';
    END IF;

    -- Taxe incluse dans le montant TTC d'une dépense (déductible)
    IF p_tax_id IS NOT NULL AND p_direction = 'OUT' THEN
        SELECT rate INTO v_rate FROM taxes WHERE id = p_tax_id AND tax_type = 'PERCENT';
        SET v_tax = ROUND(p_amount - p_amount / (1 + COALESCE(v_rate, 0) / 100), 2);
    END IF;

    INSERT INTO cash_movements (session_id, category_id, direction, payment_method, amount,
                                tax_id, tax_amount, description, user_id)
    VALUES (IF(p_method = 'CASH', p_session_id, NULL), v_cat, p_direction, p_method, p_amount,
            IF(v_tax > 0, p_tax_id, NULL), v_tax, p_description, p_user_id);
    SET p_movement_id = LAST_INSERT_ID();
END$$

-- Remboursement d'une dette client.
CREATE PROCEDURE sp_customer_repayment(
    IN p_customer_id INT UNSIGNED, IN p_amount DECIMAL(14,2), IN p_method VARCHAR(10),
    IN p_session_id BIGINT UNSIGNED, IN p_user_id INT UNSIGNED)
BEGIN
    DECLARE v_balance DECIMAL(14,2);
    DECLARE v_cat SMALLINT UNSIGNED;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT balance INTO v_balance FROM customers WHERE id = p_customer_id FOR UPDATE;
    IF v_balance IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.customerNotFound';
    END IF;
    IF p_amount <= 0 OR p_amount > v_balance THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidAmount';
    END IF;
    IF p_method = 'CASH' AND NOT EXISTS
        (SELECT 1 FROM cash_sessions WHERE id = p_session_id AND status = 'OPEN') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sessionNotOpen';
    END IF;

    UPDATE customers SET balance = balance - p_amount WHERE id = p_customer_id;
    INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after, payment_method, user_id)
    VALUES (p_customer_id, 'REPAYMENT', -p_amount, v_balance - p_amount, p_method, p_user_id);

    SELECT id INTO v_cat FROM cash_categories WHERE code = 'CUSTOMER_REPAYMENT';
    INSERT INTO cash_movements (session_id, category_id, direction, payment_method, amount,
                                reference_type, reference_id, user_id)
    VALUES (IF(p_method = 'CASH', p_session_id, NULL), v_cat, 'IN', p_method, p_amount,
            'customer', p_customer_id, p_user_id);
    COMMIT;
END$$

-- -----------------------------------------------------------------------------
-- POS : encaissement complet en une transaction
--
-- p_items    : [{"product_id":1,"qty":2,"unit_price":null,"discount":0}, ...]
--              unit_price NULL => prix catalogue (promotion active appliquée automatiquement)
-- p_payments : [{"method":"CASH","amount":50.00,"reference":null}, ...]
-- Taxes : si prices_include_tax = 1, les prix sont TTC et la base HT est extraite ;
--         sinon les taxes s'ajoutent au prix. Taxes FIXED = montant par unité.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE sp_pos_checkout(
    IN  p_session_id   BIGINT UNSIGNED,
    IN  p_user_id      INT UNSIGNED,
    IN  p_customer_id  INT UNSIGNED,
    IN  p_items        JSON,
    IN  p_payments     JSON,
    IN  p_language     CHAR(2),
    OUT p_sale_id      BIGINT UNSIGNED,
    OUT p_receipt_no   VARCHAR(40))
BEGIN
    DECLARE v_incl TINYINT DEFAULT 1;
    DECLARE v_item_id BIGINT UNSIGNED;
    DECLARE v_product_id INT UNSIGNED;
    DECLARE v_qty DECIMAL(12,3);
    DECLARE v_cost DECIMAL(14,4);
    DECLARE v_total DECIMAL(14,2);
    DECLARE v_paid DECIMAL(14,2);
    DECLARE v_cash DECIMAL(14,2);
    DECLARE v_credit DECIMAL(14,2);
    DECLARE v_change DECIMAL(14,2) DEFAULT 0;
    DECLARE v_cust_balance DECIMAL(14,2);
    DECLARE v_cust_limit DECIMAL(14,2);
    DECLARE v_cust_walkin TINYINT;
    DECLARE v_cat_sale SMALLINT UNSIGNED;
    DECLARE v_bad INT;
    DECLARE v_done TINYINT DEFAULT 0;
    DECLARE cur_lines CURSOR FOR SELECT id, product_id, quantity FROM sale_items WHERE sale_id = p_sale_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_items IS NULL OR JSON_LENGTH(p_items) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.emptyCart';
    END IF;
    IF p_payments IS NULL OR JSON_LENGTH(p_payments) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.noPayment';
    END IF;

    SET v_incl = COALESCE(CAST(fn_setting('prices_include_tax') AS UNSIGNED), 1);

    START TRANSACTION;

    IF NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = p_session_id AND status = 'OPEN' FOR UPDATE) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.sessionNotOpen';
    END IF;

    -- Lignes du panier (fusion des lignes identiques, validation produits)
    DROP TEMPORARY TABLE IF EXISTS tmp_cart;
    CREATE TEMPORARY TABLE tmp_cart (
        product_id INT UNSIGNED, qty DECIMAL(12,3), unit_price DECIMAL(14,2), discount DECIMAL(14,2)
    ) ENGINE=MEMORY;
    INSERT INTO tmp_cart
    SELECT j.product_id, SUM(j.qty), MAX(j.unit_price), SUM(COALESCE(j.discount, 0))
      FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
               product_id INT UNSIGNED  PATH '$.product_id',
               qty        DECIMAL(12,3) PATH '$.qty',
               unit_price DECIMAL(14,2) PATH '$.unit_price' NULL ON EMPTY,
               discount   DECIMAL(14,2) PATH '$.discount'   DEFAULT '0' ON EMPTY)) j
     GROUP BY j.product_id;

    SELECT COUNT(*) INTO v_bad FROM tmp_cart c
      LEFT JOIN products p ON p.id = c.product_id AND p.is_active = 1 AND p.deleted_at IS NULL
     WHERE p.id IS NULL OR c.qty IS NULL OR c.qty <= 0 OR c.discount < 0;
    IF v_bad > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidCartLine';
    END IF;

    CALL sp_next_document_number('RECEIPT', p_receipt_no);
    INSERT INTO sales (receipt_no, session_id, customer_id, user_id, language_code)
    VALUES (p_receipt_no, p_session_id, p_customer_id, p_user_id, COALESCE(p_language, 'en'));
    SET p_sale_id = LAST_INSERT_ID();

    -- 1) Lignes : prix appliqué = prix forcé, sinon prix promo actif, sinon prix catalogue
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price,
                            discount_amount, gross_amount, promotion_id)
    SELECT p_sale_id, z.id, z.name, z.qty, z.price, z.discount,
           ROUND(z.qty * z.price - z.discount, 2), z.promo_id
      FROM (SELECT p.id, p.name, c.qty, c.discount,
                   COALESCE(c.unit_price,
                        CASE pr.discount_type
                            WHEN 'PERCENT' THEN ROUND(p.sale_price * (1 - pr.discount_value / 100), 2)
                            WHEN 'FIXED'   THEN GREATEST(p.sale_price - pr.discount_value, 0)
                            ELSE p.sale_price END) AS price,
                   IF(c.unit_price IS NULL, pr.id, NULL) AS promo_id
              FROM tmp_cart c
              JOIN products p ON p.id = c.product_id
              LEFT JOIN promotions pr ON pr.id = (
                    SELECT pr2.id FROM promotions pr2
                     WHERE pr2.product_id = p.id AND pr2.is_active = 1
                       AND NOW() BETWEEN pr2.starts_at AND pr2.ends_at
                     ORDER BY pr2.discount_value DESC LIMIT 1)) z;

    IF EXISTS (SELECT 1 FROM sale_items WHERE sale_id = p_sale_id AND gross_amount < 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.discountExceedsLine';
    END IF;

    -- 2) Base HT par ligne
    UPDATE sale_items si
      LEFT JOIN (
            SELECT pt.product_id,
                   SUM(IF(t.tax_type = 'PERCENT', t.rate, 0)) AS pct,
                   SUM(IF(t.tax_type = 'FIXED',   t.rate, 0)) AS fixed_per_unit
              FROM product_taxes pt
              JOIN taxes t ON t.id = pt.tax_id AND t.is_active = 1 AND t.applies_to IN ('SALES','BOTH')
             GROUP BY pt.product_id) tx ON tx.product_id = si.product_id
       SET si.net_amount = IF(v_incl = 1,
                ROUND((si.gross_amount - si.quantity * COALESCE(tx.fixed_per_unit, 0))
                      / (1 + COALESCE(tx.pct, 0) / 100), 2),
                si.gross_amount)
     WHERE si.sale_id = p_sale_id;

    -- 3) Taxe collectée, détaillée par taxe
    INSERT INTO sale_item_taxes (sale_item_id, tax_id, tax_type, rate, taxable_amount, tax_amount)
    SELECT si.id, t.id, t.tax_type, t.rate, si.net_amount,
           IF(t.tax_type = 'PERCENT', ROUND(si.net_amount * t.rate / 100, 2), ROUND(si.quantity * t.rate, 2))
      FROM sale_items si
      JOIN product_taxes pt ON pt.product_id = si.product_id
      JOIN taxes t ON t.id = pt.tax_id AND t.is_active = 1 AND t.applies_to IN ('SALES','BOTH')
     WHERE si.sale_id = p_sale_id;

    -- 4) Totaux de ligne. En TTC, le total reste le prix affiché ; l'arrondi est absorbé par la base HT.
    UPDATE sale_items si
      LEFT JOIN (SELECT sale_item_id, SUM(tax_amount) AS tx FROM sale_item_taxes GROUP BY sale_item_id) x
             ON x.sale_item_id = si.id
       SET si.tax_amount = COALESCE(x.tx, 0),
           si.line_total = IF(v_incl = 1, si.gross_amount, si.net_amount + COALESCE(x.tx, 0)),
           si.net_amount = IF(v_incl = 1, si.gross_amount - COALESCE(x.tx, 0), si.net_amount)
     WHERE si.sale_id = p_sale_id;

    -- 5) Sorties de stock FEFO + coût réel
    OPEN cur_lines;
    lines_loop: LOOP
        FETCH cur_lines INTO v_item_id, v_product_id, v_qty;
        IF v_done = 1 THEN LEAVE lines_loop; END IF;
        CALL sp_stock_out(v_product_id, v_qty, NULL, 'SALE', 'sale', p_sale_id, NULL, p_user_id, v_cost);
        UPDATE sale_items SET unit_cost = v_cost WHERE id = v_item_id;
    END LOOP;
    CLOSE cur_lines;

    -- 6) Totaux de la vente
    UPDATE sales s
      JOIN (SELECT sale_id, SUM(net_amount) AS st, SUM(discount_amount) AS disc, SUM(tax_amount) AS tx,
                   SUM(line_total) AS tt, ROUND(SUM(quantity * unit_cost), 2) AS cogs
              FROM sale_items WHERE sale_id = p_sale_id GROUP BY sale_id) x ON x.sale_id = s.id
       SET s.subtotal = x.st, s.discount_total = x.disc, s.tax_total = x.tx,
           s.total = x.tt, s.cost_total = x.cogs
     WHERE s.id = p_sale_id;
    SELECT total INTO v_total FROM sales WHERE id = p_sale_id;

    -- 7) Paiements
    INSERT INTO sale_payments (sale_id, method, amount, reference)
    SELECT p_sale_id, j.method, j.amount, j.reference
      FROM JSON_TABLE(p_payments, '$[*]' COLUMNS (
               method    VARCHAR(10)   PATH '$.method',
               amount    DECIMAL(14,2) PATH '$.amount',
               reference VARCHAR(80)   PATH '$.reference' NULL ON EMPTY)) j;

    SELECT COALESCE(SUM(amount), 0),
           COALESCE(SUM(IF(method = 'CASH', amount, 0)), 0),
           COALESCE(SUM(IF(method = 'CREDIT', amount, 0)), 0)
      INTO v_paid, v_cash, v_credit
      FROM sale_payments WHERE sale_id = p_sale_id;

    IF v_paid < v_total THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.insufficientPayment';
    END IF;
    -- Le rendu de monnaie ne peut provenir que des espèces.
    SET v_change = v_paid - v_total;
    IF v_change > v_cash THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.overpaymentNonCash';
    END IF;

    -- 8) Crédit client (dette)
    IF v_credit > 0 THEN
        SELECT balance, credit_limit, is_walk_in INTO v_cust_balance, v_cust_limit, v_cust_walkin
          FROM customers WHERE id = p_customer_id AND is_active = 1 FOR UPDATE;
        IF v_cust_balance IS NULL OR v_cust_walkin = 1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.creditRequiresCustomer';
        END IF;
        IF v_cust_balance + v_credit > v_cust_limit THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.creditLimitExceeded';
        END IF;
        UPDATE customers SET balance = balance + v_credit WHERE id = p_customer_id;
        INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after, sale_id, user_id)
        VALUES (p_customer_id, 'CREDIT_SALE', v_credit, v_cust_balance + v_credit, p_sale_id, p_user_id);
    END IF;

    -- 9) Trésorerie : encaissements réels (espèces nettes du rendu, carte, mobile)
    SELECT id INTO v_cat_sale FROM cash_categories WHERE code = 'SALE';
    INSERT INTO cash_movements (session_id, category_id, direction, payment_method, amount,
                                reference_type, reference_id, user_id)
    SELECT p_session_id, v_cat_sale, 'IN', x.method, x.amount, 'sale', p_sale_id, p_user_id
      FROM (SELECT method, SUM(amount) - IF(method = 'CASH', v_change, 0) AS amount
              FROM sale_payments WHERE sale_id = p_sale_id AND method <> 'CREDIT'
             GROUP BY method) x
     WHERE x.amount > 0;

    UPDATE sales SET paid_total = v_paid, change_due = v_change WHERE id = p_sale_id;
    DROP TEMPORARY TABLE IF EXISTS tmp_cart;
    COMMIT;

    -- Données du ticket de caisse
    SELECT s.id, s.receipt_no, s.created_at, s.subtotal, s.discount_total, s.tax_total, s.total,
           s.paid_total, s.change_due, s.language_code, u.full_name AS cashier, c.full_name AS customer
      FROM sales s JOIN users u ON u.id = s.user_id
      LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = p_sale_id;
END$$

-- Annulation d'une vente : remet en stock, annule la dette, sortie de caisse.
CREATE PROCEDURE sp_void_sale(IN p_sale_id BIGINT UNSIGNED, IN p_user_id INT UNSIGNED, IN p_reason VARCHAR(255))
BEGIN
    DECLARE v_status VARCHAR(10);
    DECLARE v_customer INT UNSIGNED;
    DECLARE v_credit DECIMAL(14,2);
    DECLARE v_balance DECIMAL(14,2);
    DECLARE v_session BIGINT UNSIGNED;
    DECLARE v_cat SMALLINT UNSIGNED;
    DECLARE v_product INT UNSIGNED;
    DECLARE v_qty DECIMAL(12,3);
    DECLARE v_cost DECIMAL(14,4);
    DECLARE v_batch BIGINT UNSIGNED;
    DECLARE v_done TINYINT DEFAULT 0;
    DECLARE cur_lines CURSOR FOR SELECT product_id, quantity, unit_cost FROM sale_items WHERE sale_id = p_sale_id;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    IF p_reason IS NULL OR CHAR_LENGTH(TRIM(p_reason)) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.voidReasonRequired';
    END IF;

    START TRANSACTION;
    SELECT status, customer_id, session_id INTO v_status, v_customer, v_session
      FROM sales WHERE id = p_sale_id FOR UPDATE;
    IF v_status IS NULL OR v_status <> 'COMPLETED' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.saleNotVoidable';
    END IF;
    -- Caisse d'origine déjà clôturée : le remboursement sort de la caisse ouverte (celle de la personne qui annule en priorité)
    IF NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = v_session AND status = 'OPEN') THEN
        SET v_session = NULL;
        SELECT id INTO v_session FROM cash_sessions
         WHERE status = 'OPEN' ORDER BY (opened_by = p_user_id) DESC, id DESC LIMIT 1;
        IF v_session IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.openSessionToRefund';
        END IF;
    END IF;
    SET v_done = 0;

    OPEN cur_lines;
    lines_loop: LOOP
        FETCH cur_lines INTO v_product, v_qty, v_cost;
        IF v_done = 1 THEN LEAVE lines_loop; END IF;
        CALL sp_stock_in(v_product, v_qty, v_cost, NULL, NULL, 'SALE_RETURN',
                         'sale', p_sale_id, p_reason, p_user_id, v_batch);
    END LOOP;
    CLOSE cur_lines;

    SELECT COALESCE(SUM(amount), 0) INTO v_credit
      FROM sale_payments WHERE sale_id = p_sale_id AND method = 'CREDIT';
    IF v_credit > 0 THEN
        SELECT balance INTO v_balance FROM customers WHERE id = v_customer FOR UPDATE;
        UPDATE customers SET balance = balance - v_credit WHERE id = v_customer;
        INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after, sale_id, notes, user_id)
        VALUES (v_customer, 'SALE_VOID', -v_credit, v_balance - v_credit, p_sale_id, p_reason, p_user_id);
    END IF;

    SELECT id INTO v_cat FROM cash_categories WHERE code = 'SALE_REFUND';
    INSERT INTO cash_movements (session_id, category_id, direction, payment_method, amount,
                                reference_type, reference_id, description, user_id)
    SELECT v_session, v_cat, 'OUT', payment_method, amount, 'sale', p_sale_id, p_reason, p_user_id
      FROM cash_movements
     WHERE reference_type = 'sale' AND reference_id = p_sale_id AND direction = 'IN';

    UPDATE sales SET status = 'VOIDED', voided_by = p_user_id, voided_at = NOW(), void_reason = p_reason
     WHERE id = p_sale_id;

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES (p_user_id, 'VOID_SALE', 'sale', p_sale_id, JSON_OBJECT('reason', p_reason));
    COMMIT;
END$$

-- -----------------------------------------------------------------------------
-- COMPTABILITÉ & BILANS
-- -----------------------------------------------------------------------------

-- Indicateurs clés sur une période [p_from, p_to] (dates incluses).
CREATE PROCEDURE sp_financial_summary(IN p_from DATE, IN p_to DATE)
BEGIN
    DECLARE v_start DATETIME DEFAULT TIMESTAMP(p_from);
    DECLARE v_end   DATETIME DEFAULT TIMESTAMP(p_to + INTERVAL 1 DAY);
    DECLARE v_revenue, v_tax_out, v_cogs, v_gross_sales, v_discounts DECIMAL(16,2) DEFAULT 0;
    DECLARE v_opex, v_waste, v_tax_in_purch, v_tax_in_exp, v_cash_in, v_cash_out DECIMAL(16,2) DEFAULT 0;
    DECLARE v_tickets INT DEFAULT 0;

    SELECT COUNT(*), COALESCE(SUM(subtotal), 0), COALESCE(SUM(tax_total), 0), COALESCE(SUM(cost_total), 0),
           COALESCE(SUM(total), 0), COALESCE(SUM(discount_total), 0)
      INTO v_tickets, v_revenue, v_tax_out, v_cogs, v_gross_sales, v_discounts
      FROM sales WHERE status = 'COMPLETED' AND created_at >= v_start AND created_at < v_end;

    SELECT COALESCE(SUM(cm.amount - cm.tax_amount), 0) INTO v_opex
      FROM cash_movements cm JOIN cash_categories cc ON cc.id = cm.category_id
     WHERE cc.is_operating_expense = 1 AND cm.direction = 'OUT'
       AND cm.occurred_at >= v_start AND cm.occurred_at < v_end;

    SELECT COALESCE(SUM(-quantity * unit_cost), 0) INTO v_waste
      FROM stock_movements
     WHERE movement_type IN ('WASTE','ADJUSTMENT_OUT') AND created_at >= v_start AND created_at < v_end;
    -- Les ajustements positifs compensent les ajustements négatifs.
    SELECT v_waste - COALESCE(SUM(quantity * unit_cost), 0) INTO v_waste
      FROM stock_movements
     WHERE movement_type = 'ADJUSTMENT_IN' AND created_at >= v_start AND created_at < v_end;

    SELECT COALESCE(SUM(tax_total), 0) INTO v_tax_in_purch
      FROM purchases WHERE status = 'RECEIVED' AND received_at >= v_start AND received_at < v_end;
    SELECT COALESCE(SUM(tax_amount), 0) INTO v_tax_in_exp
      FROM cash_movements WHERE direction = 'OUT' AND occurred_at >= v_start AND occurred_at < v_end;

    SELECT COALESCE(SUM(IF(direction = 'IN', amount, 0)), 0), COALESCE(SUM(IF(direction = 'OUT', amount, 0)), 0)
      INTO v_cash_in, v_cash_out
      FROM cash_movements WHERE occurred_at >= v_start AND occurred_at < v_end;

    SELECT p_from AS period_from, p_to AS period_to,
           v_tickets                                         AS tickets,
           v_gross_sales                                     AS revenue_gross,
           v_revenue                                         AS revenue_net,
           v_discounts                                       AS discounts,
           v_cogs                                            AS cogs,
           v_revenue - v_cogs                                AS gross_margin,
           ROUND(IF(v_revenue > 0, (v_revenue - v_cogs) / v_revenue * 100, 0), 2) AS gross_margin_pct,
           v_opex                                            AS operating_expenses,
           v_waste                                           AS shrinkage_cost,
           v_revenue - v_cogs - v_opex - v_waste             AS net_margin,
           ROUND(IF(v_revenue > 0, (v_revenue - v_cogs - v_opex - v_waste) / v_revenue * 100, 0), 2) AS net_margin_pct,
           v_tax_out                                         AS tax_collected,
           v_tax_in_purch + v_tax_in_exp                     AS tax_deductible,
           v_tax_out - v_tax_in_purch - v_tax_in_exp         AS tax_due,
           v_cash_in                                         AS cash_in,
           v_cash_out                                        AS cash_out,
           v_cash_in - v_cash_out                            AS net_cash_flow,
           ROUND(IF(v_tickets > 0, v_gross_sales / v_tickets, 0), 2) AS avg_basket;
END$$

-- Bilan périodique : p_granularity = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
CREATE PROCEDURE sp_period_report(IN p_granularity VARCHAR(5), IN p_from DATE, IN p_to DATE)
BEGIN
    DECLARE v_fmt VARCHAR(10);
    DECLARE v_start DATETIME DEFAULT TIMESTAMP(p_from);
    DECLARE v_end   DATETIME DEFAULT TIMESTAMP(p_to + INTERVAL 1 DAY);

    SET v_fmt = CASE UPPER(p_granularity)
                    WHEN 'DAY'   THEN '%Y-%m-%d'
                    WHEN 'WEEK'  THEN '%x-W%v'
                    WHEN 'MONTH' THEN '%Y-%m'
                    WHEN 'YEAR'  THEN '%Y' END;
    IF v_fmt IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.invalidGranularity';
    END IF;

    SELECT k.period,
           COALESCE(s.tickets, 0)        AS tickets,
           COALESCE(s.revenue_net, 0)    AS revenue_net,
           COALESCE(s.tax_collected, 0)  AS tax_collected,
           COALESCE(s.cogs, 0)           AS cogs,
           COALESCE(s.revenue_net, 0) - COALESCE(s.cogs, 0) AS gross_margin,
           COALESCE(e.opex, 0)           AS operating_expenses,
           COALESCE(w.shrinkage, 0)      AS shrinkage_cost,
           COALESCE(e.tax_paid_exp, 0) + COALESCE(pu.tax_paid, 0) AS tax_deductible,
           COALESCE(s.revenue_net, 0) - COALESCE(s.cogs, 0) - COALESCE(e.opex, 0)
             - COALESCE(w.shrinkage, 0)  AS net_margin
      FROM (
            SELECT DATE_FORMAT(created_at, v_fmt) AS period FROM sales
             WHERE status = 'COMPLETED' AND created_at >= v_start AND created_at < v_end
            UNION
            SELECT DATE_FORMAT(occurred_at, v_fmt) FROM cash_movements
             WHERE occurred_at >= v_start AND occurred_at < v_end
            UNION
            SELECT DATE_FORMAT(received_at, v_fmt) FROM purchases
             WHERE status = 'RECEIVED' AND received_at >= v_start AND received_at < v_end
           ) k
      LEFT JOIN (
            SELECT DATE_FORMAT(created_at, v_fmt) AS period, COUNT(*) AS tickets,
                   SUM(subtotal) AS revenue_net, SUM(tax_total) AS tax_collected, SUM(cost_total) AS cogs
              FROM sales WHERE status = 'COMPLETED' AND created_at >= v_start AND created_at < v_end
             GROUP BY 1) s ON s.period = k.period
      LEFT JOIN (
            SELECT DATE_FORMAT(cm.occurred_at, v_fmt) AS period,
                   SUM(IF(cc.is_operating_expense = 1 AND cm.direction = 'OUT', cm.amount - cm.tax_amount, 0)) AS opex,
                   SUM(IF(cm.direction = 'OUT', cm.tax_amount, 0)) AS tax_paid_exp
              FROM cash_movements cm JOIN cash_categories cc ON cc.id = cm.category_id
             WHERE cm.occurred_at >= v_start AND cm.occurred_at < v_end
             GROUP BY 1) e ON e.period = k.period
      LEFT JOIN (
            SELECT DATE_FORMAT(created_at, v_fmt) AS period, ROUND(SUM(-quantity * unit_cost), 2) AS shrinkage
              FROM stock_movements
             WHERE movement_type IN ('WASTE','ADJUSTMENT_OUT','ADJUSTMENT_IN')
               AND created_at >= v_start AND created_at < v_end
             GROUP BY 1) w ON w.period = k.period
      LEFT JOIN (
            SELECT DATE_FORMAT(received_at, v_fmt) AS period, SUM(tax_total) AS tax_paid
              FROM purchases WHERE status = 'RECEIVED' AND received_at >= v_start AND received_at < v_end
             GROUP BY 1) pu ON pu.period = k.period
     ORDER BY k.period;
END$$

-- Rapport de taxes par taux : collectée vs déductible.
CREATE PROCEDURE sp_tax_report(IN p_from DATE, IN p_to DATE)
BEGIN
    SELECT t.code, t.name, t.tax_type, t.rate,
           COALESCE(SUM(IF(l.flow = 'COLLECTED', l.taxable_amount, 0)), 0) AS taxable_sales,
           COALESCE(SUM(IF(l.flow = 'COLLECTED', l.tax_amount, 0)), 0)     AS tax_collected,
           COALESCE(SUM(IF(l.flow = 'PAID', l.taxable_amount, 0)), 0)      AS taxable_purchases,
           COALESCE(SUM(IF(l.flow = 'PAID', l.tax_amount, 0)), 0)          AS tax_paid,
           COALESCE(SUM(IF(l.flow = 'COLLECTED', l.tax_amount, -l.tax_amount)), 0) AS tax_due
      FROM taxes t
      LEFT JOIN v_tax_ledger l ON l.tax_id = t.id AND l.tax_date BETWEEN p_from AND p_to
     GROUP BY t.id, t.code, t.name, t.tax_type, t.rate
     ORDER BY t.code;
END$$

-- Top produits (CA, marge, quantités) pour le dashboard.
CREATE PROCEDURE sp_top_products(IN p_from DATE, IN p_to DATE, IN p_limit INT)
BEGIN
    SELECT si.product_id, MAX(si.product_name) AS product_name,
           SUM(si.quantity) AS qty_sold, SUM(si.net_amount) AS revenue_net,
           ROUND(SUM(si.net_amount - si.quantity * si.unit_cost), 2) AS gross_margin
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED' AND s.created_at >= p_from AND s.created_at < p_to + INTERVAL 1 DAY
     GROUP BY si.product_id
     ORDER BY revenue_net DESC
     LIMIT p_limit;
END$$

-- Bénéfice par produit et par mois : quantités, CA HT, coût réel (FEFO) et bénéfice des ventes non annulées.
-- Les prix d'achat et de vente actuels de la fiche produit sont joints pour comparaison.
CREATE PROCEDURE sp_product_profit(IN p_from DATE, IN p_to DATE)
BEGIN
    SELECT si.product_id,
           DATE_FORMAT(s.created_at, '%Y-%m') AS month,
           MAX(si.product_name) AS product_name,
           p.sku, p.purchase_price, p.avg_cost, p.sale_price,
           SUM(si.quantity) AS qty_sold,
           ROUND(SUM(si.net_amount), 2) AS revenue_net,
           ROUND(SUM(si.quantity * si.unit_cost), 2) AS cost,
           ROUND(SUM(si.net_amount - si.quantity * si.unit_cost), 2) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
     WHERE s.status = 'COMPLETED' AND s.created_at >= p_from AND s.created_at < p_to + INTERVAL 1 DAY
     GROUP BY si.product_id, month, p.sku, p.purchase_price, p.avg_cost, p.sale_price
     ORDER BY month, profit DESC;
END$$

-- -----------------------------------------------------------------------------
-- SMART AGENT : moteur de règles côté base
-- Chaque règle fait un upsert dans smart_alerts (dedupe_key) puis sp_agent_run
-- résout les alertes qui n'ont pas été revues pendant le passage.
-- -----------------------------------------------------------------------------

CREATE PROCEDURE sp_agent_upsert_alert(
    IN p_type VARCHAR(20), IN p_severity VARCHAR(10), IN p_product_id INT UNSIGNED,
    IN p_batch_id BIGINT UNSIGNED, IN p_dedupe VARCHAR(120), IN p_message_key VARCHAR(80),
    IN p_payload JSON, IN p_score DECIMAL(10,3))
BEGIN
    INSERT INTO smart_alerts (alert_type, severity, product_id, batch_id, dedupe_key, message_key, payload, score)
    VALUES (p_type, p_severity, p_product_id, p_batch_id, p_dedupe, p_message_key, p_payload, p_score)
    ON DUPLICATE KEY UPDATE
        severity     = VALUES(severity),
        payload      = VALUES(payload),
        score        = VALUES(score),
        last_seen_at = CURRENT_TIMESTAMP(6),
        status       = IF(status = 'RESOLVED', 'NEW', status);
END$$

-- Règle 1 : stock faible / rupture.
CREATE PROCEDURE sp_agent_rule_low_stock()
BEGIN
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT IF(p.stock_qty <= 0, 'OUT_OF_STOCK', 'LOW_STOCK'),
           IF(p.stock_qty <= 0, 'CRITICAL', 'WARNING'),
           p.id,
           CONCAT('STOCK:', p.id),
           IF(p.stock_qty <= 0, 'agent.outOfStock', 'agent.lowStock'),
           JSON_OBJECT('product', p.name, 'stock', p.stock_qty, 'min', p.min_stock),
           IF(p.stock_qty <= 0, 100, 50 + 50 * (1 - p.stock_qty / NULLIF(p.min_stock, 0)))
      FROM products p
     WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.min_stock > 0 AND p.stock_qty <= p.min_stock
    ON DUPLICATE KEY UPDATE
        alert_type = VALUES(alert_type), severity = VALUES(severity), message_key = VALUES(message_key),
        payload = VALUES(payload), score = VALUES(score), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);
END$$

-- Règle 2 : lots périmés ou proches de la péremption.
CREATE PROCEDURE sp_agent_rule_expiry()
BEGIN
    DECLARE v_days INT DEFAULT COALESCE(CAST(fn_setting('expiry_alert_days') AS UNSIGNED), 30);

    INSERT INTO smart_alerts (alert_type, severity, product_id, batch_id, dedupe_key, message_key, payload, score)
    SELECT IF(b.expiry_date < CURDATE(), 'EXPIRED', 'NEAR_EXPIRY'),
           CASE WHEN b.expiry_date < CURDATE() THEN 'CRITICAL'
                WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 7 THEN 'WARNING' ELSE 'INFO' END,
           p.id, b.id,
           CONCAT('EXPIRY:', b.id),
           IF(b.expiry_date < CURDATE(), 'agent.expired', 'agent.nearExpiry'),
           JSON_OBJECT('product', p.name, 'batch', b.batch_no, 'expiry', b.expiry_date,
                       'daysLeft', DATEDIFF(b.expiry_date, CURDATE()), 'qty', b.qty_remaining,
                       'valueAtRisk', ROUND(b.qty_remaining * b.unit_cost, 2)),
           GREATEST(0, 100 - DATEDIFF(b.expiry_date, CURDATE()) * 100 / v_days)
      FROM product_batches b
      JOIN products p ON p.id = b.product_id AND p.deleted_at IS NULL
     WHERE b.qty_remaining > 0 AND b.expiry_date IS NOT NULL
       AND b.expiry_date <= CURDATE() + INTERVAL v_days DAY
    ON DUPLICATE KEY UPDATE
        alert_type = VALUES(alert_type), severity = VALUES(severity), message_key = VALUES(message_key),
        payload = VALUES(payload), score = VALUES(score), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);
END$$

-- Règle 3 : recommandations de réapprovisionnement selon la vélocité des ventes.
--   vélocité  = qté vendue sur N jours / N
--   besoin    = vélocité x (délai fournisseur + jours de couverture) + seuil mini
--   à commander = besoin - stock, au minimum reorder_qty quand le seuil est atteint
CREATE PROCEDURE sp_agent_rule_reorder()
BEGIN
    DECLARE v_lookback INT DEFAULT COALESCE(CAST(fn_setting('agent_velocity_days') AS UNSIGNED), 28);
    DECLARE v_cover INT DEFAULT COALESCE(CAST(fn_setting('agent_coverage_days') AS UNSIGNED), 14);

    DROP TEMPORARY TABLE IF EXISTS tmp_velocity;
    CREATE TEMPORARY TABLE tmp_velocity AS
    SELECT p.id AS product_id, p.name, p.stock_qty, p.min_stock, p.reorder_qty, p.avg_cost,
           COALESCE(sup.lead_time_days, 3) AS lead_days, sup.id AS supplier_id, sup.name AS supplier_name,
           COALESCE(v.qty, 0) / v_lookback AS velocity
      FROM products p
      LEFT JOIN suppliers sup ON sup.id = p.default_supplier_id
      LEFT JOIN (SELECT si.product_id, SUM(si.quantity) AS qty
                   FROM sale_items si JOIN sales s ON s.id = si.sale_id
                  WHERE s.status = 'COMPLETED' AND s.created_at >= NOW() - INTERVAL v_lookback DAY
                  GROUP BY si.product_id) v ON v.product_id = p.id
     WHERE p.is_active = 1 AND p.deleted_at IS NULL;

    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'REORDER',
           IF(x.days_left <= x.lead_days, 'CRITICAL', 'WARNING'),
           x.product_id,
           CONCAT('REORDER:', x.product_id),
           'agent.reorder',
           JSON_OBJECT('product', x.name, 'stock', x.stock_qty, 'velocityPerDay', ROUND(x.velocity, 3),
                       'daysOfStockLeft', ROUND(x.days_left, 1), 'leadTimeDays', x.lead_days,
                       'suggestedQty', x.suggested, 'estimatedCost', ROUND(x.suggested * x.avg_cost, 2),
                       'supplierId', x.supplier_id, 'supplier', x.supplier_name),
           LEAST(100, 100 * x.lead_days / GREATEST(x.days_left, 0.1))
      FROM (SELECT t.*,
                   IF(t.velocity > 0, t.stock_qty / t.velocity, 9999) AS days_left,
                   CEIL(GREATEST(
                        t.velocity * (t.lead_days + v_cover) + t.min_stock - t.stock_qty,
                        IF(t.stock_qty <= t.min_stock, t.reorder_qty, 0), 0)) AS suggested
              FROM tmp_velocity t) x
     WHERE x.suggested > 0
       AND (x.stock_qty <= x.min_stock OR x.days_left <= x.lead_days + v_cover / 2)
    ON DUPLICATE KEY UPDATE
        severity = VALUES(severity), payload = VALUES(payload), score = VALUES(score),
        last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status);

    DROP TEMPORARY TABLE IF EXISTS tmp_velocity;
END$$

-- Règle 4 : anomalies de stock.
--   a) stock négatif (ventes sans stock enregistré)
--   b) pertes de la semaine > 3x la moyenne hebdomadaire des 8 semaines précédentes
--   c) ventes à marge négative (prix < coût)
--   d) caissier avec un nombre anormal d'annulations sur 24 h
--   e) écart lots / stock produit (incohérence de données)
CREATE PROCEDURE sp_agent_rule_anomalies()
BEGIN
    DECLARE v_mult DECIMAL(6,2) DEFAULT COALESCE(CAST(fn_setting('agent_waste_multiplier') AS DECIMAL(6,2)), 3);
    DECLARE v_voids INT DEFAULT COALESCE(CAST(fn_setting('agent_max_voids_per_day') AS UNSIGNED), 5);

    -- a) stock négatif
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'ANOMALY', 'CRITICAL', p.id, CONCAT('ANOMALY:NEG:', p.id), 'agent.anomaly.negativeStock',
           JSON_OBJECT('product', p.name, 'stock', p.stock_qty), 95
      FROM products p WHERE p.stock_qty < 0 AND p.deleted_at IS NULL
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);

    -- b) pertes anormales
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'ANOMALY', 'WARNING', w.product_id, CONCAT('ANOMALY:WASTE:', w.product_id), 'agent.anomaly.abnormalWaste',
           JSON_OBJECT('product', p.name, 'wasteLast7d', w.recent, 'weeklyAverage', ROUND(w.baseline, 3),
                       'costLast7d', ROUND(w.recent_cost, 2)),
           LEAST(90, 50 + 10 * w.recent / GREATEST(w.baseline, 0.001))
      FROM (SELECT product_id,
                   SUM(IF(created_at >= NOW() - INTERVAL 7 DAY, -quantity, 0)) AS recent,
                   SUM(IF(created_at >= NOW() - INTERVAL 7 DAY, -quantity * unit_cost, 0)) AS recent_cost,
                   SUM(IF(created_at < NOW() - INTERVAL 7 DAY, -quantity, 0)) / 8 AS baseline
              FROM stock_movements
             WHERE movement_type IN ('WASTE','ADJUSTMENT_OUT') AND created_at >= NOW() - INTERVAL 63 DAY
             GROUP BY product_id) w
      JOIN products p ON p.id = w.product_id
     WHERE w.recent > 0 AND w.recent > v_mult * GREATEST(w.baseline, 1)
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), score = VALUES(score),
        last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status);

    -- c) ventes à perte sur 7 jours
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'ANOMALY', 'WARNING', si.product_id, CONCAT('ANOMALY:MARGIN:', si.product_id), 'agent.anomaly.negativeMargin',
           JSON_OBJECT('product', MAX(si.product_name), 'lines', COUNT(*),
                       'loss', ROUND(SUM(si.quantity * si.unit_cost - si.net_amount), 2)),
           70
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED' AND s.created_at >= NOW() - INTERVAL 7 DAY
       AND si.promotion_id IS NULL AND si.net_amount < si.quantity * si.unit_cost
     GROUP BY si.product_id
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);

    -- d) annulations suspectes
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'ANOMALY', 'CRITICAL', NULL, CONCAT('ANOMALY:VOIDS:', s.user_id, ':', CURDATE()), 'agent.anomaly.manyVoids',
           JSON_OBJECT('userId', s.user_id, 'user', MAX(u.full_name), 'voids', COUNT(*), 'amount', SUM(s.total)),
           85
      FROM sales s JOIN users u ON u.id = s.user_id
     WHERE s.status = 'VOIDED' AND s.voided_at >= NOW() - INTERVAL 1 DAY
     GROUP BY s.user_id HAVING COUNT(*) > v_voids
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);

    -- e) incohérence lots / stock
    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'ANOMALY', 'INFO', p.id, CONCAT('ANOMALY:BATCH:', p.id), 'agent.anomaly.batchMismatch',
           JSON_OBJECT('product', p.name, 'stock', p.stock_qty, 'batches', b.total), 40
      FROM products p
      JOIN (SELECT product_id, SUM(qty_remaining) AS total FROM product_batches GROUP BY product_id) b
        ON b.product_id = p.id
     WHERE p.stock_qty >= 0 AND ABS(p.stock_qty - b.total) > 0.001
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), last_seen_at = CURRENT_TIMESTAMP(6),
        status = IF(status = 'RESOLVED', 'NEW', status);
END$$

-- Règle 5 : suggestions de promotions.
--   * proche péremption : remise graduée selon les jours restants
--   * rotation lente   : couverture de stock > agent_slow_mover_days jours
CREATE PROCEDURE sp_agent_rule_promotions()
BEGIN
    DECLARE v_slow_days INT DEFAULT COALESCE(CAST(fn_setting('agent_slow_mover_days') AS UNSIGNED), 90);

    INSERT INTO smart_alerts (alert_type, severity, product_id, batch_id, dedupe_key, message_key, payload, score)
    SELECT 'PROMOTION', 'INFO', p.id, b.id, CONCAT('PROMO:EXPIRY:', b.id), 'agent.promo.nearExpiry',
           JSON_OBJECT('product', p.name, 'daysLeft', DATEDIFF(b.expiry_date, CURDATE()), 'qty', b.qty_remaining,
                       'currentPrice', p.sale_price, 'suggestedDiscountPct', x.pct,
                       'suggestedPrice', ROUND(p.sale_price * (1 - x.pct / 100), 2),
                       'floorPrice', ROUND(b.unit_cost, 2), 'reason', 'NEAR_EXPIRY',
                       'endsAt', b.expiry_date),
           60 + x.pct / 2
      FROM product_batches b
      JOIN products p ON p.id = b.product_id AND p.is_active = 1 AND p.deleted_at IS NULL
      JOIN LATERAL (SELECT CASE WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 3  THEN 50
                                WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 7  THEN 30
                                ELSE 15 END AS pct) x
     WHERE b.qty_remaining > 0 AND b.expiry_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 14 DAY
       AND NOT EXISTS (SELECT 1 FROM promotions pr WHERE pr.product_id = p.id AND pr.is_active = 1
                          AND NOW() BETWEEN pr.starts_at AND pr.ends_at)
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), score = VALUES(score),
        last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status);

    INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
    SELECT 'PROMOTION', 'INFO', x.id, CONCAT('PROMO:SLOW:', x.id), 'agent.promo.slowMoving',
           JSON_OBJECT('product', x.name, 'stock', x.stock_qty, 'soldLast30d', x.sold30,
                       'daysOfCover', IF(x.sold30 > 0, ROUND(x.stock_qty / (x.sold30 / 30), 0), NULL),
                       'stockValue', ROUND(x.stock_qty * x.avg_cost, 2),
                       'currentPrice', x.sale_price,
                       'suggestedDiscountPct', IF(x.sold30 = 0, 20, 10),
                       'suggestedPrice', ROUND(x.sale_price * (1 - IF(x.sold30 = 0, 20, 10) / 100), 2),
                       'reason', 'SLOW_MOVING'),
           LEAST(55, 20 + x.stock_qty * x.avg_cost / 100)
      FROM (SELECT p.id, p.name, p.stock_qty, p.avg_cost, p.sale_price,
                   COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                              WHERE si.product_id = p.id AND s.status = 'COMPLETED'
                                AND s.created_at >= NOW() - INTERVAL 30 DAY), 0) AS sold30
              FROM products p
             WHERE p.is_active = 1 AND p.deleted_at IS NULL AND p.stock_qty > 0
               AND p.created_at <= NOW() - INTERVAL 30 DAY) x
     WHERE (x.sold30 = 0 OR x.stock_qty / (x.sold30 / 30) > v_slow_days)
       -- la remise suggérée doit rester au-dessus du coût
       AND x.sale_price * (1 - IF(x.sold30 = 0, 20, 10) / 100) > x.avg_cost
    ON DUPLICATE KEY UPDATE payload = VALUES(payload), score = VALUES(score),
        last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status);
END$$

-- Règle 6 : analyse de panier (cross-selling).
--   support    = tickets contenant A et B / tickets
--   confidence = tickets A et B / tickets A
--   lift       = confidence / P(B)   (> 1 : achetés ensemble plus que par hasard)
CREATE PROCEDURE sp_agent_rule_associations()
BEGIN
    DECLARE v_days INT DEFAULT COALESCE(CAST(fn_setting('agent_basket_days') AS UNSIGNED), 90);
    DECLARE v_min_pairs INT DEFAULT COALESCE(CAST(fn_setting('agent_min_pair_count') AS UNSIGNED), 3);
    DECLARE v_tx INT;
    DECLARE v_now DATETIME DEFAULT NOW();

    DROP TEMPORARY TABLE IF EXISTS tmp_basket;
    CREATE TEMPORARY TABLE tmp_basket (sale_id BIGINT UNSIGNED, product_id INT UNSIGNED,
                                       PRIMARY KEY (sale_id, product_id), KEY (product_id)) ENGINE=InnoDB;
    INSERT IGNORE INTO tmp_basket
    SELECT si.sale_id, si.product_id
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED' AND s.created_at >= NOW() - INTERVAL v_days DAY;

    SELECT COUNT(DISTINCT sale_id) INTO v_tx FROM tmp_basket;

    IF v_tx > 0 THEN
        DROP TEMPORARY TABLE IF EXISTS tmp_item_freq;
        CREATE TEMPORARY TABLE tmp_item_freq (product_id INT UNSIGNED PRIMARY KEY, cnt INT) ENGINE=InnoDB;
        INSERT INTO tmp_item_freq SELECT product_id, COUNT(*) FROM tmp_basket GROUP BY product_id;
        DROP TEMPORARY TABLE IF EXISTS tmp_item_freq2;
        CREATE TEMPORARY TABLE tmp_item_freq2 LIKE tmp_item_freq;
        INSERT INTO tmp_item_freq2 SELECT * FROM tmp_item_freq;

        DROP TEMPORARY TABLE IF EXISTS tmp_basket2;
        CREATE TEMPORARY TABLE tmp_basket2 LIKE tmp_basket;
        INSERT INTO tmp_basket2 SELECT * FROM tmp_basket;

        DELETE FROM product_associations;
        INSERT INTO product_associations (product_id, associated_id, pair_count, support, confidence, lift, computed_at)
        SELECT a.product_id, b.product_id, COUNT(*) AS pairs,
               COUNT(*) / v_tx,
               COUNT(*) / fa.cnt,
               (COUNT(*) / fa.cnt) / (fb.cnt / v_tx),
               v_now
          FROM tmp_basket a
          JOIN tmp_basket2 b ON b.sale_id = a.sale_id AND b.product_id <> a.product_id
          JOIN tmp_item_freq fa ON fa.product_id = a.product_id
          -- MySQL ne peut pas rouvrir une table temporaire dans une requête : d'où les copies *2
          JOIN tmp_item_freq2 fb ON fb.product_id = b.product_id
         GROUP BY a.product_id, b.product_id, fa.cnt, fb.cnt
        HAVING COUNT(*) >= v_min_pairs;

        -- Une recommandation par paire forte (lift > 1.2, ordre canonique A < B)
        INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
        SELECT 'CROSS_SELL', 'INFO', pa.product_id, CONCAT('XSELL:', pa.product_id, ':', pa.associated_id),
               'agent.crossSell',
               JSON_OBJECT('product', p1.name, 'associatedId', pa.associated_id, 'associated', p2.name,
                           'pairCount', pa.pair_count, 'confidencePct', ROUND(pa.confidence * 100, 1),
                           'lift', ROUND(pa.lift, 2)),
               LEAST(50, 10 * pa.lift)
          FROM product_associations pa
          JOIN products p1 ON p1.id = pa.product_id
          JOIN products p2 ON p2.id = pa.associated_id
         WHERE pa.lift > 1.2 AND pa.product_id < pa.associated_id
        ON DUPLICATE KEY UPDATE payload = VALUES(payload), score = VALUES(score),
            last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status);

        DROP TEMPORARY TABLE IF EXISTS tmp_item_freq;
        DROP TEMPORARY TABLE IF EXISTS tmp_item_freq2;
        DROP TEMPORARY TABLE IF EXISTS tmp_basket2;
    END IF;
    DROP TEMPORARY TABLE IF EXISTS tmp_basket;
END$$

-- Orchestrateur : exécute toutes les règles et résout les alertes devenues caduques.
CREATE PROCEDURE sp_agent_run()
BEGIN
    DECLARE v_run_id BIGINT UNSIGNED;
    DECLARE v_start DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6);
    DECLARE v_upserted INT DEFAULT 0;
    DECLARE v_resolved INT DEFAULT 0;
    DECLARE v_err VARCHAR(500);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_err = MESSAGE_TEXT;
        ROLLBACK;
        UPDATE agent_runs SET status = 'FAILED', finished_at = CURRENT_TIMESTAMP(6), error_message = v_err
         WHERE id = v_run_id;
        RESIGNAL;
    END;

    INSERT INTO agent_runs (started_at) VALUES (v_start);
    SET v_run_id = LAST_INSERT_ID();

    START TRANSACTION;
    CALL sp_agent_rule_low_stock();
    CALL sp_agent_rule_expiry();
    CALL sp_agent_rule_reorder();
    CALL sp_agent_rule_anomalies();
    CALL sp_agent_rule_promotions();
    CALL sp_agent_rule_associations();

    SELECT COUNT(*) INTO v_upserted FROM smart_alerts WHERE last_seen_at >= v_start;

    -- Condition disparue => alerte résolue automatiquement (les alertes écartées restent écartées)
    -- Les alertes 'APP:%' appartiennent aux règles TypeScript du backend, qui les résolvent elles-mêmes.
    UPDATE smart_alerts SET status = 'RESOLVED', handled_at = NOW()
     WHERE status IN ('NEW','ACKNOWLEDGED') AND last_seen_at < v_start AND dedupe_key NOT LIKE 'APP:%';
    SET v_resolved = ROW_COUNT();
    COMMIT;

    UPDATE agent_runs
       SET status = 'SUCCESS', finished_at = CURRENT_TIMESTAMP(6),
           alerts_upserted = v_upserted, alerts_resolved = v_resolved
     WHERE id = v_run_id;

    SELECT alert_type, severity, COUNT(*) AS open_alerts
      FROM smart_alerts WHERE status IN ('NEW','ACKNOWLEDGED')
     GROUP BY alert_type, severity ORDER BY alert_type, severity;
END$$

-- Transforme une suggestion de promotion en promotion active.
CREATE PROCEDURE sp_agent_accept_promotion(IN p_alert_id BIGINT UNSIGNED, IN p_user_id INT UNSIGNED,
                                           OUT p_promotion_id INT UNSIGNED)
BEGIN
    DECLARE v_product INT UNSIGNED;
    DECLARE v_payload JSON;
    DECLARE v_type VARCHAR(20);
    DECLARE v_ends DATETIME;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

    START TRANSACTION;
    SELECT alert_type, product_id, payload INTO v_type, v_product, v_payload
      FROM smart_alerts WHERE id = p_alert_id AND status IN ('NEW','ACKNOWLEDGED') FOR UPDATE;
    IF v_type IS NULL OR v_type <> 'PROMOTION' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'errors.alertNotPromotion';
    END IF;

    SET v_ends = COALESCE(TIMESTAMP(CAST(JSON_UNQUOTE(JSON_EXTRACT(v_payload, '$.endsAt')) AS DATE)),
                          NOW() + INTERVAL 14 DAY);
    IF v_ends <= NOW() THEN SET v_ends = NOW() + INTERVAL 1 DAY; END IF;

    INSERT INTO promotions (product_id, discount_type, discount_value, reason, starts_at, ends_at,
                            source_alert_id, created_by)
    VALUES (v_product, 'PERCENT', JSON_EXTRACT(v_payload, '$.suggestedDiscountPct'),
            JSON_UNQUOTE(JSON_EXTRACT(v_payload, '$.reason')), NOW(), v_ends, p_alert_id, p_user_id);
    SET p_promotion_id = LAST_INSERT_ID();

    UPDATE smart_alerts SET status = 'RESOLVED', handled_by = p_user_id, handled_at = NOW()
     WHERE id = p_alert_id;
    COMMIT;
END$$

-- =============================================================================
-- 12. TRIGGERS D'AUDIT
-- L'application exécute  SET @app_user_id = <id>  à chaque requête authentifiée.
-- =============================================================================

CREATE TRIGGER trg_products_ai AFTER INSERT ON products FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES (@app_user_id, 'CREATE', 'product', NEW.id,
            JSON_OBJECT('sku', NEW.sku, 'name', NEW.name, 'purchase_price', NEW.purchase_price,
                        'sale_price', NEW.sale_price, 'min_stock', NEW.min_stock));
END$$

-- Seules les modifications de fiche sont auditées ici ; les variations de stock
-- sont déjà tracées dans stock_movements.
CREATE TRIGGER trg_products_au AFTER UPDATE ON products FOR EACH ROW
BEGIN
    IF NOT (OLD.name <=> NEW.name AND OLD.sku <=> NEW.sku AND OLD.barcode <=> NEW.barcode
            AND OLD.sale_price <=> NEW.sale_price AND OLD.min_stock <=> NEW.min_stock
            AND OLD.category_id <=> NEW.category_id AND OLD.is_active <=> NEW.is_active
            AND OLD.deleted_at <=> NEW.deleted_at AND OLD.reorder_qty <=> NEW.reorder_qty) THEN
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (@app_user_id, IF(NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL, 'DELETE', 'UPDATE'),
                'product', NEW.id,
                JSON_OBJECT('name', OLD.name, 'sku', OLD.sku, 'barcode', OLD.barcode, 'sale_price', OLD.sale_price,
                            'min_stock', OLD.min_stock, 'category_id', OLD.category_id, 'is_active', OLD.is_active),
                JSON_OBJECT('name', NEW.name, 'sku', NEW.sku, 'barcode', NEW.barcode, 'sale_price', NEW.sale_price,
                            'min_stock', NEW.min_stock, 'category_id', NEW.category_id, 'is_active', NEW.is_active));
    END IF;
END$$

CREATE TRIGGER trg_taxes_au AFTER UPDATE ON taxes FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@app_user_id, 'UPDATE', 'tax', NEW.id,
            JSON_OBJECT('rate', OLD.rate, 'tax_type', OLD.tax_type, 'is_active', OLD.is_active),
            JSON_OBJECT('rate', NEW.rate, 'tax_type', NEW.tax_type, 'is_active', NEW.is_active));
END$$

CREATE TRIGGER trg_settings_au AFTER UPDATE ON settings FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (@app_user_id, 'UPDATE', 'setting', NEW.setting_key,
            JSON_OBJECT('value', OLD.setting_value), JSON_OBJECT('value', NEW.setting_value));
END$$

CREATE TRIGGER trg_cash_sessions_au AFTER UPDATE ON cash_sessions FOR EACH ROW
BEGIN
    IF OLD.status = 'OPEN' AND NEW.status = 'CLOSED' THEN
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.closed_by, 'CLOSE_SESSION', 'cash_session', NEW.id,
                JSON_OBJECT('expected', NEW.expected_cash, 'counted', NEW.counted_cash,
                            'difference', NEW.difference));
    END IF;
END$$

DELIMITER ;

-- =============================================================================
-- 13. DONNÉES INITIALES
-- =============================================================================

INSERT INTO languages (code, name, native_name, direction, is_default, sort_order) VALUES
    ('en', 'English', 'English', 'ltr', 1, 1),
    ('ur', 'Urdu',    'اردو',    'rtl', 0, 2),
    ('ar', 'Arabic',  'العربية', 'rtl', 0, 3);

INSERT INTO roles (code, name, permissions) VALUES
    -- Administrateur : tout, y compris utilisateurs, rôles et droits
    ('ADMIN',   'Administrator', JSON_ARRAY('*')),
    -- Manager : toute l'activité et la comptabilité ; ajoute et gère les vendeurs
    ('MANAGER', 'Manager',       JSON_ARRAY('dashboard.view','pos.use','products.*','stock.*','purchases.*','suppliers.*',
                                            'customers.*','sales.*','cash.*','reports.*','agent.*','taxes.*',
                                            'settings.manage','users.manage_sellers','audit.view')),
    -- Vendeur : caisse ; annule ou corrige ses propres ventes de moins de 24 h ; aucune écriture comptable
    ('CASHIER', 'Seller',        JSON_ARRAY('pos.use','sales.view_own','sales.void_own','customers.view','customers.create',
                                            'cash.session','products.view'));

-- admin / Admin@123 (bcrypt, coût 10) - changement imposé à la première connexion
INSERT INTO users (role_id, username, full_name, email, password_hash, preferred_language, must_change_password)
VALUES (1, 'admin', 'Administrator', 'admin@baqala.local',
        '$2b$10$vNOBA3iA2ClZHBxOAq2WuuyRA3MAINFzPrqJeORxEKZyQKaJpaEWW', 'en', 1);

INSERT INTO settings (setting_key, setting_value, value_type, description) VALUES
    ('store_name',              'BAQALA',  'string',  'Nom affiché sur les tickets'),
    ('store_address',           '',        'string',  'Adresse sur les tickets'),
    ('store_phone',             '',        'string',  'Téléphone sur les tickets'),
    ('store_tax_number',        '',        'string',  'N° fiscal (NTN / VAT)'),
    ('currency_code',           'PKR',     'string',  'Devise ISO 4217 (PKR, SAR, AED...)'),
    ('currency_decimals',       '2',       'int',     'Décimales affichées'),
    ('default_language',        'en',      'string',  'Langue par défaut'),
    ('prices_include_tax',      '1',       'bool',    '1 = prix de vente TTC, 0 = HT'),
    ('allow_negative_stock',    '0',       'bool',    'Autoriser la vente sans stock'),
    ('receipt_footer',          'Thank you!', 'string', 'Pied de ticket'),
    ('receipt_width_mm',        '80',      'int',     'Largeur imprimante thermique (58/80)'),
    ('expiry_alert_days',       '30',      'int',     'Alerte péremption (jours)'),
    ('agent_velocity_days',     '28',      'int',     'Fenêtre de calcul de la vélocité'),
    ('agent_coverage_days',     '14',      'int',     'Jours de stock visés après réassort'),
    ('agent_slow_mover_days',   '90',      'int',     'Couverture au-delà de laquelle un produit est lent'),
    ('agent_waste_multiplier',  '3',       'decimal', 'Seuil pertes anormales (x moyenne)'),
    ('agent_max_voids_per_day', '5',       'int',     'Annulations par caissier avant alerte'),
    ('agent_basket_days',       '90',      'int',     'Fenêtre d''analyse des paniers'),
    ('agent_min_pair_count',    '3',       'int',     'Occurrences minimales d''une paire'),
    ('agent_min_margin_pct',    '5',       'decimal', 'Marge minimale HT avant alerte (%)'),
    ('agent_cash_tolerance',    '200',     'decimal', 'Écart de caisse toléré (montant)'),
    ('agent_cash_tolerance_pct','0.5',     'decimal', 'Écart de caisse toléré (% des ventes)');

INSERT INTO document_sequences (doc_type, prefix, next_value, padding, reset_yearly, current_year) VALUES
    ('RECEIPT',  'TCK', 1, 6, 1, YEAR(CURDATE())),
    ('PURCHASE', 'PO',  1, 5, 1, YEAR(CURDATE())),
    ('CUSTOMER', 'CUS', 1, 5, 0, YEAR(CURDATE()));

INSERT INTO units (code, name, allows_decimal) VALUES
    ('PCS', 'Piece', 0), ('KG', 'Kilogram', 1), ('G', 'Gram', 0),
    ('L', 'Litre', 1), ('ML', 'Millilitre', 0), ('PACK', 'Pack', 0), ('BOX', 'Box', 0);

-- Taxes de base (taux modifiables dans l'application selon le pays)
INSERT INTO taxes (code, name, tax_type, rate, applies_to) VALUES
    ('VAT_STD',     'VAT / GST standard',      'PERCENT', 18.000, 'BOTH'),
    ('VAT_REDUCED', 'VAT / GST reduced',       'PERCENT',  5.000, 'BOTH'),
    ('VAT_ZERO',    'Zero-rated / exempt',     'PERCENT',  0.000, 'BOTH'),
    ('EXCISE',      'Excise duty (specific)',  'PERCENT', 20.000, 'SALES'),
    ('EXCISE_UNIT', 'Fixed levy per unit',     'FIXED',    5.000, 'SALES');

INSERT INTO tax_translations (tax_id, language_code, name) VALUES
    (1, 'ur', 'معیاری سیلز ٹیکس'),   (1, 'ar', 'ضريبة القيمة المضافة القياسية'),
    (2, 'ur', 'کم شرح سیلز ٹیکس'),   (2, 'ar', 'ضريبة القيمة المضافة المخفضة'),
    (3, 'ur', 'صفر شرح / مستثنیٰ'),  (3, 'ar', 'معفى / نسبة صفرية'),
    (4, 'ur', 'ایکسائز ڈیوٹی'),       (4, 'ar', 'ضريبة انتقائية'),
    (5, 'ur', 'فی یونٹ مقررہ محصول'), (5, 'ar', 'رسم ثابت لكل وحدة');

INSERT INTO categories (code, name, sort_order) VALUES
    ('GROCERY',   'Grocery',            1),
    ('DAIRY',     'Dairy & Eggs',       2),
    ('BAKERY',    'Bakery',             3),
    ('BEVERAGES', 'Beverages',          4),
    ('FRUITVEG',  'Fruits & Vegetables',5),
    ('MEAT',      'Meat & Poultry',     6),
    ('FROZEN',    'Frozen',             7),
    ('SNACKS',    'Snacks & Sweets',    8),
    ('HOUSEHOLD', 'Household',          9),
    ('PERSONAL',  'Personal Care',     10);

INSERT INTO category_translations (category_id, language_code, name) VALUES
    (1,'en','Grocery'),             (1,'ur','کریانہ'),            (1,'ar','بقالة'),
    (2,'en','Dairy & Eggs'),        (2,'ur','دودھ اور انڈے'),     (2,'ar','ألبان وبيض'),
    (3,'en','Bakery'),              (3,'ur','بیکری'),             (3,'ar','مخبوزات'),
    (4,'en','Beverages'),           (4,'ur','مشروبات'),           (4,'ar','مشروبات'),
    (5,'en','Fruits & Vegetables'), (5,'ur','پھل اور سبزیاں'),    (5,'ar','فواكه وخضروات'),
    (6,'en','Meat & Poultry'),      (6,'ur','گوشت اور مرغی'),     (6,'ar','لحوم ودواجن'),
    (7,'en','Frozen'),              (7,'ur','منجمد اشیاء'),        (7,'ar','مجمدات'),
    (8,'en','Snacks & Sweets'),     (8,'ur','اسنیکس اور مٹھائی'), (8,'ar','وجبات خفيفة وحلويات'),
    (9,'en','Household'),           (9,'ur','گھریلو اشیاء'),       (9,'ar','منظفات منزلية'),
    (10,'en','Personal Care'),      (10,'ur','ذاتی نگہداشت'),     (10,'ar','العناية الشخصية');

INSERT INTO cash_registers (code, name) VALUES ('POS-01', 'Main counter');

INSERT INTO cash_categories (code, name, direction, is_operating_expense, is_system) VALUES
    ('SALE',               'Sales receipts',          'IN',   0, 1),
    ('SALE_REFUND',        'Sale refunds / voids',    'OUT',  0, 1),
    ('CUSTOMER_REPAYMENT', 'Customer debt repayment', 'IN',   0, 1),
    ('SUPPLIER_PAYMENT',   'Supplier invoice payment','OUT',  0, 1),
    ('CASH_DEPOSIT',       'Cash added to drawer',    'IN',   0, 0),
    ('CASH_WITHDRAWAL',    'Cash removed / banked',   'OUT',  0, 0),
    ('OWNER_CONTRIBUTION', 'Owner contribution',      'IN',   0, 0),
    ('OWNER_DRAWING',      'Owner drawing',           'OUT',  0, 0),
    ('RENT',               'Rent',                    'OUT',  1, 0),
    ('SALARY',             'Salaries & wages',        'OUT',  1, 0),
    ('UTILITIES',          'Electricity, water, gas', 'OUT',  1, 0),
    ('TRANSPORT',          'Transport & delivery',    'OUT',  1, 0),
    ('MAINTENANCE',        'Maintenance & repairs',   'OUT',  1, 0),
    ('OTHER_EXPENSE',      'Other operating expense', 'OUT',  1, 0),
    ('OTHER_INCOME',       'Other income',            'IN',   0, 0);

-- Client comptoir (ventes anonymes)
INSERT INTO customers (code, full_name, is_walk_in) VALUES ('WALKIN', 'Walk-in customer', 1);

-- =============================================================================
-- Planification optionnelle du Smart Agent directement dans MySQL
-- (sinon le backend l'appelle via node-cron). Nécessite event_scheduler=ON.
-- =============================================================================
-- SET GLOBAL event_scheduler = ON;
-- CREATE EVENT ev_agent_hourly ON SCHEDULE EVERY 1 HOUR DO CALL baqala.sp_agent_run();
