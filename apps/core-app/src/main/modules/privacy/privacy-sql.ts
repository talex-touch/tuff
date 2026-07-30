import type { Client, InStatement, InValue, Row } from '@libsql/client'

export type PrivacySqlClient = Pick<Client, 'execute' | 'batch'>

export interface PrivacyCandidateRow {
  readonly id: InValue
  readonly byteCount: number
  readonly reference?: string
  readonly sortValue?: InValue
}

export interface PrivacyCountResult {
  readonly itemCount: number
  readonly byteCount: number
}

export async function executePrivacySql(
  client: PrivacySqlClient,
  sql: string,
  args: readonly InValue[] = []
) {
  return client.execute({ sql, args: [...args] })
}

export function rowNumber(row: Row | undefined, key: string): number {
  const value = row?.[key]
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(parsed))
    : 0
}

export function rowString(row: Row, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' ? value : undefined
}

export async function queryPrivacyCount(
  client: PrivacySqlClient,
  sql: string,
  args: readonly InValue[] = []
): Promise<PrivacyCountResult> {
  const result = await executePrivacySql(client, sql, args)
  return {
    itemCount: rowNumber(result.rows[0], 'item_count'),
    byteCount: rowNumber(result.rows[0], 'byte_count')
  }
}

export async function queryPrivacyCandidates(
  client: PrivacySqlClient,
  sql: string,
  args: readonly InValue[],
  maxRows: number
): Promise<{ rows: PrivacyCandidateRow[]; bounded: boolean }> {
  const result = await executePrivacySql(client, sql, [...args, maxRows + 1])
  const rows = result.rows.slice(0, maxRows).map((row) => ({
    id: row.owner_id as InValue,
    byteCount: rowNumber(row, 'byte_count'),
    reference: rowString(row, 'owner_reference'),
    sortValue: row.owner_sort as InValue | undefined
  }))
  return { rows, bounded: result.rows.length > maxRows }
}

export function sumCandidateBytes(rows: readonly PrivacyCandidateRow[]): number {
  return rows.reduce((sum, row) => sum + row.byteCount, 0)
}

export function sqlPlaceholders(size: number): string {
  return Array.from({ length: size }, () => '?').join(', ')
}

export function statement(sql: string, args: readonly InValue[]): InStatement {
  return { sql, args: [...args] }
}
