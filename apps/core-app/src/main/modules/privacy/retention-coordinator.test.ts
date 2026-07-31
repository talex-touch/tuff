import type {
  PrivacyRetentionCategory,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import { createPrivacyRetentionCoordinator } from './retention-coordinator'

const SELECTION: PrivacyRetentionSelectionV1 = {
  version: 1,
  selections: {
    'clipboard-history': '90-days',
    'ocr-screenshot-temp': '1-day',
    'search-history': '30-days',
    'intelligence-audit': '30-days',
    'intelligence-context': '30-days',
    diagnostics: '30-days'
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createHarness() {
  let callback: (() => void | Promise<void>) | undefined
  const polling = {
    register: vi.fn((_id: string, nextCallback: () => void | Promise<void>) => {
      callback = nextCallback
    }),
    unregister: vi.fn()
  }
  const service = {
    runScheduledCleanup: vi.fn(async (_signal?: AbortSignal) => ({
      ok: true as const,
      data: { categories: [], partial: false }
    })),
    runCleanup: vi.fn(
      async (_categories?: readonly PrivacyRetentionCategory[], _signal?: AbortSignal) => ({
        ok: true as const,
        data: { categories: [], partial: false }
      })
    ),
    updatePolicy: vi.fn(async () => ({
      ok: false as const,
      code: 'PRIVACY_POLICY_INVALID' as const,
      retryable: false
    })),
    destroy: vi.fn(async () => undefined)
  }
  const coordinator = createPrivacyRetentionCoordinator({ polling, service })
  return { coordinator, polling, service, getCallback: () => callback }
}

describe('privacy retention coordinator', () => {
  it('registers one immediate daily maintenance task only after storage readiness', async () => {
    const harness = createHarness()

    await expect(harness.coordinator.runManualCleanup()).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OPERATION_FAILED'
    })
    expect(harness.service.runCleanup).not.toHaveBeenCalled()

    await harness.coordinator.initializeAfterStorageReady()
    expect(harness.polling.register).toHaveBeenCalledOnce()
    expect(harness.polling.register).toHaveBeenCalledWith(
      'privacy.retention.cleanup',
      expect.any(Function),
      {
        interval: 24,
        unit: 'hours',
        runImmediately: true,
        lane: 'maintenance',
        backpressure: 'coalesce',
        maxInFlight: 1
      }
    )
    await expect(harness.coordinator.initializeAfterStorageReady()).rejects.toThrow(
      'PRIVACY_RETENTION_COORDINATOR_ALREADY_INITIALIZED'
    )
  })

  it('returns and awaits the scheduled service cleanup with one lifecycle signal', async () => {
    const harness = createHarness()
    const release = deferred()
    let observedSignal: AbortSignal | undefined
    harness.service.runScheduledCleanup.mockImplementationOnce(async (signal) => {
      observedSignal = signal
      await release.promise
      return { ok: true as const, data: { categories: [], partial: false } }
    })
    await harness.coordinator.initializeAfterStorageReady()

    let settled = false
    const running = Promise.resolve(harness.getCallback()?.()).finally(() => {
      settled = true
    })
    await vi.waitFor(() => expect(harness.service.runScheduledCleanup).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    expect(observedSignal?.aborted).toBe(false)
    release.resolve()
    await running
  })

  it('delegates manual cleanup and policy updates to the globally serialized service', async () => {
    const harness = createHarness()
    await harness.coordinator.initializeAfterStorageReady()
    const categories: readonly PrivacyRetentionCategory[] = ['search-history']
    const signal = new AbortController().signal

    await harness.coordinator.runManualCleanup(categories, signal)
    await harness.coordinator.updatePolicy(SELECTION)

    expect(harness.service.runCleanup).toHaveBeenCalledWith(categories, signal)
    expect(harness.service.updatePolicy).toHaveBeenCalledWith(SELECTION)
  })

  it('closes admission, unregisters, aborts, and drains service before shutdown resolves', async () => {
    const harness = createHarness()
    const releaseDestroy = deferred()
    const order: string[] = []
    harness.polling.unregister.mockImplementation(() => order.push('unregister'))
    harness.service.destroy.mockImplementation(async () => {
      order.push('destroy:start')
      await releaseDestroy.promise
      order.push('destroy:end')
    })
    await harness.coordinator.initializeAfterStorageReady()
    const retainedCallback = harness.getCallback()!

    let settled = false
    const shutdown = harness.coordinator.shutdown().finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(order).toEqual(['unregister', 'destroy:start'])
    await retainedCallback()
    expect(harness.service.runScheduledCleanup).not.toHaveBeenCalled()
    await expect(harness.coordinator.runManualCleanup()).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      cancelled: true
    })

    releaseDestroy.resolve()
    await shutdown
    expect(order).toEqual(['unregister', 'destroy:start', 'destroy:end'])
    await harness.coordinator.shutdown()
    expect(harness.service.destroy).toHaveBeenCalledOnce()
  })

  it('attempts unregister, service destruction and callback drain while retaining failures', async () => {
    const harness = createHarness()
    harness.polling.unregister.mockImplementation(() => {
      throw new Error('CANARY_UNREGISTER_FAILURE')
    })
    harness.service.destroy.mockRejectedValueOnce(new Error('CANARY_DESTROY_FAILURE'))
    await harness.coordinator.initializeAfterStorageReady()

    const failure = await harness.coordinator.shutdown().catch((error: unknown) => error)
    expect(harness.polling.unregister).toHaveBeenCalledOnce()
    expect(harness.service.destroy).toHaveBeenCalledOnce()
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'CANARY_UNREGISTER_FAILURE' }),
      expect.objectContaining({ message: 'CANARY_DESTROY_FAILURE' })
    ])
  })

  it('unregisters a partially registered task when registration fails', async () => {
    let retainedCallback: (() => void | Promise<void>) | undefined
    const polling = {
      register: vi.fn((_id: string, callback: () => void | Promise<void>) => {
        retainedCallback = callback
        throw new Error('CANARY_POLLING_FAILURE')
      }),
      unregister: vi.fn()
    }
    const service = {
      runScheduledCleanup: vi.fn(),
      runCleanup: vi.fn(),
      updatePolicy: vi.fn(),
      destroy: vi.fn(async () => undefined)
    }
    const coordinator = createPrivacyRetentionCoordinator({ polling, service } as never)

    await expect(coordinator.initializeAfterStorageReady()).rejects.toThrow(
      'PRIVACY_RETENTION_COORDINATOR_INITIALIZATION_FAILED'
    )
    expect(polling.unregister).toHaveBeenCalledWith('privacy.retention.cleanup')
    await retainedCallback?.()
    expect(service.runScheduledCleanup).not.toHaveBeenCalled()
    await coordinator.shutdown()
    expect(service.destroy).toHaveBeenCalledOnce()
  })

  it('rejects proxy and accessor dependencies before invoking hostile getters', () => {
    const getter = vi.fn(() => vi.fn())
    const polling = Object.defineProperty({ unregister: vi.fn() }, 'register', {
      enumerable: true,
      get: getter
    })
    expect(() =>
      createPrivacyRetentionCoordinator({
        polling: polling as never,
        service: {
          runScheduledCleanup: vi.fn(),
          runCleanup: vi.fn(),
          updatePolicy: vi.fn(),
          destroy: vi.fn()
        }
      })
    ).toThrow('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
    expect(getter).not.toHaveBeenCalled()
    expect(() => createPrivacyRetentionCoordinator(new Proxy({}, {}) as never)).toThrow(
      'PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID'
    )
  })
})
