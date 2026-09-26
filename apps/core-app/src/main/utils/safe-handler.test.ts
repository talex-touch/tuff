import { describe, expect, it, vi } from 'vitest'

vi.mock('../modules/permission/channel-guard', () => ({
  withPermission: vi.fn(
    (_permission: unknown, handler: (payload: unknown, context: unknown) => unknown) => handler
  )
}))

import { withPermission } from '../modules/permission/channel-guard'
import { safeApiHandler, safeOpHandler, withPermissionSafeApi } from './safe-handler'

const withPermissionMock = vi.mocked(withPermission)
const SAFE_PUBLIC_ERROR = 'The operation failed. Please retry.'

describe('safe-handler', () => {
  it('safeApiHandler returns ok response on success', async () => {
    const handler = safeApiHandler(async (payload: { value: number }) => ({
      doubled: payload.value * 2
    }))

    const result = await handler({ value: 2 }, {} as never)

    expect(result).toEqual({
      ok: true,
      result: { doubled: 4 }
    })
  })

  it('safeApiHandler redacts thrown messages and calls onError', async () => {
    const onError = vi.fn()
    const handler = safeApiHandler(
      async () => {
        throw new Error('boom')
      },
      { onError }
    )

    const result = await handler({ q: 1 }, {} as never)

    expect(result).toEqual({ ok: false, error: SAFE_PUBLIC_ERROR })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('safeApiHandler projects a recognized failure into its safe code and retryable flag', async () => {
    const onError = vi.fn()
    const raw = new Error('SPEECH_CATALOG_TIMEOUT: exceeded the 25000ms deadline')
    const handler = safeApiHandler(
      async () => {
        throw raw
      },
      {
        onError,
        projectError: (error) =>
          error instanceof Error && error.message.startsWith('SPEECH_CATALOG_TIMEOUT')
            ? {
                error: 'The speech model catalog request timed out.',
                code: 'SPEECH_CATALOG_TIMEOUT',
                retryable: true
              }
            : undefined
      }
    )

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({
      ok: false,
      error: 'The speech model catalog request timed out.',
      code: 'SPEECH_CATALOG_TIMEOUT',
      retryable: true
    })
    // The raw detail is still available to the in-process error log, never to the caller.
    expect(onError).toHaveBeenCalledWith(raw, undefined, {})
  })

  it('safeApiHandler keeps the generic error when the projector declines the failure', async () => {
    const handler = safeApiHandler(
      async () => {
        throw new Error('https://nexus.example.test/api/v1/speech/models?digest=deadbeef')
      },
      { projectError: () => undefined }
    )

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ ok: false, error: SAFE_PUBLIC_ERROR })
  })

  it('safeApiHandler keeps the generic error when the projector itself throws', async () => {
    const handler = safeApiHandler(
      async () => {
        throw new Error('boom')
      },
      {
        projectError: () => {
          throw new Error('projector bug')
        }
      }
    )

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ ok: false, error: SAFE_PUBLIC_ERROR })
  })

  it('safeOpHandler merges success payload when handler returns object', async () => {
    const handler = safeOpHandler(async () => ({ taskId: 'task-1' }))

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ success: true, taskId: 'task-1' })
  })

  it('safeOpHandler redacts thrown messages', async () => {
    const onError = vi.fn()
    const handler = safeOpHandler(
      async () => {
        throw new Error('op failed')
      },
      { onError }
    )

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ success: false, error: SAFE_PUBLIC_ERROR })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('withPermissionSafeApi keeps permission wrapper and redacts errors', async () => {
    withPermissionMock.mockImplementationOnce(() => {
      return async () => {
        throw new Error('permission denied')
      }
    })

    const handler = withPermissionSafeApi({} as never, async () => ({ ok: 1 }))

    const result = await handler({} as never, {} as never)

    expect(withPermissionMock).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, error: SAFE_PUBLIC_ERROR })
  })
})
