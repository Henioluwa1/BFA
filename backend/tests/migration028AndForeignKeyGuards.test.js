const fs = require('fs');
const path = require('path');

const migrationDir = path.resolve(__dirname, '../src/db/migrations');
const migration028 = fs.readFileSync(
  path.join(migrationDir, '028_workforce_roster_and_property_media.sql'),
  'utf8'
);
const migration027 = fs.readFileSync(
  path.join(migrationDir, '027_booking_proof_verification_and_tracking.sql'),
  'utf8'
);
const migration031 = fs.readFileSync(
  path.join(migrationDir, '031_maintenance_evidence_and_dispatch_verification.sql'),
  'utf8'
);
const propertiesService = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/properties/properties.service.js'),
  'utf8'
);

describe('Migration 028 media category and availability indexes', () => {
  const categoryAlter = migration028.match(
    /ALTER TABLE `media_assets`\s+MODIFY COLUMN `category` ENUM\(([\s\S]*?)\) NOT NULL DEFAULT 'BUILDING_EXTERIOR';/
  );
  const enumValues = categoryAlter?.[1].match(/'([^']+)'/g)?.map((value) => value.slice(1, -1));

  test('preserves the original ENUM labels and appends every application category in order', () => {
    expect(enumValues).toEqual([
      'EXTERIOR', 'GROUNDS', 'FACILITIES', 'INTERIOR', 'AMENITY',
      'BUILDING_EXTERIOR', 'BUILDING_ENTRANCE', 'RECEPTION', 'LOBBY',
      'SWIMMING_POOL', 'GARDEN', 'PARKING', 'OTHER',
    ]);
    const appCategories = propertiesService.match(/const VALID_CATEGORIES = \[([\s\S]*?)\];/)?.[1]
      .match(/'([^']+)'/g)
      .map((value) => value.slice(1, -1));
    expect(enumValues).toEqual(expect.arrayContaining(appCategories));
    expect(migration028).not.toMatch(/category`\s+VARCHAR\(50\)/);
    expect(migration028).not.toMatch(/UPDATE\s+`?media_assets`?[\s\S]*?category\s*=/i);
  });

  test('uses the new default and retains NOT NULL', () => {
    expect(categoryAlter?.[0]).toContain("NOT NULL DEFAULT 'BUILDING_EXTERIOR'");
  });

  test('leaves the existing media lookup index and its column order untouched', () => {
    const mediaCreate = fs.readFileSync(
      path.join(migrationDir, '026_property_governance_and_staff_operations.sql'),
      'utf8'
    );
    expect(mediaCreate).toMatch(
      /INDEX `idx_media_lookup` \(`entity_type`, `entity_id`, `category`, `is_published`, `display_order`\)/
    );
    expect(migration028).not.toMatch(/idx_media_lookup/);
  });

  test('removes only the duplicate non-unique employee/date index', () => {
    const availability = migration028.match(
      /CREATE TABLE IF NOT EXISTS `employee_availability`\s*\(([\s\S]*?)\) ENGINE=/
    )?.[1] || '';
    expect(availability).toContain('UNIQUE KEY `uq_emp_date` (`employee_id`, `date`)');
    expect(availability).not.toContain('idx_ea_emp_date');
    expect(migration028).not.toMatch(/UNIQUE KEY `uq_emp_date`[^;]*DROP|DROP[^;]*uq_emp_date/i);
  });
});

describe('migration foreign-key guards fail closed on same-name mismatches', () => {
  const guards = [
    {
      sql: migration031,
      name: 'fk_oea_maintenance',
      childTable: 'operational_evidence_attachments',
      childColumn: 'maintenance_id',
      parentTable: 'maintenance_requests',
    },
  ];

  test.each(guards)('$name validates all expected FK metadata before skipping creation', (guard) => {
    const start = guard.sql.indexOf(`AND tc.CONSTRAINT_NAME = '${guard.name}'`);
    const tail = guard.sql.slice(start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(tail).toContain("tc.CONSTRAINT_TYPE = 'FOREIGN KEY'");
    expect(tail).toContain(`kcu.TABLE_NAME = '${guard.childTable}'`);
    expect(tail).toContain(`kcu.CONSTRAINT_NAME = '${guard.name}'`);
    expect(tail).toContain(`kcu.COLUMN_NAME = '${guard.childColumn}'`);
    expect(tail).toContain('kcu.REFERENCED_TABLE_SCHEMA = DATABASE()');
    expect(tail).toContain(`kcu.REFERENCED_TABLE_NAME = '${guard.parentTable}'`);
    expect(tail).toContain("kcu.REFERENCED_COLUMN_NAME = 'id'");
    expect(tail).toContain('kcu.ORDINAL_POSITION = 1');
    expect(tail).toContain("rc.DELETE_RULE = 'SET NULL'");
    expect(tail).toContain("rc.UPDATE_RULE = 'NO ACTION'");
    expect(tail).toContain('SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE kcu');
    expect(tail).toContain(') = 1');
    expect(tail).toContain(`__BFA_FK_DEFINITION_MISMATCH_${guard.name}__`);
  });

  test.each(guards)('$name creates only when absent and accepts only the exact expected definition', (guard) => {
    expect(guard.sql).toContain("IF(@fk_valid = 1, 'SELECT 1'");
    expect(guard.sql).toContain('IF(@fk_named_exists = 0');
    expect(guard.sql).toContain(`ADD CONSTRAINT \`${guard.name}\``);
    expect(guard.sql).toContain('information_schema.TABLE_CONSTRAINTS');
    expect(guard.sql).toContain('information_schema.REFERENTIAL_CONSTRAINTS');
    expect(guard.sql).toContain('information_schema.KEY_COLUMN_USAGE');
  });

  test('sets expected FK actions in each create branch', () => {
    for (const guard of guards) {
      const assignment = guard.sql.slice(guard.sql.indexOf('SET @add_fk :='));
      const createBranch = assignment.slice(0, assignment.indexOf('PREPARE'));
      expect(createBranch).toContain('ON DELETE SET NULL');
      expect(createBranch).not.toMatch(/ON UPDATE\s+(CASCADE|RESTRICT|SET NULL|NO ACTION)/i);
    }
  });

  test('keeps migration 027 outside this remediation scope', () => {
    expect(migration027).toContain("CONSTRAINT_NAME = 'fk_res_declined_by'");
    expect(migration027).toContain("CONSTRAINT_NAME = 'fk_res_rc_apt'");
  });
});
