/**
 * ConversationProvider 是 CoreBox 里唯一把「对话历史」变成可执行行的组件，它同时守着两件事：
 *
 * 1. 行的形状 —— id / action / searchTokens / matchResult 决定这一行能否被 ranker 打分、能否被
 *    Enter 打开。内容命中如果丢了 excerpt token，行会以 0 分沉底；标题高亮错位会画错字。
 * 2. id 的权威 —— 行是数据，行里的 id 是不可信输入。伪造的 id 必须在**不触碰导航服务**的情况下
 *    被拒绝，否则一条搜索结果就能把主窗口导航到任意路由。
 *
 * 所以这里用真实 store/navigation 的边界（normalizeConversationId 走 importActual），只把
 * 「查库」和「导航」这两个外部副作用换成替身。
 */
import type { IExecuteArgs, TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { TuffInputType, TuffItemBuilder } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import zhCN from '../../../../../renderer/src/modules/lang/zh-CN.json'
import { ConversationProvider } from './conversation-provider'

const mocks = vi.hoisted(() => ({
  searchConversations: vi.fn(),
  openConversation: vi.fn(),
  getAppDestinationNavigationService: vi.fn(),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('../../../conversation/conversation-store', () => ({
  searchConversations: mocks.searchConversations
}))

/**
 * 导航服务换成替身，但 id 校验必须是真的：它是这一层唯一的边界，重新实现一遍就等于测试自己的
 * 副本，而不是被测代码。
 */
vi.mock('../../../app-destination/app-destination-navigation', async () => {
  const actual = await vi.importActual<
    typeof import('../../../app-destination/app-destination-navigation')
  >('../../../app-destination/app-destination-navigation')
  return {
    normalizeConversationId: actual.normalizeConversationId,
    getAppDestinationNavigationService: mocks.getAppDestinationNavigationService
  }
})

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: mocks.getLogger
}))
vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'zh-CN') }
}))

function hit(
  partial: { id: string } & Partial<{ title: string; updatedAt: number; excerpt: string }>
) {
  return { title: '', updatedAt: 1, excerpt: '', ...partial }
}

async function createProvider(load = true): Promise<ConversationProvider> {
  const provider = new ConversationProvider()
  if (load) await provider.onLoad({ touchApp: {} } as never)
  return provider
}

async function search(
  provider: ConversationProvider,
  text: string,
  signal = new AbortController().signal
): Promise<TuffSearchResult> {
  return provider.onSearch({ text } as TuffQuery, signal)
}

function onlyItem(result: TuffSearchResult): TuffItem {
  expect(result.items).toHaveLength(1)
  return result.items[0]!
}

function searchTokens(item: TuffItem): string[] {
  return (item.meta?.extension?.searchTokens ?? []) as string[]
}

function matchRanges(item: TuffItem): Array<{ start: number; end: number }> {
  return (item.meta?.extension?.matchResult ?? []) as Array<{ start: number; end: number }>
}

