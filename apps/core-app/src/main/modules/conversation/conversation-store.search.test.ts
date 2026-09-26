/**
 * searchConversations 是 CoreBox「按内容找历史对话」的唯一后端。它的失败方式都很安静：`%` 被当成
 * LIKE 通配符会突然把全部历史倒出来、标题命中被内容命中挤到后面会让最该出现的那条沉底、同一会话
 * 没去重会占满有限的结果位、摘要按 UTF-16 单位切会把 emoji 截成半个代理对（界面上是一个乱码方块）。
 *
 * 这些都不会抛异常，只会让用户「搜得到但不该有」「搜不到但明明说过」，所以在真实 libsql 上钉。
 * 夹具沿用 conversation-store.transaction.test.ts：真实库 + 已发布 migration，只 mock 掉 database
 * 与写队列——`instr` 的字面匹配、join 之后的排序、`seen` 去重都必须由数据库本身回答。
 */
import type { Client } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')

let db: ReturnType<typeof drizzle>
let client: Client
let tempDir: string

vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => task()
}))

/** 半个代理对渲染出来是乱码方块，摘要里永远不该出现。 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

async function loadStore(): Promise<typeof import('./conversation-store')> {
  return import('./conversation-store')
}

/** 直接落库而不是走 saveConversation：搜索的排序依赖 updatedAt/seq，必须由用例精确指定。 */
async function seedConversation(id: string, title: string, updatedAt: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO conversations (id, title, project_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
    args: [id, title, updatedAt, updatedAt]
  })
}

