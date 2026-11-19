const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../src/db/migrations/027_booking_proof_verification_and_tracking.sql'
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const activeSchema = 'bfa_apartments_migration_test';

const foreignKeys = [
  {
    name: 'fk_res_declined_by',
    variablePrefix: 'fk_res_declined',
    childTable: 'reservations',
    childColumn: 'declined_by_user_id',
    parentTable: 'users',
  },
  {
    name: 'fk_res_rc_apt',
    variablePrefix: 'fk_res_room_change',
    childTable: 'reservations',
    childColumn: 'room_change_requested_apartment_id',
    parentTable: 'apartments',
  },
];

function guardSql(foreignKey) {
  const start = migrationSql.indexOf(`SET @${foreignKey.variablePrefix}_named_exists`);
  const end = migrationSql.indexOf(`DEALLOCATE PREPARE ${foreignKey.name === 'fk_res_declined_by'
    ? 'stmt_res_declined_fk'
    : 'stmt_res_room_change_fk'};`, start);
  return migrationSql.slice(start, end);
}

function metadataFor(foreignKey) {
  return {
    constraints: [{
      schema: activeSchema,
      tableSchema: activeSchema,
      table: foreignKey.childTable,
      name: foreignKey.name,
      type: 'FOREIGN KEY',
    }],
    columns: [{
      schema: activeSchema,
      tableSchema: activeSchema,
      table: foreignKey.childTable,
      name: foreignKey.name,
      column: foreignKey.childColumn,
      referencedSchema: activeSchema,
      referencedTable: foreignKey.parentTable,
      referencedColumn: 'id',
      ordinal: 1,
    }],
    rules: [{
      schema: activeSchema,
      table: foreignKey.childTable,
      name: foreignKey.name,
      deleteRule: 'SET NULL',
      updateRule: 'NO ACTION',
    }],
  };
}

// Mirrors the guard's metadata predicate for mocked INFORMATION_SCHEMA rows.
// The separate SQL-contract assertions below ensure the migration encodes each
// field this fixture evaluator checks.
function evaluateGuard(metadata, foreignKey) {
  if (!metadata || !Array.isArray(metadata.constraints)
      || !Array.isArray(metadata.columns) || !Array.isArray(metadata.rules)) {
    throw new Error('foreign-key metadata lookup failed');
  }

  const namedRows = metadata.constraints.filter((row) =>
    row.schema === activeSchema
    && row.tableSchema === activeSchema
    && row.table === foreignKey.childTable
    && row.name === foreignKey.name
  );
  if (namedRows.length === 0) return 'create';

  const validConstraint = namedRows.some((constraint) => {
    if (constraint.type !== 'FOREIGN KEY') return false;
    const rulesMatch = metadata.rules.some((rule) =>
      rule.schema === activeSchema
      && rule.table === foreignKey.childTable
      && rule.name === foreignKey.name
      && rule.deleteRule === 'SET NULL'
      && rule.updateRule === 'NO ACTION'
    );
    const columns = metadata.columns.filter((column) =>
      column.schema === activeSchema
      && column.tableSchema === activeSchema
      && column.table === foreignKey.childTable
      && column.name === foreignKey.name
    );
    return rulesMatch
      && columns.length === 1
      && columns[0].column === foreignKey.childColumn
      && columns[0].referencedSchema === activeSchema
      && columns[0].referencedTable === foreignKey.parentTable
      && columns[0].referencedColumn === 'id'
      && columns[0].ordinal === 1;
  });

  if (validConstraint) return 'skip';
  throw new Error(`BFA_MIGRATION_027_FK_DEFINITION_MISMATCH_${foreignKey.name}`);
}

