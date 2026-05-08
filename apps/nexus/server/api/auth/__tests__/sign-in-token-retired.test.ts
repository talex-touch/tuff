import { beforeEach, describe, expect, it } from 'vitest'

beforeEach(() => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
})

describe('/api/auth/sign-in-token retired route', () => {
  it('returns 410 with app-auth replacement path', async () => {
    const handler = (await import('../sign-in-token.post')).default as (event: any) => Promise<any>

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/app-auth/sign-in-token'),
      data: {
        errorCode: 'AUTH_SIGN_IN_TOKEN_RETIRED',
        replacement: '/api/app-auth/sign-in-token',
      },
    })
  })
})
