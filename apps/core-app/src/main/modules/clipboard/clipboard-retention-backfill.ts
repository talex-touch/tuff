import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { LogOptions } from '../../utils/logger'
import type { ClipboardClassificationSettings } from './clipboard-classification-settings'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { classifyClipboardContent } from '@talex-touch/utils/clipboard'
import { clipboardHistory, config } from '../../db/schema'

export const CLIPBOARD_RETENTION_BACKFILL_MARKER = 'clipboard.retention.backfill.v1'

const DEFAULT_BATCH_SIZE = 200

export interface ClipboardRetentionBackfillResult {
  scanned: number
  protectedCount: number
  completed: boolean
  skipped: boolean
}

export interface ClipboardRetentionBackfillOptions {
  db: LibSQLDatabase<typeof schema>
  getClassificationSettings: () => ClipboardClassificationSettings
  batchSize?: number
  /** 单次运行的扫描上限。没扫完就不写标记，下次启动继续。 */
  maxRows?: number
  logInfo?: (message: string, data?: LogOptions) => void
  logWarn?: (message: string, data?: LogOptions) => void
  /** 每批之间让出事件循环，避免大库把主进程卡住。 */
  yieldBetweenBatches?: () => Promise<void>
}

/**
 * 给启用保留策略之前采集的记录补上密钥保护。
 *
 * `retention_protected` 是随本次工作才开始写的，所以库里已有的 API key、私钥、连接串
 * 仍然按普通文本的类别策略走——默认 90 天后被清掉。这个回填把它们标成受保护。
 *
 * **只往保护方向改，不回填验证码的过期时刻。** 给一条三天前采集的验证码补上
 * 「采集时刻 + 1 小时」，得到的是一个早已过去的时间，下一轮清理就会删掉它——
 * 那是在用户没要求的情况下追溯删除数据。保护是安全的方向，删除不是；后者要单独决定。
 *
 * 幂等：扫完才写标记，写了标记就不再扫。没扫完（撞上 maxRows）时不写标记，
 * 下次启动从上次的 id 之后继续。
 */
export async function backfillClipboardRetentionProtection(
  options: ClipboardRetentionBackfillOptions
): Promise<ClipboardRetentionBackfillResult> {
  const { db } = options
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY

  if (await hasMarker(db)) {
    return { scanned: 0, protectedCount: 0, completed: true, skipped: true }
  }

  const settings = options.getClassificationSettings()
  let cursorId = 0
  let scanned = 0
  let protectedCount = 0

  while (scanned < maxRows) {
    const pageSize = Math.min(batchSize, maxRows - scanned)
    const rows = await db
      .select({ id: clipboardHistory.id, content: clipboardHistory.content })
      .from(clipboardHistory)
      .where(
        and(
          eq(clipboardHistory.type, 'text'),
          gt(clipboardHistory.id, cursorId),
          sql`COALESCE(${clipboardHistory.retentionProtected}, 0) = 0`
        )
      )
      .orderBy(asc(clipboardHistory.id))
      .limit(pageSize)

    if (rows.length === 0) {
      await writeMarker(db)
      options.logInfo?.('Clipboard retention backfill completed', {
        meta: { scanned, protectedCount }
      })
      return { scanned, protectedCount, completed: true, skipped: false }
    }

    const secretIds: number[] = []
    for (const row of rows) {
      scanned += 1
      cursorId = Math.max(cursorId, row.id)
      const classification = classifyClipboardContent({
        type: 'text',
        content: row.content ?? '',
        customKeyPrefixes: settings.customKeyPrefixes
      })
      if (classification.retentionClass === 'secret') {
        secretIds.push(row.id)
      }
    }

    if (secretIds.length > 0 && settings.protectSecrets) {
      await db
        .update(clipboardHistory)
        .set({ retentionProtected: true })
        .where(inArray(clipboardHistory.id, secretIds))
      protectedCount += secretIds.length
    }

    if (rows.length < pageSize) {
      await writeMarker(db)
      options.logInfo?.('Clipboard retention backfill completed', {
        meta: { scanned, protectedCount }
      })
      return { scanned, protectedCount, completed: true, skipped: false }
    }

    await options.yieldBetweenBatches?.()
  }

  // 撞上 maxRows：不写标记，下次启动接着扫。
  options.logInfo?.('Clipboard retention backfill paused at the row budget', {
    meta: { scanned, protectedCount }
  })
  return { scanned, protectedCount, completed: false, skipped: false }
}

async function hasMarker(db: LibSQLDatabase<typeof schema>): Promise<boolean> {
  try {
    const row = await db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.key, CLIPBOARD_RETENTION_BACKFILL_MARKER))
      .get()
    return Boolean(row)
  } catch {
    // 读不到标记就当没跑过。重复跑一次的代价只是白扫一遍，比永远不跑安全。
    return false
  }
}

async function writeMarker(db: LibSQLDatabase<typeof schema>): Promise<void> {
  await db
    .insert(config)
    .values({
      key: CLIPBOARD_RETENTION_BACKFILL_MARKER,
      value: JSON.stringify({ completedAt: Date.now() })
    })
    .onConflictDoNothing()
}
