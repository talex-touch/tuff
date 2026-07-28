import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  normalizePluginSqlForExecution,
  PLUGIN_SQL_MAX_BYTES,
  PLUGIN_SQL_MAX_PARAM_BYTES,
  PLUGIN_SQL_MAX_PARAMS,
  PLUGIN_SQL_MAX_TRANSACTION_STATEMENTS,
  PluginSqlPolicyError,
  validatePluginSql,
  validatePluginSqlParams,
  validatePluginTransactionStatements
} from './plugin-sql-policy'

function expectPolicyError(
  sql: string,
  lane: 'query' | 'execute' | 'transaction',
  code: string
): void {
  expect(() => validatePluginSql(sql, lane)).toThrowError(expect.objectContaining({ code }))
}

describe('plugin SQL policy', () => {
  it('accepts one SELECT with quoted semicolons, doubled escapes, and comments', () => {
    const sql = `
      /* leading ; ATTACH */
      SELECT
        'it''s;safe',
        "double""quote;safe",
        \`backtick\`\`quote;safe\`,
        [bracket]]quote;safe]
      FROM [notes;table]
      WHERE value = 'PRAGMA; VACUUM'; -- trailing ; DETACH
    `

    expect(validatePluginSql(sql, 'query')).toEqual({
      lane: 'query',
      kind: 'select'
    })
  })

  it.each([
    'SELECT id, name FROM notes WHERE id = ?',
    'SELECT \'ATTACH DATABASE x\', "safe_column" FROM notes',
    'SELECT 1; -- terminal comment',
    '/* lead */ SELECT 1 /* tail */;'
  ])('allows one bounded SELECT query: %s', (sql) => {
    expect(validatePluginSql(sql, 'query')).toMatchObject({ kind: 'select' })
  })

  it('does not treat denied words inside strings or comments as capabilities', () => {
    const sql = `
      SELECT
        'ATTACH DETACH PRAGMA VACUUM load_extension BEGIN COMMIT ROLLBACK SAVEPOINT RETURNING',
        "safe_column",
        \`safe_view_name\`,
        [safe_virtual_name]
      /* CREATE VIRTUAL TABLE hidden */
      -- RELEASE SAVEPOINT
    `

    expect(validatePluginSql(sql, 'query')).toEqual({
      lane: 'query',
      kind: 'select'
    })
    expect(
      validatePluginSql("INSERT INTO notes(body) VALUES ('PRAGMA ATTACH')", 'execute')
    ).toBeTruthy()
  })

  it.each([
    'SELECT * FROM "pragma_database_list"',
    'SELECT * FROM [pragma_database_list]',
    'SELECT "load_extension"(\'extension\')',
    'SELECT `randomblob`(100000000)',
    'SELECT [zeroblob](100000000)',
    'UPDATE notes SET "returning" = 1 WHERE id = 1'
  ])('rejects quoted denied identifiers: %s', (sql) => {
    expectPolicyError(
      sql,
      sql.startsWith('SELECT') ? 'query' : 'execute',
      'PLUGIN_SQLITE_STATEMENT_DENIED'
    )
  })

  it('allows one optional terminal semicolon followed only by whitespace or comments', () => {
    expect(validatePluginSql('SELECT 1; /* trailing */ -- done\n', 'query')).toEqual({
      lane: 'query',
      kind: 'select'
    })

    for (const sql of ['SELECT 1; SELECT 2', 'SELECT 1;;', '; SELECT 1']) {
      expectPolicyError(sql, 'query', 'PLUGIN_SQLITE_STATEMENT_LIMIT')
    }
  })

  it('rejects empty and unterminated input as invalid SQL', () => {
    for (const sql of [
      '',
      '   -- comment only',
      "SELECT 'unterminated",
      'SELECT "unterminated',
      'SELECT `unterminated',
      'SELECT [unterminated',
      'SELECT 1 /* unterminated',
      'SELECT 1\0ATTACH DATABASE hidden AS other'
    ]) {
      expectPolicyError(sql, 'query', 'PLUGIN_SQLITE_SQL_INVALID')
    }
  })

  it('enforces the 64 KiB UTF-8 SQL limit before scanning', () => {
    const prefix = 'SELECT 1'
    const atLimit = `${prefix}${' '.repeat(PLUGIN_SQL_MAX_BYTES - prefix.length)}`

    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(PLUGIN_SQL_MAX_BYTES)
    expect(validatePluginSql(atLimit, 'query').kind).toBe('select')
    expectPolicyError(`${atLimit}界`, 'query', 'PLUGIN_SQLITE_SQL_TOO_LARGE')
  })

  it('allows SELECT only in query and mutations only in execute/transaction', () => {
    expect(validatePluginSql('SELECT id FROM notes', 'query').kind).toBe('select')
    expectPolicyError('DELETE FROM notes', 'query', 'PLUGIN_SQLITE_STATEMENT_DENIED')
    expectPolicyError('SELECT id FROM notes', 'execute', 'PLUGIN_SQLITE_STATEMENT_DENIED')
    expectPolicyError('SELECT id FROM notes', 'transaction', 'PLUGIN_SQLITE_STATEMENT_DENIED')
    expectPolicyError(
      'WITH note AS (SELECT 1) SELECT * FROM note',
      'query',
      'PLUGIN_SQLITE_STATEMENT_DENIED'
    )
  })

  it.each([
    ['INSERT INTO notes(value) VALUES (?)', 'insert'],
    ['UPDATE notes SET value = ?', 'update'],
    ['DELETE FROM notes WHERE id = ?', 'delete'],
    ['CREATE TABLE notes (id INTEGER)', 'create-table'],
    ['CREATE INDEX notes_value_idx ON notes(value)', 'create-index'],
    ['DROP TABLE notes', 'drop-table'],
    ['DROP INDEX notes_value_idx', 'drop-index'],
    ['ALTER TABLE notes ADD COLUMN archived INTEGER', 'alter-table'],
    ['ALTER TABLE notes RENAME TO archived_notes', 'alter-table'],
    ['ALTER TABLE notes RENAME COLUMN value TO content', 'alter-table'],
    ['ALTER TABLE notes DROP COLUMN archived', 'alter-table']
  ] as const)('allows reviewed mutation statement %s', (sql, kind) => {
    expect(validatePluginSql(sql, 'execute')).toEqual({ lane: 'execute', kind })
    expect(validatePluginSql(sql, 'transaction')).toEqual({
      lane: 'transaction',
      kind
    })
  })

  it.each([
    'CREATE UNIQUE INDEX notes_value_idx ON notes(value)',
    'CREATE TEMP TABLE notes (id INTEGER)',
    'DROP TRIGGER note_trigger',
    'ALTER TABLE notes',
    'ALTER TABLE notes RENAME value',
    'ALTER TABLE notes ADD',
    'ALTER TABLE notes DROP'
  ])('rejects mutation syntax outside the reviewed subset: %s', (sql) => {
    expectPolicyError(sql, 'execute', 'PLUGIN_SQLITE_STATEMENT_DENIED')
  })

  it.each([
    'ATTACH DATABASE ? AS other',
    'AT/**/TACH DATABASE ? AS other',
    'DETACH DATABASE other',
    'PRAGMA database_list',
    'SELECT * FROM pragma_database_list',
    'SELECT * FROM pra/**/gma_database_list',
    'SELECT randomblob(100000000)',
    'SELECT zeroblob(100000000)',
    "VACUUM INTO 'copy.sqlite'",
    "SELECT load_extension('extension')",
    'BEGIN IMMEDIATE',
    'COMMIT',
    'ROLLBACK',
    'SAVEPOINT nested',
    'RELEASE SAVEPOINT nested',
    'INSERT INTO notes(value) VALUES (?) RETURNING id',
    'CREATE TRIGGER note_trigger AFTER INSERT ON notes BEGIN SELECT 1; END',
    'CREATE VIEW note_view AS SELECT * FROM notes',
    'CREATE VIRTUAL TABLE note_search USING fts5(value)',
    'SELECT * FROM (WITH RECURSIVE count(x) AS (SELECT 1) SELECT x FROM count)'
  ])('rejects denied capability before execution: %s', (sql) => {
    expectPolicyError(
      sql,
      sql.startsWith('SELECT') ? 'query' : 'execute',
      'PLUGIN_SQLITE_STATEMENT_DENIED'
    )
  })

  it('enforces parameter count and aggregate byte bounds', () => {
    expect(
      validatePluginSqlParams(Array.from({ length: PLUGIN_SQL_MAX_PARAMS }, () => 1))
    ).toHaveLength(PLUGIN_SQL_MAX_PARAMS)
    expect(validatePluginSqlParams(['x'.repeat(PLUGIN_SQL_MAX_PARAM_BYTES)])).toHaveLength(1)

    expect(() =>
      validatePluginSqlParams(Array.from({ length: PLUGIN_SQL_MAX_PARAMS + 1 }, () => 1))
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_SQLITE_PARAMS_TOO_LARGE' }))
    expect(() =>
      validatePluginSqlParams(['x'.repeat(PLUGIN_SQL_MAX_PARAM_BYTES + 1)])
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_SQLITE_PARAMS_TOO_LARGE' }))
  })

  it('enforces the transaction statement bound and validates every statement', () => {
    const statements = Array.from({ length: PLUGIN_SQL_MAX_TRANSACTION_STATEMENTS }, () => ({
      sql: 'DELETE FROM notes'
    }))

    expect(validatePluginTransactionStatements(statements)).toHaveLength(
      PLUGIN_SQL_MAX_TRANSACTION_STATEMENTS
    )
    expect(() =>
      validatePluginTransactionStatements([...statements, { sql: 'DELETE FROM notes' }])
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_SQLITE_STATEMENT_LIMIT' }))
    expect(() => validatePluginTransactionStatements([{ sql: 'SELECT 1' }])).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_SQLITE_STATEMENT_DENIED' })
    )
    expect(() =>
      validatePluginTransactionStatements([
        { sql: 'INSERT INTO notes VALUES (?)', params: ['x'.repeat(600_000)] },
        { sql: 'INSERT INTO notes VALUES (?)', params: ['x'.repeat(600_000)] }
      ])
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_SQLITE_PARAMS_TOO_LARGE' }))
  })

  it('removes only the policy-approved terminal semicolon before query wrapping', () => {
    expect(normalizePluginSqlForExecution("SELECT ';' AS value; -- trailing ;\n")).toBe(
      "SELECT ';' AS value"
    )
    expect(normalizePluginSqlForExecution('SELECT 1 /* ; */')).toBe('SELECT 1 /* ; */')
  })

  it('returns sanitized policy errors without retaining raw SQL', () => {
    const marker = 'sensitive-sql-marker'

    try {
      validatePluginSql(`ATTACH DATABASE '${marker}' AS other`, 'execute')
      throw new Error('Expected policy rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(PluginSqlPolicyError)
      expect((error as Error).message).not.toContain(marker)
    }
  })
})
