-- Migration: 022_support_multinight_stays.sql
-- Description: Relax 1-night CHECK constraint on reservations to support multi-night stays (DATEDIFF >= 1)

SET @exist1 := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                WHERE CONSTRAINT_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'reservations' 
                  AND CONSTRAINT_NAME = 'chk_one_night' 
                  AND CONSTRAINT_TYPE = 'CHECK');

SET @sql1 := IF(@exist1 > 0, 'ALTER TABLE reservations DROP CONSTRAINT chk_one_night', 'SELECT "chk_one_night does not exist"');
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @exist2 := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                WHERE CONSTRAINT_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'reservations' 
                  AND CONSTRAINT_NAME = 'chk_one_night_stay' 
                  AND CONSTRAINT_TYPE = 'CHECK');

SET @sql2 := IF(@exist2 > 0, 'ALTER TABLE reservations DROP CONSTRAINT chk_one_night_stay', 'SELECT "chk_one_night_stay does not exist"');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @exist3 := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                WHERE CONSTRAINT_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'reservations' 
                  AND CONSTRAINT_NAME = 'chk_min_one_night' 
                  AND CONSTRAINT_TYPE = 'CHECK');

SET @sql3 := IF(@exist3 = 0, 'ALTER TABLE reservations ADD CONSTRAINT chk_min_one_night CHECK (DATEDIFF(check_out_date, check_in_date) >= 1)', 'SELECT "chk_min_one_night already exists"');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