async function seedMessage(
  conversationId: string,
  id: string,
  seq: number,
  content: string
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO conversation_messages (id, conversation_id, role, content, status, meta, seq, created_at) VALUES (?, ?, 'assistant', ?, 'complete', NULL, ?, ?)`,
    args: [id, conversationId, content, seq, seq]
  })
}

async function search(term: string, limit?: number) {
  const { searchConversations } = await loadStore()
  return searchConversations(term, limit)
}

async function hitIds(term: string, limit?: number): Promise<string[]> {
  return (await search(term, limit)).map((hit) => hit.id)
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'conversation-search-'))
  client = createClient({ url: `file:${join(tempDir, 'test.db')}` })
  db = drizzle(client)
  await migrate(db, { migrationsFolder })
})

afterEach(async () => {
  client.close()
  await rm(tempDir, { recursive: true, force: true })
})

describe('searchConversations matching rules', () => {
  it('returns nothing for a blank or whitespace-only term', async () => {
    await seedConversation('c-1', 'alpha plan', 10)

    expect(await search('')).toEqual([])
    expect(await search('   ')).toEqual([])
    // 只有 trim 掉空白，「 」才不会变成「标题里有一个空格」这种真实命中。
    expect(await search(' ')).toEqual([])
  })

  it('treats a non-positive limit as no search at all', async () => {
    await seedConversation('c-1', 'alpha plan', 10)

    expect(await search('alpha', 0)).toEqual([])
    // SQLite 把负数 LIMIT 当作「不限制」，所以负数必须由 guard 拦住，不能交给 SQL。
    expect(await search('alpha', -1)).toEqual([])
  })

  it('matches a substring case-insensitively in both directions', async () => {
    await seedConversation('c-1', 'Deployed the PaymentGateway refactor', 10)
    await seedConversation('c-2', 'unrelated', 20)
    await seedMessage('c-2', 'm-1', 0, 'we should recheck the PAYMENTGATEWAY later')

    expect(await hitIds('paymentgateway')).toEqual(['c-1', 'c-2'])
    expect(await hitIds('PAYMENTGATEWAY')).toEqual(['c-1', 'c-2'])
    expect(await hitIds('gateway')).toEqual(['c-1', 'c-2'])
  })

  it('returns no row for a term no title or message contains', async () => {
    await seedConversation('c-1', 'alpha plan', 10)
    await seedMessage('c-1', 'm-1', 0, 'nothing relevant here')

    expect(await search('zebra')).toEqual([])
  })

  it('keeps a title hit ahead of a newer content hit', async () => {
    await seedConversation('c-title', 'alpha roadmap', 100)
    await seedMessage('c-title', 'm-1', 0, 'unrelated body')
    await seedConversation('c-body', 'random notes', 900)
    await seedMessage('c-body', 'm-1', 0, 'yesterday we discussed alpha again')

    // 名字里带 query 的会话是更强的信号，哪怕它更旧；反过来会让用户先看到一条无关标题。
    expect(await hitIds('alpha')).toEqual(['c-title', 'c-body'])
  })

  it('orders each group newest-first', async () => {
    await seedConversation('c-title-old', 'alpha I', 100)
    await seedConversation('c-title-new', 'alpha II', 500)
    await seedConversation('c-body-old', 'older body', 200)
    await seedMessage('c-body-old', 'm-1', 0, 'alpha once')
    await seedConversation('c-body-new', 'newer body', 800)
    await seedMessage('c-body-new', 'm-1', 0, 'alpha twice')

    expect(await hitIds('alpha')).toEqual([
      'c-title-new',
      'c-title-old',
      'c-body-new',
      'c-body-old'
    ])
  })

  it('reads % and _ as characters, not as wildcards', async () => {
    await seedConversation('c-plain', 'plain notes', 10)
    await seedMessage('c-plain', 'm-1', 0, 'nothing special in here')
    await seedConversation('c-percent', 'load report', 20)
    await seedMessage('c-percent', 'm-1', 0, 'loaded 100% of the rows')
    await seedConversation('c-underscore', 'snake_case guide', 30)

    // LIKE 下 `%` 会匹配一切、`_` 会匹配任意一个字符：那样一条查询就能把全部历史倒进命令栏。
    expect(await hitIds('%')).toEqual(['c-percent'])
    expect(await hitIds('_')).toEqual(['c-underscore'])
  })

  it('lists a conversation once when both its title and a message match', async () => {
    await seedConversation('c-both', 'alpha plan', 50)
    await seedMessage('c-both', 'm-1', 0, 'alpha is also mentioned here')

    const hits = await search('alpha')

    // 标题命中已经占了这一行；内容再补一条等于同一个会话在命令栏里出现两次。
    expect(hits.map((hit) => hit.id)).toEqual(['c-both'])
    expect(hits[0]!.excerpt).toBe('')
  })

  it('leaves the excerpt empty for a title-only hit', async () => {
    await seedConversation('c-title', 'alpha roadmap', 100)
    await seedMessage('c-title', 'm-1', 0, 'body without the term')

    expect((await search('alpha'))[0]!.excerpt).toBe('')
  })

  it('uses the earliest matching message as the excerpt', async () => {
    await seedConversation('c-thread', 'daily log', 30)
    await seedMessage('c-thread', 'm-late', 7, 'much later we mention horizon plumbing')
    await seedMessage('c-thread', 'm-early', 2, 'first mention of horizon')

    const [hit] = await search('horizon')

    // 长对话里同一个词会被反复提到；摘要要说的是它最早出现在哪，而不是最后重复在哪。
    expect(hit!.excerpt).toContain('first mention')
    expect(hit!.excerpt).not.toContain('later')
  })

  it('caps the total number of hits', async () => {
    await seedConversation('c-title', 'alpha plan', 10)
    await seedConversation('c-body-1', 'one', 900)
    await seedMessage('c-body-1', 'm-1', 0, 'alpha one')
    await seedConversation('c-body-2', 'two', 800)
    await seedMessage('c-body-2', 'm-1', 0, 'alpha two')

    // 内容分组自己还要受剩余名额约束，否则标题命中之后的补位会把 limit 顶穿。
    expect(await hitIds('alpha', 2)).toEqual(['c-title', 'c-body-1'])
    expect(await hitIds('alpha', 1)).toEqual(['c-title'])
  })

  it('never returns more than the default cap for a broad query', async () => {
    const { CONVERSATION_SEARCH_LIMIT } = await loadStore()
    for (let index = 0; index < CONVERSATION_SEARCH_LIMIT + 3; index += 1) {
      await seedConversation(`c-${index}`, `alpha ${index}`, 1000 - index)
    }

    const hits = await search('alpha')

    // 上限本身是可调的，这里只钉「宽度有限的命令栏不会被一次查询灌满」这一件事。
    expect(hits).toHaveLength(CONVERSATION_SEARCH_LIMIT)
  })
})

describe('searchConversations excerpt', () => {
  async function excerptFor(content: string, term: string): Promise<string> {
    await seedConversation('c-1', 'thread', 10)
    await seedMessage('c-1', 'm-1', 0, content)
    const [hit] = await search(term)
    return hit!.excerpt
  }

  it('collapses a multi-line body into one trimmed line', async () => {
    const excerpt = await excerptFor('line one\n\n   the needle\n\n\t trailing', 'needle')

    // 消息体是 Markdown，命中往往落在折行段落里；不折叠的话行里会出现换行和缩进。
    expect(excerpt).toBe('line one the needle trailing')
  })

  it('adds an ellipsis on each side only when the body is cut', async () => {
    const excerpt = await excerptFor(`${'x'.repeat(200)} needle ${'y'.repeat(200)}`, 'needle')

    expect(excerpt).toContain('needle')
    expect(excerpt.startsWith('…')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('does not cut an emoji in half', async () => {
    // 窗口边界必须落在 code point 上：命中点之后的截断按 UTF-16 单位算，就会正好切开一个代理对。
    const excerpt = await excerptFor(`start${'😀'.repeat(60)}${'x'.repeat(60)}`, 'start')

    expect(excerpt).toContain('start')
    expect(excerpt.endsWith('…')).toBe(true)
    // 半个代理对渲染出来是乱码方块，行里永远不该出现。
    expect(LONE_SURROGATE.test(excerpt)).toBe(false)
  })
})
