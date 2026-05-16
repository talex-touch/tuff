import { beforeAll, describe, expect, it, vi } from 'vitest'

let pullHandler: (event: any) => Promise<unknown>
let pushHandler: (event: any) => Promise<unknown>
const readDisabledCode = 'SYNC_RETIRED_READ_DISABLED'
const writeDisabledCode = 'SYNC_RETIRED_WRITE_DISABLED'

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: (event: any) => unknown) => fn)
  pullHandler = (await import('../../../server/api/sync/pull.get')).default as (event: any) => Promise<unknown>
  pushHandler = (await import('../../../server/api/sync/push.post')).default as (event: any) => Promise<unknown>
})

describe('/api/sync compatibility routes', () => {
  it('GET /api/sync/pull 始终返回 410 并提示 v1 路径', async () => {
    await expect(pullHandler({})).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/v1/sync/pull'),
      data: {
        errorCode: readDisabledCode,
        message: expect.stringContaining('/api/v1/sync/pull'),
      },
    })
  })

  it('POST /api/sync/push 不进入鉴权链路并返回 410', async () => {
    await expect(pushHandler({})).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/v1/sync/push'),
      data: {
        errorCode: writeDisabledCode,
        message: expect.stringContaining('/api/v1/sync/push'),
      },
    })
  })
})