describe('conversationProvider search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppDestinationNavigationService.mockReturnValue({
      openConversation: mocks.openConversation
    })
  })

  it('registers as the fast history provider the engine routes by', () => {
    const provider = new ConversationProvider()

    // id 是引擎统计与 CoreBox 来源分组的键，type 'history' 决定它出现在哪一段结果里。
    expect(provider.id).toBe('conversation-provider')
    expect(provider.type).toBe('history')
    expect(provider.priority).toBe('fast')
    expect(provider.supportedInputTypes).toEqual([TuffInputType.Text])
  })

  it('maps every hit into one executable command row', async () => {
    mocks.searchConversations.mockResolvedValue([
      hit({ id: 'thread-1', title: 'Deploy checklist', excerpt: 'we deploy on friday' })
    ])
    const provider = await createProvider()

    const result = await search(provider, 'deploy')
    const item = onlyItem(result)

    expect(item.kind).toBe('command')
    expect(item.render.basic?.icon).toEqual({ type: 'class', value: 'i-ri-chat-3-line' })
    expect(item.id).toBe('conversation:thread-1')
    expect(item.meta?.extension?.conversationId).toBe('thread-1')
    expect(item.actions?.map((action) => action.id)).toEqual(['open-conversation:thread-1'])
    expect(item.render.basic?.title).toBe('Deploy checklist')
    expect(item.render.basic?.subtitle).toBe('we deploy on friday')
    expect(result.sources[0]?.status).toBe('success')
  })

  it('falls back to the localized untitled label for a blank stored title', async () => {
    mocks.searchConversations.mockResolvedValue([hit({ id: 'thread-1', title: '   ' })])
    const provider = await createProvider()

    const item = onlyItem(await search(provider, 'anything'))

    // 空标题是真实状态（首轮之后才会生成标题），渲染成空行会被当成渲染 bug。
    expect(item.render.basic?.title).toBe(zhCN.shell.history.untitled)
  })

  it('hands a content hit its excerpt as a search token so the ranker can score it', async () => {
    mocks.searchConversations.mockResolvedValue([
      hit({ id: 'thread-1', title: 'Weekly notes', excerpt: 'the needle appeared here' })
    ])
    const provider = await createProvider()

    const item = onlyItem(await search(provider, 'needle'))

    // 标题里没有 query，唯一的匹配证据就是摘要；不给 token 这一行在 ranker 里恒为 0 分。
    expect(searchTokens(item)).toEqual(['the needle appeared here'])
    expect(item.render.basic?.subtitle).toBe('the needle appeared here')
    // 标题里没有 query，就不能假装有高亮区间。
    expect(matchRanges(item)).toEqual([])
  })

  it('highlights the literal query span inside a title hit', async () => {
    mocks.searchConversations.mockResolvedValue([
      hit({ id: 'thread-1', title: 'Deploy checklist', excerpt: '' })
    ])
    const provider = await createProvider()

    const item = onlyItem(await search(provider, 'list'))
    const title = item.render.basic?.title ?? ''

    expect(matchRanges(item)).toHaveLength(1)
    expect(matchRanges(item).map((range) => title.slice(range.start, range.end))).toEqual(['list'])
  })

  it('returns an empty success result for a blank query instead of a history dump', async () => {
    mocks.searchConversations.mockResolvedValue([hit({ id: 'thread-1', title: 'alpha' })])
    const provider = await createProvider()

    for (const text of ['', '   ']) {
      const result = await search(provider, text)
      expect(result.items).toEqual([])
      expect(result.sources[0]?.status).toBe('success')
    }
  })

  it('reports a failed source instead of taking the whole search down', async () => {
    mocks.searchConversations.mockRejectedValue(new Error('database is locked'))
    const provider = await createProvider()

    const result = await search(provider, 'alpha')

    expect(result.items).toEqual([])
    expect(result.sources[0]?.status).toBe('error')
    expect(result.sources[0]?.resultCount).toBe(0)
  })

  it('drops the batch when the query was aborted before it started', async () => {
    mocks.searchConversations.mockResolvedValue([hit({ id: 'thread-1', title: 'alpha' })])
    const provider = await createProvider()
    const controller = new AbortController()
    controller.abort()

    const result = await search(provider, 'alpha', controller.signal)

    expect(result.items).toEqual([])
    expect(result.sources[0]?.status).toBe('success')
    // 每次按键都会 abort 上一批；已经作废的查询不该再去翻一遍历史库。
    expect(mocks.searchConversations).not.toHaveBeenCalled()
  })

  it('drops the batch when the query is aborted while it is in flight', async () => {
    const provider = await createProvider()
    const controller = new AbortController()
    mocks.searchConversations.mockImplementation(async () => {
      controller.abort()
      return [hit({ id: 'thread-1', title: 'alpha' })]
    })

    const result = await search(provider, 'alpha', controller.signal)

    // 挥手的查询结果回来时用户已经改了输入，这一批不能再补进结果里。
    expect(result.items).toEqual([])
  })
})

