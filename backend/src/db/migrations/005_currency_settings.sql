-- Migration: 005_currency_settings.sql
-- Description: Standardize company default currency to Nigerian Naira (NGN / ₦)

UPDATE system_settings 
SET setting_value = 'NGN' 
WHERE setting_key = 'default_currency';

INSERT INTO system_settings (category, setting_key, setting_value, description)
VALUES 
  ('company', 'currency_symbol', '₦', 'Primary currency display symbol'),
  ('company', 'currency_locale', 'en-NG', 'Default locale for financial currency formatting')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
