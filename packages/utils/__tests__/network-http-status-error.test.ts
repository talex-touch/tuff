import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkHttpStatusError, request } from '../network'

describe('network request HTTP status errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects non-2xx JSON responses without retaining their body by default', async () => {
    const responseData = {
      code: 'AUTH_INVALID',
      message: 'The access token is invalid',
      recovery: 'Sign in again',
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    )

    const pendingRequest = request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
    })

    await expect(pendingRequest).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(pendingRequest).rejects.toMatchObject({
      status: 401,
      code: 'NETWORK_HTTP_STATUS_401',
      responseData: undefined,
    })
  })

  it('rejects non-2xx JSON responses with their parsed body when explicitly requested', async () => {
    const responseData = {
      code: 'AUTH_INVALID',
      message: 'The access token is invalid',
      recovery: 'Sign in again',
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    )

    const pendingRequest = request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
      captureErrorResponseData: true,
    })

    await expect(pendingRequest).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(pendingRequest).rejects.toMatchObject({
      status: 401,
      code: 'NETWORK_HTTP_STATUS_401',
      responseData,
    })
  })
})
