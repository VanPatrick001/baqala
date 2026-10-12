-- Annulation d'une vente dont la caisse est déjà clôturée (correction par le vendeur sous 24 h, ou par le manager)
DROP PROCEDURE IF EXISTS sp_void_sale;

DELIMITER $$
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
DELIMITER ;
