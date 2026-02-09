import type { AppPreviewChannel, GitHubRelease } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { desc, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'

export enum UpdateRecordStatus {
  PENDING = 'pending',
  SKIPPED = 'skipped',
  SNOOZED = 'snoozed',
  ACKNOWLEDGED = 'acknowledged'
}

export type UpdateRecordRow = typeof schema.appUpdateRecords.$inferSelect
type UpdateRecordInsert = typeof schema.appUpdateRecords.$inferInsert

export class UpdateRepository {
  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async clearAllRecords(): Promise<void> {
    await this.db.delete(schema.appUpdateRecords)
  }

  async saveRelease(
    release: GitHubRelease,
    channel: AppPreviewChannel,
    source: string
  ): Promise<void> {
    const payload = JSON.stringify(release)
    const publishedAt = release.published_at ? new Date(release.published_at).getTime() : null
    const now = Date.now()

    await this.db
      .insert(schema.appUpdateRecords)
      .values({
        tag: release.tag_name,
        channel,
        name: release.name,
        source,
        publishedAt,
        fetchedAt: now,
        payload
      })
      .onConflictDoUpdate({
        target: schema.appUpdateRecords.tag,
        set: {
          channel,
          name: release.name,
          source,
          publishedAt,
          fetchedAt: now,
          payload
        }
      })
  }

  async getLatestRecord(channel: AppPreviewChannel): Promise<UpdateRecordRow | null> {
    const rows = await this.db
      .select()
      .from(schema.appUpdateRecords)
      .where(eq(schema.appUpdateRecords.channel, channel))
      .orderBy(desc(schema.appUpdateRecords.publishedAt), desc(schema.appUpdateRecords.fetchedAt))
      .limit(1)

    return rows[0] ?? null
  }

  async getRecordByTag(tag: string): Promise<UpdateRecordRow | null> {
    const rows = await this.db
      .select()
      .from(schema.appUpdateRecords)
      .where(eq(schema.appUpdateRecords.tag, tag))
      .limit(1)

    return rows[0] ?? null
  }

  async markStatus(
    tag: string,
    status: UpdateRecordStatus,
    options?: { snoozeUntil?: number | null }
  ): Promise<void> {
    const patch: Partial<UpdateRecordInsert> = {
      status,
      lastActionAt: Date.now(),
      snoozeUntil: options?.snoozeUntil ?? null
    }

    if (status !== UpdateRecordStatus.SNOOZED) {
      patch.snoozeUntil = null
    }

    await this.db
      .update(schema.appUpdateRecords)
      .set(patch)
      .where(eq(schema.appUpdateRecords.tag, tag))
  }

  async resetStatus(tag: string): Promise<void> {
    await this.db
      .update(schema.appUpdateRecords)
      .set({ status: UpdateRecordStatus.PENDING, snoozeUntil: null })
      .where(eq(schema.appUpdateRecords.tag, tag))
  }
}
