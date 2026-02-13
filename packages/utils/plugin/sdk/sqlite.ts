import { ensureRendererChannel } from './channel'
import { usePluginName } from './plugin-info'

export interface PluginSqliteStatement {
  sql: string
  params?: unknown[]
}

export interface PluginSqliteExecuteResult {
  rowsAffected: number
  lastInsertRowId: number | null
}

export interface PluginSqliteQueryResult<T extends Record<string, unknown>> {
  rows: T[]
  columns: string[]
}

export interface PluginSqliteTransactionResult {
  results: PluginSqliteExecuteResult[]
}

function normalizeSql(sql: string): string {
  return typeof sql === 'string' ? sql.trim() : ''
}

function normalizeParams(params?: unknown[]): unknown[] {
  return Array.isArray(params) ? params : []
}

export function usePluginSqlite() {
  const pluginName = usePluginName(
    '[Plugin SQLite SDK] Cannot determine plugin name. Make sure this is called in a plugin context.'
  )
  const channel = ensureRendererChannel(
    '[Plugin SQLite SDK] Channel not available. Make sure this is called in a plugin context.'
  )

  return {
    execute: async (
      sql: string,
      params?: unknown[]
    ): Promise<PluginSqliteExecuteResult> => {
      const normalizedSql = normalizeSql(sql)
      if (!normalizedSql) {
        throw new Error('[Plugin SQLite SDK] SQL is required.')
      }

      const response = await channel.send('plugin:sqlite:execute', {
        pluginName,
        sql: normalizedSql,
        params: normalizeParams(params)
      })

      if (!response || typeof response !== 'object' || (response as { success?: unknown }).success !== true) {
        const error =
          response && typeof response === 'object' && 'error' in response
            ? String((response as { error?: unknown }).error ?? 'Unknown error')
            : 'Unknown error'
        throw new Error(`[Plugin SQLite SDK] Execute failed: ${error}`)
      }

      return {
        rowsAffected: Number((response as { rowsAffected?: unknown }).rowsAffected ?? 0),
        lastInsertRowId:
          typeof (response as { lastInsertRowId?: unknown }).lastInsertRowId === 'number'
            ? Math.trunc((response as { lastInsertRowId?: number }).lastInsertRowId ?? 0)
            : null
      }
    },

    query: async <T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<PluginSqliteQueryResult<T>> => {
      const normalizedSql = normalizeSql(sql)
      if (!normalizedSql) {
        throw new Error('[Plugin SQLite SDK] SQL is required.')
      }

      const response = await channel.send('plugin:sqlite:query', {
        pluginName,
        sql: normalizedSql,
        params: normalizeParams(params)
      })

      if (!response || typeof response !== 'object' || (response as { success?: unknown }).success !== true) {
        const error =
          response && typeof response === 'object' && 'error' in response
            ? String((response as { error?: unknown }).error ?? 'Unknown error')
            : 'Unknown error'
        throw new Error(`[Plugin SQLite SDK] Query failed: ${error}`)
      }

      return {
        rows: Array.isArray((response as { rows?: unknown }).rows)
          ? ((response as { rows: T[] }).rows)
          : [],
        columns: Array.isArray((response as { columns?: unknown }).columns)
          ? ((response as { columns: string[] }).columns)
          : []
      }
    },

    transaction: async (
      statements: PluginSqliteStatement[]
    ): Promise<PluginSqliteTransactionResult> => {
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new Error('[Plugin SQLite SDK] Transaction statements are required.')
      }

      const payload = statements.map((statement) => ({
        sql: normalizeSql(statement.sql),
        params: normalizeParams(statement.params)
      }))

      if (payload.some((statement) => !statement.sql)) {
        throw new Error('[Plugin SQLite SDK] Each transaction statement must include SQL.')
      }

      const response = await channel.send('plugin:sqlite:transaction', {
        pluginName,
        statements: payload
      })

      if (!response || typeof response !== 'object' || (response as { success?: unknown }).success !== true) {
        const error =
          response && typeof response === 'object' && 'error' in response
            ? String((response as { error?: unknown }).error ?? 'Unknown error')
            : 'Unknown error'
        throw new Error(`[Plugin SQLite SDK] Transaction failed: ${error}`)
      }

      const results = Array.isArray((response as { results?: unknown }).results)
        ? (response as { results: PluginSqliteExecuteResult[] }).results
        : []

      return { results }
    }
  }
}
