-- Migration: 023_payment_provider_unique_and_exception_scoping.sql
-- Description: Enforce unique constraint for payment provider transactions and add property scoping to posting exceptions

-- 1. Upgrade provider reference index to UNIQUE constraint on payment_transactions
-- Drop non-unique index idx_pay_provider_ref if exists
SET @exist_idx := (SELECT COUNT(*) FROM information_schema.statistics 
                   WHERE table_schema = DATABASE() 
                     AND table_name = 'payment_transactions' 
                     AND index_name = 'idx_pay_provider_ref');
SET @drop_sql := IF(@exist_idx > 0, 'ALTER TABLE payment_transactions DROP INDEX idx_pay_provider_ref', 'SELECT "idx_pay_provider_ref not found"');
PREPARE stmt1 FROM @drop_sql;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- Add UNIQUE key uq_pay_provider_ref (provider, provider_reference)
SET @exist_uq := (SELECT COUNT(*) FROM information_schema.statistics 
                  WHERE table_schema = DATABASE() 
                    AND table_name = 'payment_transactions' 
                    AND index_name = 'uq_pay_provider_ref');
SET @add_uq_sql := IF(@exist_uq = 0, 'ALTER TABLE payment_transactions ADD UNIQUE KEY uq_pay_provider_ref (provider, provider_reference)', 'SELECT "uq_pay_provider_ref already exists"');
PREPARE stmt2 FROM @add_uq_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 2. Add property_id to accounting_posting_exceptions for robust server-side property scoping
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = DATABASE() 
                     AND TABLE_NAME = 'accounting_posting_exceptions' 
                     AND COLUMN_NAME = 'property_id');
SET @add_col_sql := IF(@exist_col = 0, 
  'ALTER TABLE accounting_posting_exceptions ADD COLUMN property_id INT NULL AFTER source_entity_id, ADD INDEX idx_ape_property (property_id), ADD CONSTRAINT fk_ape_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL', 
  'SELECT "property_id already exists on accounting_posting_exceptions"');
PREPARE stmt3 FROM @add_col_sql;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 3. Populate existing exception property_ids from associated posting records
UPDATE accounting_posting_exceptions e
JOIN accounting_subledger_posting_records r ON e.posting_record_id = r.id
SET e.property_id = r.property_id
WHERE e.property_id IS NULL AND r.property_id IS NOT NULL;
