export interface PilotDbResult<T = unknown> {
  success: boolean
  meta?: {
    duration?: number
    changes?: number
    last_row_id?: number
    rows_read?: number
    rows_written?: number
  }
  results?: T[]
}

export interface PilotDbPreparedStatement {
  bind: (...values: unknown[]) => PilotDbPreparedStatement
  first: <T = unknown>(columnName?: string) => Promise<T | null>
  run: <T = unknown>() => Promise<PilotDbResult<T>>
  all: <T = unknown>() => Promise<PilotDbResult<T>>
  raw: <T = unknown>(options?: { columnNames?: boolean }) => Promise<T[] | [string[], ...T[]]>
}

export interface PilotDatabase {
  prepare: (query: string) => PilotDbPreparedStatement
  batch: <T = unknown>(statements: PilotDbPreparedStatement[]) => Promise<PilotDbResult<T>[]>
  exec?: (query: string) => Promise<{ count: number, duration: number }>
  dump?: () => Promise<ArrayBuffer>
  withSession?: () => unknown
}
