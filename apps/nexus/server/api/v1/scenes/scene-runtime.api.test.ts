import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getRouterParam: vi.fn(),
}))

const orchestratorMocks = vi.hoisted(() => ({
  runSceneOrchestrator: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)
vi.mock('../../../utils/sceneOrchestrator', () => orchestratorMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
    getRouterParam: h3Mocks.getRouterParam,
  }
})

let runSceneHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  runSceneHandler = (await import('./[id]/run.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/v1/scenes/corebox.selection.translate/run',
    node: { req: { url: '/api/v1/scenes/corebox.selection.translate/run' } },
    context: { params: { id: 'corebox.selection.translate' } },
  }
}

describe('/api/v1/scenes/:id/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAuth.mockResolvedValue({
      userId: 'user_1',
      authSource: 'app',
    })
    h3Mocks.getRouterParam.mockReturnValue('corebox.selection.translate')
    h3Mocks.readBody.mockResolvedValue({
      input: { text: 'hello', targetLang: 'zh' },
      capability: 'text.translate',
      providerId: 'prv_tencent_cloud_mt',
      dryRun: false,
    })
    orchestratorMocks.runSceneOrchestrator.mockResolvedValue({
      runId: 'scene_run_1',
      sceneId: 'corebox.selection.translate',
      status: 'completed',
      mode: 'execute',
      selected: [],
      trace: [],
      usage: [],
      output: { translatedText: '你好' },
    })
  })

  it('普通登录态可以运行 scene runtime', async () => {
    const result = await runSceneHandler(makeEvent())

    expect(authMocks.requireAuth).toHaveBeenCalledWith(expect.anything())
    expect(orchestratorMocks.runSceneOrchestrator).toHaveBeenCalledWith(
      expect.anything(),
      'corebox.selection.translate',
      {
        input: { text: 'hello', targetLang: 'zh' },
        capability: 'text.translate',
        providerId: 'prv_tencent_cloud_mt',
        dryRun: false,
      },
    )
    expect(result).toEqual({
      run: expect.objectContaining({
        runId: 'scene_run_1',
        status: 'completed',
      }),
    })
  })

  it('缺少 scene id 时拒绝执行', async () => {
    h3Mocks.getRouterParam.mockReturnValue('')

    await expect(runSceneHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'id is required.',
    })
    expect(orchestratorMocks.runSceneOrchestrator).not.toHaveBeenCalled()
  })
})
