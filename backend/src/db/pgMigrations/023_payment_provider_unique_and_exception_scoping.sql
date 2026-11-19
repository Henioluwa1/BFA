-- Enforce unique provider references and add property scoping to exceptions.
-- Add the unique key before removing the supporting non-unique index so a
-- duplicate-data failure does not leave the table without either index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_provider_ref ON payment_transactions (provider, provider_reference);
DROP INDEX IF EXISTS idx_pay_provider_ref;

-- Add column, index, and foreign key separately. Each operation can be safely
-- retried if a later statement fails before the migration is recorded.
ALTER TABLE accounting_posting_exceptions
  ADD COLUMN IF NOT EXISTS property_id INT NULL;
CREATE INDEX IF NOT EXISTS idx_ape_property ON accounting_posting_exceptions (property_id);

DO $$ BEGIN
  ALTER TABLE accounting_posting_exceptions ADD CONSTRAINT fk_ape_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Populate the new scope from the durable posting record; retries only fill
-- rows that remain unset.
UPDATE accounting_posting_exceptions e
SET property_id = r.property_id
FROM accounting_subledger_posting_records r
WHERE e.posting_record_id = r.id
  AND e.property_id IS NULL
  AND r.property_id IS NOT NULL;
