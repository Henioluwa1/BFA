-- ============================================================================
-- BFA Apartments Management System
-- Migration: 017_add_confirmation_token_to_reservations.sql
-- Description: Add a nullable unique confirmation token to reservations.
-- TiDB requires column creation and unique-index creation as separate DDL.
-- ============================================================================

-- Validate an existing column before treating IF NOT EXISTS as a successful
-- retry. A column created by a prior partial attempt must retain its exact
-- type, nullability, and position.
SET @confirmation_token_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'confirmation_token'
);
SET @confirmation_token_column_correct := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS AS token_column
  JOIN information_schema.COLUMNS AS reservation_code_column
    ON reservation_code_column.TABLE_SCHEMA = token_column.TABLE_SCHEMA
   AND reservation_code_column.TABLE_NAME = token_column.TABLE_NAME
   AND reservation_code_column.COLUMN_NAME = 'reservation_code'
  WHERE token_column.TABLE_SCHEMA = DATABASE()
    AND token_column.TABLE_NAME = 'reservations'
    AND token_column.COLUMN_NAME = 'confirmation_token'
    AND LOWER(token_column.DATA_TYPE) = 'varchar'
    AND token_column.CHARACTER_MAXIMUM_LENGTH = 64
    AND token_column.IS_NULLABLE = 'YES'
    AND token_column.ORDINAL_POSITION = reservation_code_column.ORDINAL_POSITION + 1
);
SET @ensure_confirmation_token_column := IF(
  @confirmation_token_column_exists = 0,
  'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(64) NULL AFTER reservation_code',
  IF(
    @confirmation_token_column_correct = 1,
    'SELECT 1',
    'BFA_MIGRATION_017_UNEXPECTED_CONFIRMATION_TOKEN_COLUMN_DEFINITION'
  )
);
PREPARE ensure_confirmation_token_column_stmt FROM @ensure_confirmation_token_column;
EXECUTE ensure_confirmation_token_column_stmt;
DEALLOCATE PREPARE ensure_confirmation_token_column_stmt;

-- Check the named index independently from the column. Reuse only the exact
-- single-column, full-length unique index; fail closed if the name is occupied
-- by an incompatible index definition.
SET @confirmation_token_index_entries := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'uq_res_confirmation_token'
);
SET @confirmation_token_index_correct_entries := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'uq_res_confirmation_token'
    AND NON_UNIQUE = 0
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'confirmation_token'
    AND SUB_PART IS NULL
);
SET @confirmation_token_unique_index_exists := (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'reservations'
      AND NON_UNIQUE = 0
    GROUP BY INDEX_NAME
    HAVING COUNT(*) = 1
      AND MIN(SEQ_IN_INDEX) = 1
      AND MAX(SEQ_IN_INDEX) = 1
      AND MAX(COLUMN_NAME = 'confirmation_token') = 1
      AND MAX(SUB_PART IS NULL) = 1
  ) AS confirmation_token_unique_indexes
);
SET @ensure_confirmation_token_index := IF(
  @confirmation_token_index_entries > 0,
  IF(
    @confirmation_token_index_entries = 1
      AND @confirmation_token_index_correct_entries = 1,
    'SELECT 1',
    'BFA_MIGRATION_017_UNEXPECTED_CONFIRMATION_TOKEN_INDEX_DEFINITION'
  ),
  IF(
    @confirmation_token_unique_index_exists > 0,
    'SELECT 1',
    'ALTER TABLE reservations ADD UNIQUE INDEX uq_res_confirmation_token (confirmation_token)'
  )
);
PREPARE ensure_confirmation_token_index_stmt FROM @ensure_confirmation_token_index;
EXECUTE ensure_confirmation_token_index_stmt;
DEALLOCATE PREPARE ensure_confirmation_token_index_stmt;
