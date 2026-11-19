const {
  getEngine,
  isPostgres,
  isMySql,
  setEngineOverride,
  clearEngineOverride,
  translateSql,
  normalizeError,
  normalizePgResult,
  BOOLEAN_COLUMNS,
} = require('../src/db/dbAdapter');

describe('Database Adapter — Unit & Translation Tests (TASK AIVEN-05)', () => {
  afterEach(() => {
    clearEngineOverride();
  });

  describe('Engine Selection & Detection', () => {
    test('1. Respects engine override', () => {
      setEngineOverride('postgres');
      expect(getEngine()).toBe('postgres');
      expect(isPostgres()).toBe(true);
      expect(isMySql()).toBe(false);

      setEngineOverride('mysql');
      expect(getEngine()).toBe('mysql');
      expect(isPostgres()).toBe(false);
      expect(isMySql()).toBe(true);
    });

    test('2. Defaults to configured engine when no override is set', () => {
      clearEngineOverride();
      const engine = getEngine();
      expect(['postgres', 'mysql']).toContain(engine);
    });
  });

  describe('SQL Placeholder & Syntax Translation for PostgreSQL', () => {
    test('3. Translates basic ? placeholders to $1, $2, $3', () => {
      const sql = 'SELECT * FROM users WHERE email = ? AND role = ? LIMIT ?';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT * FROM users WHERE email = $1 AND role = $2 LIMIT $3');
    });

    test('4. Preserves ? inside single-quoted strings and escaped single quotes', () => {
      const sql = "SELECT * FROM notes WHERE title = 'Is this a test?' AND desc = 'Don\\'t know? Maybe?' AND status = ?";
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe("SELECT * FROM notes WHERE title = 'Is this a test?' AND desc = 'Don\\'t know? Maybe?' AND status = $1");
    });

    test('5. Preserves ? inside SQL standard double-single-quote escapes', () => {
      const sql = "SELECT * FROM notes WHERE title = 'It''s a question? Yes' AND user_id = ?";
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe("SELECT * FROM notes WHERE title = 'It''s a question? Yes' AND user_id = $1");
    });

    test('6. Preserves ? inside line comments and block comments', () => {
      const sql = `
        -- Does this user exist?
        SELECT id FROM users /* check role? */ WHERE id = ?;
      `;
      const translated = translateSql(sql, 'postgres');
      expect(translated).toContain('-- Does this user exist?');
      expect(translated).toContain('/* check role? */');
      expect(translated).toContain('WHERE id = $1;');
    });

    test('7. Preserves ? inside PostgreSQL dollar-quoted strings', () => {
      const sql = 'SELECT $$Why? Because.$$ AS note, id FROM users WHERE id = ?';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT $$Why? Because.$$ AS note, id FROM users WHERE id = $1');
    });

    test('8. Preserves PostgreSQL JSONB operators (?| and ?&)', () => {
      const sql = "SELECT * FROM metadata WHERE data ?| array['a', 'b'] AND id = ?";
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe("SELECT * FROM metadata WHERE data ?| array['a', 'b'] AND id = $1");
    });

    test('9. Translates MySQL backticks to double quotes', () => {
      const sql = 'SELECT `id`, `name` FROM `users` WHERE `status` = ?';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT "id", "name" FROM "users" WHERE "status" = $1');
    });

    test('10. Translates CURRENT_DATE() to CURRENT_DATE', () => {
      const sql = 'SELECT * FROM reservations WHERE check_in_date >= CURRENT_DATE() AND status = ?';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT * FROM reservations WHERE check_in_date >= CURRENT_DATE AND status = $1');
    });

    test('11. Normalizes double-quoted status and housekeeping enum literals', () => {
      const sql = 'UPDATE apartments SET status = "DIRTY", housekeeping_status = "DIRTY" WHERE id = ?';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe("UPDATE apartments SET status = 'DIRTY', housekeeping_status = 'DIRTY' WHERE id = $1");
    });

    test('12. Normalizes boolean column integer comparisons (is_active = 1 -> is_active = TRUE)', () => {
      const sql = 'SELECT * FROM chart_of_accounts a WHERE a.is_active = 1 AND a.is_posting_allowed = 0';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT * FROM chart_of_accounts a WHERE a.is_active = TRUE AND a.is_posting_allowed = FALSE');
    });

    test('13. Does not alter numeric comparisons on non-boolean columns', () => {
      const sql = 'SELECT * FROM reservations WHERE nights = 1 AND property_id = 1';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('SELECT * FROM reservations WHERE nights = 1 AND property_id = 1');
    });

    test('14. Appends RETURNING id to INSERT queries without RETURNING', () => {
      const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id;');
    });

    test('15. Does not duplicate RETURNING if already present', () => {
      const sql = 'INSERT INTO users (name, email) VALUES (?, ?) RETURNING id';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id');
    });

    test('16. Does not append RETURNING id to notification_preferences', () => {
      const sql = 'INSERT INTO notification_preferences (user_id, channel) VALUES (?, ?)';
      const translated = translateSql(sql, 'postgres');
      expect(translated).toBe('INSERT INTO notification_preferences (user_id, channel) VALUES ($1, $2)');
    });

    test('17. Returns unchanged SQL when engine is mysql', () => {
      const sql = 'SELECT * FROM users WHERE email = ? AND is_active = 1';
      const translated = translateSql(sql, 'mysql');
      expect(translated).toBe(sql);
    });
  });

  describe('Error Normalization & Sanitization', () => {
    test('18. Sanitizes database connection passwords in error messages', () => {
      const rawError = new Error('Connection failed to postgres://avnadmin:super_secret_password_123@host.aivencloud.com:26780/bfa_apartments_db');
      const normalized = normalizeError(rawError);
      expect(normalized.message).not.toContain('super_secret_password_123');
      expect(normalized.message).toContain('postgres://avnadmin:***@host.aivencloud.com:26780/bfa_apartments_db');
    });

    test('19. Maps PostgreSQL deadlock (40P01) to ER_LOCK_DEADLOCK', () => {
      const err = new Error('deadlock detected');
      err.code = '40P01';
      const normalized = normalizeError(err);
      expect(normalized.code).toBe('ER_LOCK_DEADLOCK');
      expect(normalized.isDeadlock).toBe(true);
    });

    test('20. Maps PostgreSQL unique violation (23505) to ER_DUP_ENTRY', () => {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      const normalized = normalizeError(err);
      expect(normalized.code).toBe('ER_DUP_ENTRY');
      expect(normalized.isDuplicate).toBe(true);
    });

    test('21. Maps PostgreSQL foreign key violation (23503) to ER_NO_REFERENCED_ROW_2', () => {
      const err = new Error('insert or update violates foreign key constraint');
      err.code = '23503';
      const normalized = normalizeError(err);
      expect(normalized.code).toBe('ER_NO_REFERENCED_ROW_2');
      expect(normalized.isForeignKey).toBe(true);
    });
  });

  describe('Result Normalization for DML and DQL', () => {
    test('22. Normalizes SELECT query result as array of rows', () => {
      const pgRes = {
        command: 'SELECT',
        rowCount: 2,
        rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      };
      const normalized = normalizePgResult(pgRes, 'SELECT * FROM users');
      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized.length).toBe(2);
      expect(normalized[0].name).toBe('Alice');
    });

    test('23. Normalizes INSERT query result with insertId and affectedRows', () => {
      const pgRes = {
        command: 'INSERT',
        rowCount: 1,
        rows: [{ id: 42 }],
      };
      const normalized = normalizePgResult(pgRes, 'INSERT INTO users VALUES ($1)');
      expect(normalized.insertId).toBe(42);
      expect(normalized.affectedRows).toBe(1);
      expect(normalized.rowCount).toBe(1);
      expect(normalized.rows).toHaveLength(1);
    });

    test('24. Normalizes UPDATE query result with affectedRows', () => {
      const pgRes = {
        command: 'UPDATE',
        rowCount: 3,
        rows: [],
      };
      const normalized = normalizePgResult(pgRes, 'UPDATE users SET status = $1');
      expect(normalized.insertId).toBeNull();
      expect(normalized.affectedRows).toBe(3);
      expect(normalized.rowCount).toBe(3);
    });
  });
});
