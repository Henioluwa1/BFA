-- Migration: 022_support_multinight_stays.sql
-- Description: Replace historical one-night-only CHECK constraints with the
--              minimum-one-night rule required for multi-night reservations.
-- TiDB exposes CHECK names and clauses through TIDB_CHECK_CONSTRAINTS.

-- Read the definitions of only the known reservation CHECK names. An unrelated
-- CHECK constraint is never selected or changed by this migration.
SET @check_one_night_stay_exists := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_one_night_stay'
);
SET @check_one_night_stay_is_one_night := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_one_night_stay'
    AND LOWER(REPLACE(REPLACE(CHECK_CLAUSE, '`', ''), ' ', '')) IN (
      '(datediff(check_out_date,check_in_date)=1)',
      'datediff(check_out_date,check_in_date)=1'
    )
);
SET @drop_one_night_stay := IF(
  @check_one_night_stay_exists = 0,
  'SELECT 1',
  IF(
    @check_one_night_stay_is_one_night > 0,
    'ALTER TABLE reservations DROP CONSTRAINT chk_one_night_stay',
    'BFA_MIGRATION_022_UNEXPECTED_CHK_ONE_NIGHT_STAY_DEFINITION'
  )
);
PREPARE drop_one_night_stay_stmt FROM @drop_one_night_stay;
EXECUTE drop_one_night_stay_stmt;
DEALLOCATE PREPARE drop_one_night_stay_stmt;

-- Support the older alias used by earlier migration variants as well.
SET @check_one_night_exists := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_one_night'
);
SET @check_one_night_is_one_night := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_one_night'
    AND LOWER(REPLACE(REPLACE(CHECK_CLAUSE, '`', ''), ' ', '')) IN (
      '(datediff(check_out_date,check_in_date)=1)',
      'datediff(check_out_date,check_in_date)=1'
    )
);
SET @drop_one_night := IF(
  @check_one_night_exists = 0,
  'SELECT 1',
  IF(
    @check_one_night_is_one_night > 0,
    'ALTER TABLE reservations DROP CONSTRAINT chk_one_night',
    'BFA_MIGRATION_022_UNEXPECTED_CHK_ONE_NIGHT_DEFINITION'
  )
);
PREPARE drop_one_night_stmt FROM @drop_one_night;
EXECUTE drop_one_night_stmt;
DEALLOCATE PREPARE drop_one_night_stmt;

-- chk_min_one_night is the target name. If a partial/older attempt left it
-- with the one-night-only expression, replace it. Reuse it only when its
-- definition is exactly the intended minimum-one-night rule.
SET @min_one_night_exists := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_min_one_night'
);
SET @min_one_night_is_correct := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_min_one_night'
    AND LOWER(REPLACE(REPLACE(CHECK_CLAUSE, '`', ''), ' ', '')) IN (
      '(datediff(check_out_date,check_in_date)>=1)',
      'datediff(check_out_date,check_in_date)>=1'
    )
);
SET @min_one_night_is_old_rule := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_min_one_night'
    AND LOWER(REPLACE(REPLACE(CHECK_CLAUSE, '`', ''), ' ', '')) IN (
      '(datediff(check_out_date,check_in_date)=1)',
      'datediff(check_out_date,check_in_date)=1'
    )
);
SET @replace_old_min_named_check := IF(
  @min_one_night_is_old_rule > 0,
  'ALTER TABLE reservations DROP CONSTRAINT chk_min_one_night',
  IF(
    @min_one_night_exists = 0 OR @min_one_night_is_correct > 0,
    'SELECT 1',
    'BFA_MIGRATION_022_UNEXPECTED_CHK_MIN_ONE_NIGHT_DEFINITION'
  )
);
PREPARE replace_old_min_named_check_stmt FROM @replace_old_min_named_check;
EXECUTE replace_old_min_named_check_stmt;
DEALLOCATE PREPARE replace_old_min_named_check_stmt;

-- Re-query after any conditional drop so retries and partial prior execution
-- safely converge on one correctly defined minimum-stay constraint.
SET @min_one_night_exists_after_drop := (
  SELECT COUNT(*) FROM information_schema.TIDB_CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND CONSTRAINT_NAME = 'chk_min_one_night'
);
SET @add_min_one_night := IF(
  @min_one_night_exists_after_drop = 0,
  'ALTER TABLE reservations ADD CONSTRAINT chk_min_one_night CHECK (DATEDIFF(check_out_date, check_in_date) >= 1)',
  'SELECT 1'
);
PREPARE add_min_one_night_stmt FROM @add_min_one_night;
EXECUTE add_min_one_night_stmt;
DEALLOCATE PREPARE add_min_one_night_stmt;
