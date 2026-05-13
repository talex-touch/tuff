import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const entityStoreMocks = vi.hoisted(() => ({
  listPilotEntitiesAll: vi.fn(),
}))

vi.mock('../../utils/pilot-entity-store', () => entityStoreMocks)

interface FakeEvent {
  context: {
    params?: Record<string, unknown>
  }
  node: {
    res: {
      statusCode?: number
      statusMessage?: string
    }
  }
}

function createFakeEvent(params: Record<string, unknown> = {}): FakeEvent {
  return {
    context: { params },
    node: { res: { statusCode: 200 } },
  }
}

let livechatRandomHandler: (event: FakeEvent) => Promise<any>
let promptDetailHandler: (event: FakeEvent) => any
let catchAllHandler: (event: FakeEvent) => any

beforeAll(async () => {
  livechatRandomHandler = (await import('../livechat/random.get')).default as typeof livechatRandomHandler
  promptDetailHandler = (await import('../aigc/prompts/detail/[id]/index.get')).default as typeof promptDetailHandler
  catchAllHandler = (await import('../[...path]')).default as typeof catchAllHandler
})

describe('pilot compat placeholder API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns unavailable instead of a consumable livechat placeholder when no data exists', async () => {
    entityStoreMocks.listPilotEntitiesAll.mockResolvedValue([])
    const event = createFakeEvent()

    const result = await livechatRandomHandler(event)

    expect(event.node.res.statusCode).toBe(503)
    expect(result).toMatchObject({
      code: 503,
      message: '微信实时会话数据暂不可用。',
      data: {
        status: 'unavailable',
        reason: 'wechat_livechat_data_unavailable',
        migrationTarget: '/api/livechat/list',
      },
    })
    expect(result.data).not.toHaveProperty('answer')
    expect(result.data).not.toHaveProperty('exempted')
  })

  it('returns gone for the retired prompt detail compatibility route', () => {
    const event = createFakeEvent({ id: '42' })

    const result = promptDetailHandler(event)

    expect(event.node.res.statusCode).toBe(410)
    expect(result).toMatchObject({
      code: 410,
      message: '旧提示词详情接口已退役，请使用当前提示词接口。',
      data: {
        status: 'unavailable',
        reason: 'prompt_detail_route_retired',
        migrationTarget: '/api/aigc/prompts/:id',
      },
    })
    expect(result.data).not.toHaveProperty('title')
    expect(result.data).not.toHaveProperty('content')
  })

  it('sets HTTP 501 for catch-all unimplemented API routes', () => {
    const event = createFakeEvent({ path: ['unknown', 'endpoint'] })

    const result = catchAllHandler(event)

    expect(event.node.res.statusCode).toBe(501)
    expect(result).toMatchObject({
      code: 501,
      message: 'M0 未实现接口: /api/unknown/endpoint',
      data: {
        status: 'unavailable',
        reason: 'endpoint_not_implemented',
      },
    })
  })
})
