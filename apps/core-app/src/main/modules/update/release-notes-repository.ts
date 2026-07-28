import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'

const RELEASE_NOTES_STATE_ID = 1

export class ReleaseNotesRepository {
  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async getLastAcknowledgedVersion(): Promise<string | null> {
    const rows = await this.db
      .select({ version: schema.appReleaseNotesState.lastAcknowledgedVersion })
      .from(schema.appReleaseNotesState)
      .where(eq(schema.appReleaseNotesState.id, RELEASE_NOTES_STATE_ID))
      .limit(1)

    return rows[0]?.version ?? null
  }

  async acknowledge(version: string, now = Date.now()): Promise<void> {
    const normalized = version.trim()
    if (!normalized) {
      throw new Error('Release notes acknowledgement version is required')
    }

    await this.db
      .insert(schema.appReleaseNotesState)
      .values({
        id: RELEASE_NOTES_STATE_ID,
        lastAcknowledgedVersion: normalized,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: schema.appReleaseNotesState.id,
        set: {
          lastAcknowledgedVersion: normalized,
          updatedAt: now
        }
      })
  }
}