describe.each(foreignKeys)('$name TiDB foreign-key guard', (foreignKey) => {
  test('validates all metadata fields and the expected child-table scope', () => {
    const sql = guardSql(foreignKey);
    expect(sql).toContain('information_schema.TABLE_CONSTRAINTS');
    expect(sql).toContain('information_schema.KEY_COLUMN_USAGE');
    expect(sql).toContain('information_schema.REFERENTIAL_CONSTRAINTS');
    expect(sql).toContain('tc.CONSTRAINT_SCHEMA = DATABASE()');
    expect(sql).toContain('tc.TABLE_SCHEMA = DATABASE()');
    expect(sql).toContain(`tc.TABLE_NAME = '${foreignKey.childTable}'`);
    expect(sql).toContain(`tc.CONSTRAINT_NAME = '${foreignKey.name}'`);
    expect(sql).toContain("tc.CONSTRAINT_TYPE = 'FOREIGN KEY'");
    expect(sql).toContain(`kcu.COLUMN_NAME = '${foreignKey.childColumn}'`);
    expect(sql).toContain('kcu.REFERENCED_TABLE_SCHEMA = DATABASE()');
    expect(sql).toContain(`kcu.REFERENCED_TABLE_NAME = '${foreignKey.parentTable}'`);
    expect(sql).toContain("kcu.REFERENCED_COLUMN_NAME = 'id'");
    expect(sql).toContain('kcu.ORDINAL_POSITION = 1');
    expect(sql).toContain("rc.DELETE_RULE = 'SET NULL'");
    expect(sql).toContain("rc.UPDATE_RULE = 'NO ACTION'");
    expect(sql).toContain(`AND kcu.CONSTRAINT_NAME = '${foreignKey.name}'`);
    expect(sql).toContain(') = 1');
  });

  test('accepts an existing constraint only when the complete definition matches', () => {
    expect(evaluateGuard(metadataFor(foreignKey), foreignKey)).toBe('skip');
    const sql = guardSql(foreignKey);
    expect(sql).toContain(`@${foreignKey.variablePrefix}_valid = 1`);
    expect(sql).toContain("'SELECT 1'");
  });

  test('takes the creation path when the constraint is absent', () => {
    expect(evaluateGuard({ constraints: [], columns: [], rules: [] }, foreignKey)).toBe('create');
    const sql = guardSql(foreignKey);
    expect(sql).toContain(`@${foreignKey.variablePrefix}_named_exists = 0`);
    expect(sql).toContain(`ALTER TABLE reservations ADD CONSTRAINT ${foreignKey.name}`);
  });

  test('rejects an incorrect referencing column', () => {
    const metadata = metadataFor(foreignKey);
    metadata.columns[0].column = 'wrong_child_column';
    expect(() => evaluateGuard(metadata, foreignKey)).toThrow(/DEFINITION_MISMATCH/);
  });

  test.each([
    ['referenced table', (column) => { column.referencedTable = 'wrong_parent'; }],
    ['referenced column', (column) => { column.referencedColumn = 'wrong_id'; }],
    ['referenced schema', (column) => { column.referencedSchema = 'other_schema'; }],
  ])('rejects an incorrect %s', (_label, mutate) => {
    const metadata = metadataFor(foreignKey);
    mutate(metadata.columns[0]);
    expect(() => evaluateGuard(metadata, foreignKey)).toThrow(/DEFINITION_MISMATCH/);
  });

  test.each([
    ['delete', (rule) => { rule.deleteRule = 'CASCADE'; }],
    ['update', (rule) => { rule.updateRule = 'CASCADE'; }],
  ])('rejects an incorrect %s rule', (_label, mutate) => {
    const metadata = metadataFor(foreignKey);
    mutate(metadata.rules[0]);
    expect(() => evaluateGuard(metadata, foreignKey)).toThrow(/DEFINITION_MISMATCH/);
  });

  test('rejects a composite or multi-column constraint', () => {
    const metadata = metadataFor(foreignKey);
    metadata.columns.push({ ...metadata.columns[0], column: 'another_child_column', ordinal: 2 });
    expect(() => evaluateGuard(metadata, foreignKey)).toThrow(/DEFINITION_MISMATCH/);
    expect(guardSql(foreignKey)).toContain(') = 1');
  });

  test('fails closed for same-name constraints with an incompatible type or incomplete metadata', () => {
    const wrongType = metadataFor(foreignKey);
    wrongType.constraints[0].type = 'UNIQUE';
    expect(() => evaluateGuard(wrongType, foreignKey)).toThrow(/DEFINITION_MISMATCH/);

    const incomplete = metadataFor(foreignKey);
    incomplete.columns = [];
    expect(() => evaluateGuard(incomplete, foreignKey)).toThrow(/DEFINITION_MISMATCH/);
    expect(guardSql(foreignKey)).toContain(`BFA_MIGRATION_027_FK_DEFINITION_MISMATCH_${foreignKey.name}`);
  });

  test('does not accept a constraint if metadata lookup fails', () => {
    expect(() => evaluateGuard(null, foreignKey)).toThrow('foreign-key metadata lookup failed');
    expect(guardSql(foreignKey)).not.toMatch(/COALESCE|IFNULL/);
  });
});
