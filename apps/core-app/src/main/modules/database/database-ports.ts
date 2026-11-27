export interface DatabaseWalSearchIndexWriterStatus {
  readiness?: 'pending' | 'ready' | 'failed' | 'closed'
  admissionPaused: boolean
  activeAdmissions: number
  pending: number
}

export interface DatabaseWalSearchIndexWriterPort {
  getStatus: () => DatabaseWalSearchIndexWriterStatus
  withPausedAdmission: <T>(
    reason: string,
    operation: (status: DatabaseWalSearchIndexWriterStatus) => Promise<T>,
    timeoutMs?: number
  ) => Promise<T>
}

let walSearchIndexWriterPort: DatabaseWalSearchIndexWriterPort | null = null

/**
 * Registers the external search-index writer coordinator used by WAL checkpoints
 * and database contention telemetry. Returns an idempotent disposer that only
 * clears the slot if this registration is still active.
 */
export function registerDatabaseWalSearchIndexWriterPort(
  port: DatabaseWalSearchIndexWriterPort | null
): () => void {
  walSearchIndexWriterPort = port
  return () => {
    if (walSearchIndexWriterPort === port) {
      walSearchIndexWriterPort = null
    }
  }
}

export function getDatabaseWalSearchIndexWriterPort(): DatabaseWalSearchIndexWriterPort | null {
  return walSearchIndexWriterPort
}
