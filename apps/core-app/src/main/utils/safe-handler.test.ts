import { describe, expect, it, vi } from 'vitest'

vi.mock('../modules/permission/channel-guard', () => ({
  withPermission: vi.fn(
    (_permission: unknown, handler: (payload: unknown, context: unknown) => unknown) => handler
  )
}))

import { withPermission } from '../modules/permission/channel-guard'
import { safeApiHandler, safeOpHandler, withPermissionSafeApi } from './safe-handler'

const withPermissionMock = vi.mocked(withPermission)

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

  it('safeApiHandler returns error response and calls onError', async () => {
    const onError = vi.fn()
    const handler = safeApiHandler(
      async () => {
        throw new Error('boom')
      },
      { onError }
    )

    const result = await handler({ q: 1 }, {} as never)

    expect(result).toEqual({ ok: false, error: 'boom' })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('safeOpHandler merges success payload when handler returns object', async () => {
    const handler = safeOpHandler(async () => ({ taskId: 'task-1' }))

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ success: true, taskId: 'task-1' })
  })

  it('safeOpHandler returns failure response on throw', async () => {
    const onError = vi.fn()
    const handler = safeOpHandler(
      async () => {
        throw new Error('op failed')
      },
      { onError }
    )

    const result = await handler(undefined, {} as never)

    expect(result).toEqual({ success: false, error: 'op failed' })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('withPermissionSafeApi keeps permission wrapper and normalizes error', async () => {
    withPermissionMock.mockImplementationOnce(() => {
      return async () => {
        throw new Error('permission denied')
      }
    })

    const handler = withPermissionSafeApi({} as never, async () => ({ ok: 1 }))

    const result = await handler({} as never, {} as never)

    expect(withPermissionMock).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, error: 'permission denied' })
  })
})