describe('conversationProvider execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppDestinationNavigationService.mockReturnValue({
      openConversation: mocks.openConversation
    })
  })

  const VALID_ID = 'thread-9'

  /**
   * 用被测代码自己的 builder 造行，而不是把字面量对象强转成 TuffItem：被执行的应该是真行，
   * 只有 conversationId 载荷是不受信的那一段。
   */
  function conversationItem(id: string, conversationId?: unknown): TuffItem {
    const builder = new TuffItemBuilder(id, 'history', 'conversation-provider')
      .setKind('command')
      .setTitle('row')
    const withMeta =
      conversationId === undefined ? builder : builder.setMeta({ extension: { conversationId } })
    return withMeta.build()
  }

  it('opens the conversation named by the row action', async () => {
    const provider = await createProvider()

    const activation = await provider.onExecute({
      item: conversationItem(`conversation:${VALID_ID}`),
      actionId: `open-conversation:${VALID_ID}`
    })

    expect(mocks.openConversation).toHaveBeenCalledExactlyOnceWith(VALID_ID)
    // 行的职责是把用户送走；返回值没人展示，所以恒为 null。
    expect(activation).toBeNull()
  })

  it('falls back to the item id when the action id is absent', async () => {
    const provider = await createProvider()

    await provider.onExecute({ item: conversationItem(`conversation:${VALID_ID}`) })

    expect(mocks.openConversation).toHaveBeenCalledExactlyOnceWith(VALID_ID)
  })

  it('falls back to the extension metadata for a rebuilt row', async () => {
    const provider = await createProvider()

    await provider.onExecute({ item: conversationItem('rebuilt-row-1', VALID_ID) })

    expect(mocks.openConversation).toHaveBeenCalledExactlyOnceWith(VALID_ID)
  })

  /**
   * 行里的 id 来自数据库，但到达这里时已经是不可信输入（搜索结果是可被重放/构造的数据）。
   * 每一条都要在**不触碰导航服务**的前提下被拒绝：调用一次就是一次任意路由导航。
   */
  it.each([
    ['actionId', `open-conversation:../../etc/passwd`],
    ['actionId', 'open-conversation:has/slash'],
    ['actionId', 'open-conversation:has space'],
    ['actionId', 'open-conversation:'],
    ['actionId', 'open-conversation:id%2e%2e'],
    ['actionId', 'open-destination:home'],
    ['itemId', 'conversation:../../etc/passwd'],
    ['itemId', 'conversation:'],
    ['itemId', 'conversation:has space'],
    ['meta', '../../etc/passwd'],
    ['meta', `${'a'.repeat(129)}`],
    ['meta', 42]
  ] as const)('rejects a forged id carried by %s: %s', async (carrier, payload) => {
    const provider = await createProvider()
    const args: IExecuteArgs =
      carrier === 'actionId'
        ? {
            item: conversationItem(`conversation:${VALID_ID}`),
            actionId: payload as string
          }
        : carrier === 'itemId'
          ? { item: conversationItem(payload as string) }
          : { item: conversationItem('rebuilt-row-1', payload) }

    // actionId 分支故意配一个合法 item.id：任何「actionId 非法就退回 item.id」的实现都会放行。
    expect(await provider.onExecute(args)).toBeNull()
    expect(mocks.openConversation).not.toHaveBeenCalled()
  })

  it('refuses to navigate before the provider has been loaded', async () => {
    const provider = await createProvider(false)

    const activation = await provider.onExecute({
      item: conversationItem(`conversation:${VALID_ID}`),
      actionId: `open-conversation:${VALID_ID}`
    })

    // 未 onLoad 就没有 runtime，导航服务无从解析；此时宁可什么都不做。
    expect(activation).toBeNull()
    expect(mocks.getAppDestinationNavigationService).not.toHaveBeenCalled()
    expect(mocks.openConversation).not.toHaveBeenCalled()
  })
})
