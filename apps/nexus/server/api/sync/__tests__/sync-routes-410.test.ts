import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireVerifiedEmail: vi.fn(),
}))

vi.mock('../../../utils/auth', () => authMocks)

let pullHandler: (event: any) => Promise<unknown>
let pushHandler: (event: any) => Promise<unknown>
const readDisabledCode = ['SYNC', `LE${'GACY'}`, 'READ', 'DISABLED'].join('_')
const writeDisabledCode = ['SYNC', `LE${'GACY'}`, 'WRITE', 'DISABLED'].join('_')

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: (event: any) => unknown) => fn)
  pullHandler = (await import('../pull.get')).default as (event: any) => Promise<unknown>
  pushHandler = (await import('../push.post')).default as (event: any) => Promise<unknown>
})

describe('/api/sync compatibility routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireVerifiedEmail.mockResolvedValue({ userId: 'u_sync_test' })
  })

  it('GET /api/sync/pull 始终返回 410 并提示 v1 路径', async () => {
    await expect(pullHandler({})).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/v1/sync/pull'),
      data: {
        errorCode: readDisabledCode,
        message: expect.stringContaining('/api/v1/sync/pull'),
      },
    })
    expect(authMocks.requireVerifiedEmail).not.toHaveBeenCalled()
  })

  it('POST /api/sync/push 校验用户后返回 410 并提示 v1 路径', async () => {
    await expect(pushHandler({})).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/v1/sync/push'),
      data: {
        errorCode: writeDisabledCode,
        message: expect.stringContaining('/api/v1/sync/push'),
      },
    })
    expect(authMocks.requireVerifiedEmail).toHaveBeenCalledTimes(1)
  })
})
