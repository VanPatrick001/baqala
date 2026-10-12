-- Version finale : rôles Administrateur / Manager / Vendeur, suppression d'utilisateurs, bénéfice par produit et par mois.
ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL COMMENT 'Utilisateur supprimé (conservé pour l''historique des ventes)' AFTER last_login_at;

UPDATE roles SET name = 'Manager',
       permissions = JSON_ARRAY('dashboard.view','pos.use','products.*','stock.*','purchases.*','suppliers.*',
                                'customers.*','sales.*','cash.*','reports.*','agent.*','taxes.*',
                                'settings.manage','users.manage_sellers','audit.view')
 WHERE code = 'MANAGER';
UPDATE roles SET name = 'Seller',
       permissions = JSON_ARRAY('pos.use','sales.view_own','sales.void_own','customers.view','customers.create',
                                'cash.session','products.view')
 WHERE code = 'CASHIER';

DROP PROCEDURE IF EXISTS sp_product_profit;

DELIMITER $$
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
DELIMITER ;
