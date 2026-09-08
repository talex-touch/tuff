import { describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../../db/schema'
import { DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS } from './clipboard-classification-settings'
import {
  CLIPBOARD_RETENTION_BACKFILL_MARKER,
  backfillClipboardRetentionProtection
} from './clipboard-retention-backfill'

const OPENAI_KEY = ['sk', '-', 'FAKEKEYFORTESTS0', 'FAKEKEYFORTESTS1', 'FAKEKEY0'].join('')

async function createDb() {
  const client = createClient({ url: ':memory:' })
  await client.execute(`CREATE TABLE clipboard_history (
    id integer PRIMARY KEY AUTOINCREMENT,
    type text NOT NULL,
    content text NOT NULL,
    raw_content text,
    thumbnail text,
    timestamp integer NOT NULL,
    source_app text,
    is_favorite integer DEFAULT 0,
    metadata text,
    retention_protected integer NOT NULL DEFAULT 0,
    retention_expires_at integer
  )`)
  await client.execute('CREATE TABLE config (key text PRIMARY KEY, value text)')
  return { client, db: drizzle(client, { schema }) }
}

async function seed(client: Awaited<ReturnType<typeof createDb>>['client'], rows: string[]) {
  for (const content of rows) {
    await client.execute({
      sql: 'INSERT INTO clipboard_history (type, content, timestamp) VALUES (?, ?, ?)',
      args: ['text', content, 1_700_000_000]
    })
  }
}

async function protectedIds(client: Awaited<ReturnType<typeof createDb>>['client']) {
  const rs = await client.execute(
    'SELECT id FROM clipboard_history WHERE retention_protected = 1 ORDER BY id'
  )
  return rs.rows.map((row) => Number(row.id))
}

const settings = () => DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS

describe('clipboard retention backfill', () => {
  /**
   * `retention_protected` 只从本次工作开始写，所以库里已有的密钥仍按普通文本的
   * 类别策略走——默认 90 天后被清掉。这个回填就是为了补上它们。
   */
  it('protects the secrets that were captured before the column was ever written', async () => {
    const { client, db } = await createDb()
    await seed(client, [
      '今天下午三点开会',
      OPENAI_KEY,
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
      'postgres://admin:hunter2@db.internal:5432/app',
      '买菜清单：西红柿 鸡蛋'
    ])

    const result = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })

    expect(result).toMatchObject({ scanned: 5, protectedCount: 3, completed: true, skipped: false })
    expect(await protectedIds(client)).toEqual([2, 3, 4])
  })

  /**
   * 只往保护方向改。给一条三天前的验证码补上「采集时刻 + 1 小时」得到的是一个早已
   * 过去的时间，下一轮清理就会删掉它——那是在用户没要求的情况下追溯删除数据。
   *
   * 种子里必须同时有密钥：写库的分支只在有密钥命中时才跑，只喂验证码的话这条断言
   * 根本到不了那行代码，就成了一条永远为真的空断言。
   */
  it('never writes an expiry, so nothing becomes retroactively due for deletion', async () => {
    const { client, db } = await createDb()
    await seed(client, [
      'G-123456',
      '您的验证码是 493028，5 分钟内有效',
      OPENAI_KEY,
      'postgres://admin:hunter2@db.internal:5432/app'
    ])

    const result = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })

    // 保护位确实被写了——证明 UPDATE 分支跑到了。
    expect(result.protectedCount).toBe(2)
    expect(await protectedIds(client)).toEqual([3, 4])

    const rs = await client.execute(
      'SELECT COUNT(*) AS n FROM clipboard_history WHERE retention_expires_at IS NOT NULL'
    )
    expect(Number(rs.rows[0]?.n)).toBe(0)
  })

  it('runs once and skips on every later launch', async () => {
    const { client, db } = await createDb()
    await seed(client, [OPENAI_KEY])

    const first = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })
    expect(first).toMatchObject({ completed: true, skipped: false, protectedCount: 1 })

    const marker = await client.execute({
      sql: 'SELECT value FROM config WHERE key = ?',
      args: [CLIPBOARD_RETENTION_BACKFILL_MARKER]
    })
    expect(marker.rows).toHaveLength(1)

    const second = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })
    expect(second).toMatchObject({ scanned: 0, skipped: true })
  })

  /**
   * 大库不能一口气扫完就卡住主进程。撞上预算时**不写标记**——写了的话剩下的记录
   * 就永远没人管了。
   */
  it('stops at the row budget without marking itself done', async () => {
    const { client, db } = await createDb()
    await seed(
      client,
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? OPENAI_KEY : `笔记 ${i}`))
    )

    const yielded = vi.fn(async () => {})
    const first = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings,
      batchSize: 2,
      maxRows: 4,
      yieldBetweenBatches: yielded
    })

    expect(first).toMatchObject({ scanned: 4, completed: false, skipped: false })
    expect(yielded).toHaveBeenCalled()
    const marker = await client.execute({
      sql: 'SELECT value FROM config WHERE key = ?',
      args: [CLIPBOARD_RETENTION_BACKFILL_MARKER]
    })
    expect(marker.rows).toHaveLength(0)

    // 下次启动接着扫剩下的，最终把 5 条密钥全部保护上。
    const second = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })
    expect(second.completed).toBe(true)
    expect(await protectedIds(client)).toEqual([1, 3, 5, 7, 9])
  })

  it('honours the setting that turns secret protection off', async () => {
    const { client, db } = await createDb()
    await seed(client, [OPENAI_KEY])

    await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: () => ({
        ...DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS,
        protectSecrets: false
      })
    })

    expect(await protectedIds(client)).toEqual([])
  })

  it('leaves images and files alone', async () => {
    const { client, db } = await createDb()
    await client.execute({
      sql: 'INSERT INTO clipboard_history (type, content, timestamp) VALUES (?, ?, ?)',
      args: ['image', 'data:image/png;base64,AA', 1_700_000_000]
    })
    await client.execute({
      sql: 'INSERT INTO clipboard_history (type, content, timestamp) VALUES (?, ?, ?)',
      args: ['files', JSON.stringify(['/a/b.txt']), 1_700_000_000]
    })

    const result = await backfillClipboardRetentionProtection({
      db,
      getClassificationSettings: settings
    })

    expect(result.scanned).toBe(0)
    expect(await protectedIds(client)).toEqual([])
  })
})
