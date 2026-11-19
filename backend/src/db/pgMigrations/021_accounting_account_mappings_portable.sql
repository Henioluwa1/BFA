-- Migration: 021_accounting_account_mappings_portable.sql
-- Description: Make operational account mappings portable using natural account codes and add provider reference uniqueness

-- 1. Ensure mappings point to correct account IDs dynamically via natural account_code lookup
UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '1030' AND m.mapping_key = 'PAYMENT_CARD_CLEARING';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '1010' AND m.mapping_key = 'PAYMENT_BANK_TRANSFER';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '1020' AND m.mapping_key = 'PAYMENT_CASH_VAULT';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '1010' AND m.mapping_key = 'PAYMENT_DEFAULT_ASSET';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '2020' AND m.mapping_key = 'GUEST_DEFERRED_REVENUE';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '1200' AND m.mapping_key = 'ACCOUNTS_RECEIVABLE_GUEST';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '4010' AND m.mapping_key = 'ACCOMMODATION_REVENUE';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '4050' AND m.mapping_key = 'CANCELLATION_FEE_INCOME';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '2030' AND m.mapping_key = 'REFUNDABLE_SECURITY_DEPOSIT';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '2010' AND m.mapping_key = 'ACCOUNTS_PAYABLE_TRADE';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5010' AND m.mapping_key = 'EXPENSE_MAINTENANCE';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5020' AND m.mapping_key = 'EXPENSE_UTILITIES';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5030' AND m.mapping_key = 'EXPENSE_STAFF';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5040' AND m.mapping_key IN ('EXPENSE_SUPPLIES', 'EXPENSE_CLEANING');

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5050' AND m.mapping_key IN ('EXPENSE_PROPERTY', 'EXPENSE_ADMINISTRATION');

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5060' AND m.mapping_key = 'EXPENSE_MARKETING';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5010' AND m.mapping_key = 'EXPENSE_OTHER';

UPDATE accounting_account_mappings m SET account_id = a.id FROM chart_of_accounts a WHERE a.account_code = '5080' AND m.mapping_key = 'PAYMENT_GATEWAY_FEE';

-- 2. Add provider reference index on payment_transactions for webhook idempotency
CREATE INDEX IF NOT EXISTS idx_pay_provider_ref ON payment_transactions (provider, provider_reference);
