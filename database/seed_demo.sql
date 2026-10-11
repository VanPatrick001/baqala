-- =============================================================================
--  BAQALA - seed_demo.sql (OPTIONNEL)
--  Jeu de données de démonstration : fournisseurs, produits, achat réceptionné,
--  session de caisse, ventes (dont crédit client), pertes, dépenses.
--  À exécuter APRÈS schema.sql :  mysql -u root -p baqala < seed_demo.sql
-- =============================================================================
USE baqala;
SET @app_user_id = 1;

INSERT INTO suppliers (name, contact_name, phone, lead_time_days) VALUES
    ('Al-Noor Wholesale', 'Imran Khan', '+92-300-0000001', 2),
    ('Fresh Dairy Co.',   'Sara Ahmed', '+92-300-0000002', 1);

INSERT INTO products (sku, barcode, name, category_id, unit_id, default_supplier_id,
                      sale_price, min_stock, reorder_qty, track_expiry) VALUES
    ('MILK-1L',  '8901000000011', 'Fresh milk 1L',        2, 1, 2, 220.00, 20, 48, 1),
    ('BREAD-L',  '8901000000028', 'Bread loaf',           3, 1, 2, 150.00, 10, 30, 1),
    ('EGGS-12',  '8901000000035', 'Eggs (12)',            2, 6, 2, 380.00, 10, 24, 1),
    ('RICE-5K',  '8901000000042', 'Basmati rice 5kg',     1, 1, 1, 1850.00, 5, 10, 0),
    ('COLA-1.5', '8901000000059', 'Cola 1.5L',            4, 1, 1, 180.00, 12, 24, 1),
    ('TEA-500',  '8901000000066', 'Black tea 500g',       1, 1, 1, 950.00,  5, 12, 0),
    ('SUGAR-1K', '8901000000073', 'Sugar 1kg',            1, 2, 1, 160.00, 15, 40, 0),
    ('SOAP-B',   '8901000000080', 'Bath soap',           10, 1, 1, 120.00,  8, 24, 0);

INSERT INTO product_translations (product_id, language_code, name) VALUES
    (1,'ur','تازہ دودھ 1 لیٹر'), (1,'ar','حليب طازج 1 لتر'),
    (2,'ur','ڈبل روٹی'),         (2,'ar','رغيف خبز'),
    (3,'ur','انڈے (12)'),        (3,'ar','بيض (12)'),
    (4,'ur','باسمتی چاول 5 کلو'), (4,'ar','أرز بسمتي 5 كغ'),
    (5,'ur','کولا 1.5 لیٹر'),     (5,'ar','كولا 1.5 لتر'),
    (6,'ur','کالی چائے 500 گرام'), (6,'ar','شاي أسود 500 غ'),
    (7,'ur','چینی 1 کلو'),        (7,'ar','سكر 1 كغ'),
    (8,'ur','نہانے کا صابن'),      (8,'ar','صابون استحمام');

-- Taxes : produits de base au taux réduit, cola = TVA + accise, savon = TVA standard
INSERT INTO product_taxes (product_id, tax_id) VALUES
    (1,3),(2,3),(3,3),(4,2),(5,1),(5,4),(6,2),(7,2),(8,1);

-- Achat fournisseur réceptionné (crée les lots et le stock)
CALL sp_next_document_number('PURCHASE', @po1);
INSERT INTO purchases (purchase_no, supplier_id, supplier_invoice_no, user_id) VALUES (@po1, 2, 'FD-1001', 1);
SET @pid1 = LAST_INSERT_ID();
INSERT INTO purchase_items (purchase_id, product_id, batch_no, expiry_date, quantity, unit_cost) VALUES
    (@pid1, 1, 'M-01', CURDATE() + INTERVAL 5 DAY,  40, 170),
    (@pid1, 2, 'B-01', CURDATE() + INTERVAL 2 DAY,  25, 110),
    (@pid1, 3, 'E-01', CURDATE() + INTERVAL 20 DAY, 30, 300);
