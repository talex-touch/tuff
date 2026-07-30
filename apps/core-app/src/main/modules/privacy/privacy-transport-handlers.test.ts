import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import { PrivacyEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { registerPrivacyTransportHandlers } from './privacy-transport-handlers'

const DELETE_PREVIEW_ID = 'preview_0123456789abcdef'

function hostContext(event: TuffEvent<unknown, unknown>) {
  return { sender: { id: 41 }, eventName: event.toEventName(), plugin: undefined }
}

function createTransportHarness() {
  const handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  const transport = {
    on: vi.fn(
      (
        event: TuffEvent<unknown, unknown>,
        handler: (payload: unknown, context: unknown) => unknown
      ) => {
        handlers.set(event.toEventName(), handler)
        const dispose = vi.fn()
        disposers.push(dispose)
        return dispose
      }
    )
  }
  return { transport, handlers, disposers }
}

function createService() {
  return {
    getPolicy: vi.fn(async () => ({ ok: true, data: { policy: {}, supportedPresets: [] } })),
    updatePolicy: vi.fn(async () => ({ ok: true, data: { policy: {} } })),
    getSummary: vi.fn(async () => ({ ok: true, data: { categories: [] } })),
    previewCleanup: vi.fn(async () => ({ ok: true, data: { categories: [], bounded: false } })),
    runCleanup: vi.fn(async () => ({ ok: true, data: { categories: [], partial: false } })),
    previewCategoryDelete: vi.fn(async () => ({
      ok: true,
      data: { categories: [], bounded: false, previewId: DELETE_PREVIEW_ID }
    })),
    exportCategories: vi.fn(async () => ({
      ok: true,
      data: {
        format: 'talex.touch.privacy-export/v1',
        categories: ['clipboard-history'],
        cancelled: false,
        itemCount: 0,
        byteCount: 0,
        reportId: 'report_export_handler'
      }
    })),
    deleteCategories: vi.fn(async () => ({ ok: true, data: { categories: [], partial: false } })),
    getProviderDisclosure: vi.fn(async () => ({ ok: true, data: { providers: [] } })),
    backupSecretsPreview: vi.fn(async () => ({
      ok: true,
      data: { portableEntryCount: 2, available: true }
    })),
    backupSecretsWrite: vi.fn(async () => ({
      ok: true,
      data: { format: 'talex.touch.secret-backup', version: 1, cancelled: false }
    })),
    restoreSecretsPreview: vi.fn(async () => ({
      ok: true,
      data: {
        restoreId: 'restore_1234567890abcdef',
        totalEntryCount: 2,
        conflictCount: 1,
        newEntryCount: 1
      }
    })),
    restoreSecretsApply: vi.fn(async () => ({
      ok: true,
      data: { importedCount: 2, overwrittenCount: 1, skippedCount: 0 }
    }))
  }
}

describe('privacy typed transport handlers', () => {
  it('registers every canonical PrivacyEvent and disposes exact registrations', () => {
    const harness = createTransportHarness()
    const dispose = registerPrivacyTransportHandlers(
      harness.transport as never,
      createService() as never
    )
    expect([...harness.handlers.keys()].sort()).toEqual(
      [
        PrivacyEvents.policy.get,
        PrivacyEvents.policy.update,
        PrivacyEvents.summary.get,
        PrivacyEvents.cleanup.preview,
        PrivacyEvents.cleanup.run,
        PrivacyEvents.category.export,
        PrivacyEvents.category.deletePreview,
        PrivacyEvents.category.delete,
        PrivacyEvents.provider.disclosure,
        PrivacyEvents.secret.backupPreview,
        PrivacyEvents.secret.backupWrite,
        PrivacyEvents.secret.restorePreview,
        PrivacyEvents.secret.restoreApply
      ]
        .map((event) => event.toEventName())
        .sort()
    )
    dispose()
    expect(harness.disposers.every((entry) => entry.mock.calls.length === 1)).toBe(true)
  })

  it('attempts every registered disposer and retains aggregate failures', () => {
    const harness = createTransportHarness()
    const dispose = registerPrivacyTransportHandlers(
      harness.transport as never,
      createService() as never
    )
    harness.disposers[0]!.mockImplementationOnce(() => {
      throw new Error('CANARY_FIRST_DISPOSER')
    })
    harness.disposers[5]!.mockImplementationOnce(() => {
      throw new Error('CANARY_SECOND_DISPOSER')
    })

    const failure = (() => {
      try {
        dispose()
        return undefined
      } catch (error) {
        return error
      }
    })()
    expect(harness.disposers.every((entry) => entry.mock.calls.length === 1)).toBe(true)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toHaveLength(2)
  })

  it('supports a trusted main transport with its on method on the prototype', () => {
    class PrototypeTransport {
      readonly handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()

      on(
        event: TuffEvent<unknown, unknown>,
        handler: (payload: unknown, context: unknown) => unknown
      ) {
        this.handlers.set(event.toEventName(), handler)
        return vi.fn()
      }
    }

    const transport = new PrototypeTransport()
    const dispose = registerPrivacyTransportHandlers(transport as never, createService() as never)
    expect(transport.handlers.size).toBe(13)
    dispose()
  })

  it('rejects forged DTOs and plugin callers before service or owner work', async () => {
    const harness = createTransportHarness()
    const service = createService()
    registerPrivacyTransportHandlers(harness.transport as never, service as never)
    const invoke = (
      event: TuffEvent<unknown, unknown>,
      payload: unknown,
      context: unknown = hostContext(event)
    ) => harness.handlers.get(event.toEventName())!(payload, context)

    await expect(
      invoke(PrivacyEvents.category.export, {
        operation: 'category.export',
        categories: ['clipboard-history'],
        path: '/Users/private/export.json'
      })
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })
    await expect(
      invoke(
        PrivacyEvents.category.delete,
        {
          operation: 'category.delete',
          categories: ['clipboard-history'],
          confirmation: 'delete-selected-data',
          previewId: DELETE_PREVIEW_ID
        },
        {
          ...hostContext(PrivacyEvents.category.delete),
          plugin: { name: 'forged-plugin' }
        }
      )
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })
    await expect(
      invoke(
        PrivacyEvents.category.delete,
        {
          operation: 'category.delete',
          categories: ['clipboard-history'],
          confirmation: 'delete-selected-data',
          previewId: DELETE_PREVIEW_ID
        },
        {
          ...hostContext(PrivacyEvents.category.delete),
          plugin: createTrustedTestPluginContext({ name: 'trusted-plugin' })
        }
      )
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    await expect(
      invoke(PrivacyEvents.policy.get, { operation: 'provider-disclosure.get' })
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    expect(service.exportCategories).not.toHaveBeenCalled()
    expect(service.deleteCategories).not.toHaveBeenCalled()
    expect(service.getPolicy).not.toHaveBeenCalled()
  })

  it('does not invoke accessor-backed payloads and maps valid exact requests', async () => {
    const harness = createTransportHarness()
    const service = createService()
    registerPrivacyTransportHandlers(harness.transport as never, service as never)
    const handler = harness.handlers.get(PrivacyEvents.summary.get.toEventName())!
    const getter = vi.fn(() => ['clipboard-history'])
    const accessor = Object.defineProperty({ operation: 'summary.get' }, 'categories', {
      enumerable: true,
      get: getter
    })

    await expect(handler(accessor, hostContext(PrivacyEvents.summary.get))).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_REQUEST_INVALID',
      retryable: false
    })
    expect(getter).not.toHaveBeenCalled()
    expect(service.getSummary).not.toHaveBeenCalled()

    const proxyTrap = vi.fn(() => Array.prototype)
    const proxyCategories = new Proxy(['clipboard-history'], { getPrototypeOf: proxyTrap })
    await expect(
      handler(
        { operation: 'summary.get', categories: proxyCategories },
        hostContext(PrivacyEvents.summary.get)
      )
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_REQUEST_INVALID',
      retryable: false
    })
    expect(proxyTrap).not.toHaveBeenCalled()
    expect(service.getSummary).not.toHaveBeenCalled()

    const contextGetter = vi.fn(() => undefined)
    const accessorContext = Object.defineProperty(
      {
        sender: { id: 41 },
        eventName: PrivacyEvents.summary.get.toEventName()
      },
      'plugin',
      { enumerable: true, get: contextGetter }
    )
    await expect(
      handler({ operation: 'summary.get', categories: ['clipboard-history'] }, accessorContext)
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_REQUEST_INVALID',
      retryable: false
    })
    expect(contextGetter).not.toHaveBeenCalled()

    await handler(
      { operation: 'summary.get', categories: ['clipboard-history'] },
      hostContext(PrivacyEvents.summary.get)
    )
    expect(service.getSummary).toHaveBeenCalledWith(['clipboard-history'])

    const deletePreviewHandler = harness.handlers.get(
      PrivacyEvents.category.deletePreview.toEventName()
    )!
    await deletePreviewHandler(
      {
        operation: 'category.delete-preview',
        categories: ['clipboard-history', 'search-history']
      },
      hostContext(PrivacyEvents.category.deletePreview)
    )
    expect(service.previewCategoryDelete).toHaveBeenCalledWith([
      'clipboard-history',
      'search-history'
    ])

    const deleteHandler = harness.handlers.get(PrivacyEvents.category.delete.toEventName())!
    await deleteHandler(
      {
        operation: 'category.delete',
        categories: ['clipboard-history', 'search-history'],
        confirmation: 'delete-selected-data',
        previewId: DELETE_PREVIEW_ID
      },
      hostContext(PrivacyEvents.category.delete)
    )
    expect(service.deleteCategories).toHaveBeenCalledWith(
      ['clipboard-history', 'search-history'],
      'delete-selected-data',
      DELETE_PREVIEW_ID
    )
  })

  it('routes Secret operations to the snapped main service without retaining passwords', async () => {
    const harness = createTransportHarness()
    const service = createService()
    registerPrivacyTransportHandlers(harness.transport as never, service as never)
    const password = 'correct horse battery staple'
    const result = await harness.handlers.get(PrivacyEvents.secret.backupWrite.toEventName())!(
      { operation: 'secret-backup.write', password },
      hostContext(PrivacyEvents.secret.backupWrite)
    )
    expect(result).toEqual({
      ok: true,
      data: { format: 'talex.touch.secret-backup', version: 1, cancelled: false }
    })
    expect(service.backupSecretsWrite).toHaveBeenCalledWith(password)
    expect(JSON.stringify(service)).not.toContain(password)
  })
})
