import { describe, expect, it } from 'vitest'
import { mergeLegacySyncItemsForUsers } from '../authStore'

interface SyncItemRow {
  user_id: string
  namespace: string
  key: string
  updated_at: string
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first() {
    return this.db.first(this.sql, this.args)
  }
}

class MockD1Database {
  constructor(
    public rows: SyncItemRow[],
    private readonly hasSyncItemsTable = true
  ) {}

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  first(sql: string, args: any[]) {
    if (sql.includes('SELECT name FROM sqlite_master')) {
      const tableName = args[0]
      if (tableName === 'sync_items' && this.hasSyncItemsTable) {
        return { name: 'sync_items' }
      }
      return null
    }
    return null
  }

  run(sql: string, args: any[]) {
    const [sourceUserId, targetUserId] = args

    if (sql.includes('DELETE FROM sync_items') && sql.includes('target.updated_at >= sync_items.updated_at')) {
      this.rows = this.rows.filter((row) => {
        if (row.user_id !== sourceUserId) return true
        const target = this.rows.find(candidate =>
          candidate.user_id === targetUserId
          && candidate.namespace === row.namespace
          && candidate.key === row.key
          && candidate.updated_at >= row.updated_at
        )
        return !target
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM sync_items') && sql.includes('source.updated_at > sync_items.updated_at')) {
      this.rows = this.rows.filter((row) => {
        if (row.user_id !== targetUserId) return true
        const source = this.rows.find(candidate =>
          candidate.user_id === sourceUserId
          && candidate.namespace === row.namespace
          && candidate.key === row.key
          && candidate.updated_at > row.updated_at
        )
        return !source
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE sync_items') && sql.includes('SET user_id = ?2')) {
      this.rows = this.rows.map(row =>
        row.user_id === sourceUserId
          ? { ...row, user_id: targetUserId }
          : row
      )
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }
}

describe('mergeLegacySyncItemsForUsers', () => {
  it('resolves source/target conflicts by updated_at and migrates source rows to target user', async () => {
    const db = new MockD1Database([
      // target newer -> keep target, drop source
      { user_id: 'source', namespace: 'app', key: 'A', updated_at: '2026-02-01T10:00:00.000Z' },
      { user_id: 'target', namespace: 'app', key: 'A', updated_at: '2026-02-01T12:00:00.000Z' },
      // source newer -> drop target, migrate source
      { user_id: 'source', namespace: 'app', key: 'B', updated_at: '2026-02-01T13:00:00.000Z' },
      { user_id: 'target', namespace: 'app', key: 'B', updated_at: '2026-02-01T11:00:00.000Z' },
      // source only -> migrate
      { user_id: 'source', namespace: 'app', key: 'C', updated_at: '2026-02-01T09:00:00.000Z' },
      // target only -> keep
      { user_id: 'target', namespace: 'app', key: 'D', updated_at: '2026-02-01T08:00:00.000Z' },
    ])

    await mergeLegacySyncItemsForUsers(db as any, 'source', 'target')

    const finalRows = db.rows
    expect(finalRows.every(row => row.user_id === 'target')).toBe(true)
    expect(finalRows).toHaveLength(4)

    const byKey = new Map(finalRows.map(row => [row.key, row]))
    expect(byKey.get('A')?.updated_at).toBe('2026-02-01T12:00:00.000Z')
    expect(byKey.get('B')?.updated_at).toBe('2026-02-01T13:00:00.000Z')
    expect(byKey.get('C')?.updated_at).toBe('2026-02-01T09:00:00.000Z')
    expect(byKey.get('D')?.updated_at).toBe('2026-02-01T08:00:00.000Z')
  })
})
