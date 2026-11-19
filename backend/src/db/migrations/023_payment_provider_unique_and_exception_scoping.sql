-- Enforce unique provider references and add property scoping to exceptions.
-- Add the unique key before removing the supporting non-unique index so a
-- duplicate-data failure does not leave the table without either index.
SET @unique_idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions'
    AND INDEX_NAME = 'uq_pay_provider_ref' AND NON_UNIQUE = 0);
SET @add_unique_idx_sql := IF(@unique_idx_exists = 0,
  'ALTER TABLE payment_transactions ADD UNIQUE KEY uq_pay_provider_ref (provider, provider_reference)',
  'SELECT 1');
PREPARE stmt_add_unique_pay_idx FROM @add_unique_idx_sql;
EXECUTE stmt_add_unique_pay_idx;
DEALLOCATE PREPARE stmt_add_unique_pay_idx;

SET @old_idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_transactions'
    AND INDEX_NAME = 'idx_pay_provider_ref');
SET @drop_old_idx_sql := IF(@old_idx_exists > 0,
  'ALTER TABLE payment_transactions DROP INDEX idx_pay_provider_ref', 'SELECT 1');
PREPARE stmt_drop_old_pay_idx FROM @drop_old_idx_sql;
EXECUTE stmt_drop_old_pay_idx;
DEALLOCATE PREPARE stmt_drop_old_pay_idx;

-- Add column, index, and foreign key separately. Each operation can be safely
-- retried if a later statement fails before the migration is recorded.
ALTER TABLE accounting_posting_exceptions
  ADD COLUMN IF NOT EXISTS property_id INT NULL AFTER source_entity_id;
ALTER TABLE accounting_posting_exceptions
  ADD INDEX IF NOT EXISTS idx_ape_property (property_id);

SET @property_fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'accounting_posting_exceptions'
    AND CONSTRAINT_NAME = 'fk_ape_property' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @property_fk_sql := IF(@property_fk_exists = 0,
  'ALTER TABLE accounting_posting_exceptions ADD CONSTRAINT fk_ape_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt_ape_property_fk FROM @property_fk_sql;
EXECUTE stmt_ape_property_fk;
DEALLOCATE PREPARE stmt_ape_property_fk;

-- Populate the new scope from the durable posting record; retries only fill
-- rows that remain unset.
UPDATE accounting_posting_exceptions e
JOIN accounting_subledger_posting_records r ON e.posting_record_id = r.id
SET e.property_id = r.property_id
WHERE e.property_id IS NULL AND r.property_id IS NOT NULL;
