import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getRouterParam: vi.fn(),
}))

const orchestratorMocks = vi.hoisted(() => ({
  runSceneOrchestrator: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/sceneOrchestrator', () => orchestratorMocks)

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
  runSceneHandler = (await import('../../../../server/api/dashboard/provider-registry/scenes/[id]/run.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run',
    node: { req: { url: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run' } },
    context: { params: { id: 'corebox.selection.translate' } },
  }
}

describe('/api/dashboard/provider-registry/scenes/:id/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.getRouterParam.mockReturnValue('corebox.selection.translate')
    h3Mocks.readBody.mockResolvedValue({
      input: { text: 'hello' },
      capability: 'text.translate',
      providerId: 'prv_tencent_cloud_mt',
      dryRun: true,
    })
    orchestratorMocks.runSceneOrchestrator.mockResolvedValue({
      runId: 'scene_run_1',
      sceneId: 'corebox.selection.translate',
      status: 'planned',
      mode: 'dry_run',
      selected: [],
      trace: [],
      usage: [],
      output: null,
    })
  })

  it('管理员可以 dry-run scene execution plan', async () => {
    const result = await runSceneHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(orchestratorMocks.runSceneOrchestrator).toHaveBeenCalledWith(
      expect.anything(),
      'corebox.selection.translate',
      {
        input: { text: 'hello' },
        capability: 'text.translate',
        providerId: 'prv_tencent_cloud_mt',
        dryRun: true,
      },
    )
    expect(result).toEqual({
      run: expect.objectContaining({
        runId: 'scene_run_1',
        status: 'planned',
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