CALL sp_receive_purchase(@pid1, 1);

CALL sp_next_document_number('PURCHASE', @po2);
INSERT INTO purchases (purchase_no, supplier_id, supplier_invoice_no, user_id) VALUES (@po2, 1, 'AN-5521', 1);
SET @pid2 = LAST_INSERT_ID();
INSERT INTO purchase_items (purchase_id, product_id, batch_no, expiry_date, quantity, unit_cost) VALUES
    (@pid2, 4, NULL,   NULL,                       12, 1500),
    (@pid2, 5, 'C-01', CURDATE() + INTERVAL 120 DAY, 30, 120),
    (@pid2, 6, NULL,   NULL,                       10, 780),
    (@pid2, 7, NULL,   NULL,                       50, 130),
    (@pid2, 8, NULL,   NULL,                       60, 80);
CALL sp_receive_purchase(@pid2, 1);
CALL sp_pay_supplier(@pid2, 20000, 'BANK', NULL, 1);

-- Client à crédit
INSERT INTO customers (code, full_name, phone, credit_limit) VALUES ('CUS-00001', 'Ahmed Raza', '+92-321-0000003', 5000);
UPDATE document_sequences SET next_value = 2 WHERE doc_type = 'CUSTOMER';

-- Ouverture de caisse et ventes
CALL sp_open_cash_session(1, 1, 5000, @sess);

CALL sp_pos_checkout(@sess, 1, NULL,
     '[{"product_id":1,"qty":2},{"product_id":2,"qty":1},{"product_id":3,"qty":1}]',
     '[{"method":"CASH","amount":1000}]', 'en', @s1, @r1);
CALL sp_pos_checkout(@sess, 1, NULL,
     '[{"product_id":1,"qty":1},{"product_id":2,"qty":2}]',
     '[{"method":"CARD","amount":520,"reference":"AUTH-123"}]', 'ar', @s2, @r2);
CALL sp_pos_checkout(@sess, 1, NULL,
     '[{"product_id":1,"qty":1},{"product_id":2,"qty":1},{"product_id":5,"qty":2}]',
     '[{"method":"CASH","amount":800}]', 'ur', @s3, @r3);
CALL sp_pos_checkout(@sess, 1, 2,
     '[{"product_id":4,"qty":1},{"product_id":7,"qty":2,"discount":20}]',
     '[{"method":"CASH","amount":500},{"method":"CREDIT","amount":1650}]', 'ur', @s4, @r4);
CALL sp_pos_checkout(@sess, 1, NULL,
     '[{"product_id":1,"qty":1},{"product_id":2,"qty":1},{"product_id":6,"qty":1}]',
     '[{"method":"CASH","amount":2000}]', 'en', @s5, @r5);
CALL sp_pos_checkout(@sess, 1, NULL,
     '[{"product_id":5,"qty":1},{"product_id":8,"qty":3}]',
     '[{"method":"MOBILE","amount":540}]', 'en', @s6, @r6);

-- Annulation d'un ticket
CALL sp_void_sale(@s6, 1, 'Customer changed mind');

-- Remboursement partiel de dette client
CALL sp_customer_repayment(2, 600, 'CASH', @sess, 1);

-- Pertes et ajustement d'inventaire
CALL sp_record_waste(2, 3, NULL, 'Stale bread', 1);
CALL sp_adjust_stock(8, 55, 'Monthly count', 1);

-- Dépenses (loyer payé par banque, électricité en espèces avec TVA déductible)
CALL sp_record_cash_movement(NULL,  'RENT',      'OUT', 'BANK', 45000, NULL, 'October rent', 1, @m1);
CALL sp_record_cash_movement(@sess, 'UTILITIES', 'OUT', 'CASH', 2360,  1,    'Electricity bill', 1, @m2);
