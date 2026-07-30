import type {
  PrivacyPolicyUpdateResult,
  PrivacyRetentionCategory,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'
import type { PrivacyLifecycleService } from './privacy-lifecycle-service'
import { isProxy } from 'node:util/types'

const RETENTION_POLLING_TASK_ID = 'privacy.retention.cleanup'

export interface PrivacyRetentionPollingAdapter {
  register: (
    id: string,
    callback: () => void | Promise<void>,
    options: {
      readonly interval: number
      readonly unit: 'hours'
      readonly runImmediately: boolean
      readonly lane: 'maintenance'
      readonly backpressure: 'coalesce'
      readonly maxInFlight: 1
    }
  ) => void
  unregister: (id: string) => void
}

export interface PrivacyRetentionCoordinatorOptions {
  readonly polling: PrivacyRetentionPollingAdapter
  readonly service: Pick<
    PrivacyLifecycleService,
    'runScheduledCleanup' | 'runCleanup' | 'updatePolicy' | 'destroy'
  >
}

export interface PrivacyRetentionCoordinator {
  initializeAfterStorageReady: () => Promise<void>
  runManualCleanup: (
    categories?: readonly PrivacyRetentionCategory[],
    signal?: AbortSignal
  ) => ReturnType<PrivacyLifecycleService['runCleanup']>
  updatePolicy: (selection: PrivacyRetentionSelectionV1) => Promise<PrivacyPolicyUpdateResult>
  shutdown: () => Promise<void>
}

type CoordinatorState = 'created' | 'ready' | 'failed' | 'stopped'

function exactMethods(
  value: unknown,
  names: readonly string[]
): Readonly<Record<string, (...args: never[]) => unknown>> {
  if (typeof value !== 'object' || value === null || isProxy(value))
    throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
  try {
    const prototype = Object.getPrototypeOf(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (prototype !== Object.prototype && prototype !== null)
      throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
    if (
      Reflect.ownKeys(descriptors).length !== names.length ||
      names.some((name) => {
        const descriptor = descriptors[name]
        return (
          !descriptor ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, 'value') ||
          typeof descriptor.value !== 'function' ||
          isProxy(descriptor.value)
        )
      }) ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !names.includes(key))
    ) {
      throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
    }
    return Object.freeze(
      Object.fromEntries(
        names.map((name) => [
          name,
          (descriptors[name]!.value as (...args: never[]) => unknown).bind(value)
        ])
      )
    )
  } catch {
    throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
  }
}

function cancelledPolicy(): PrivacyPolicyUpdateResult {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_OPERATION_CANCELLED' as const,
    retryable: false,
    cancelled: true
  })
}

export function createPrivacyRetentionCoordinator(
  options: PrivacyRetentionCoordinatorOptions
): PrivacyRetentionCoordinator {
  if (typeof options !== 'object' || options === null || isProxy(options))
    throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
  const optionDescriptors = Object.getOwnPropertyDescriptors(options)
  if (
    Object.getPrototypeOf(options) !== Object.prototype ||
    Reflect.ownKeys(optionDescriptors).length !== 2 ||
    !Object.hasOwn(optionDescriptors.polling ?? {}, 'value') ||
    !Object.hasOwn(optionDescriptors.service ?? {}, 'value')
  ) {
    throw new Error('PRIVACY_RETENTION_COORDINATOR_OPTIONS_INVALID')
  }

  const polling = exactMethods(optionDescriptors.polling!.value, ['register', 'unregister'])
  const service = exactMethods(optionDescriptors.service!.value, [
    'runScheduledCleanup',
    'runCleanup',
    'updatePolicy',
    'destroy'
  ])
  const controller = new AbortController()
  const activeCallbacks = new Set<Promise<unknown>>()
  let state: CoordinatorState = 'created'
  let registered = false
  let shutdownPromise: Promise<void> | null = null

  const runScheduled = async (): Promise<void> => {
    if (state !== 'ready' || controller.signal.aborted) return
    const operation = Promise.resolve(
      (service.runScheduledCleanup as unknown as PrivacyLifecycleService['runScheduledCleanup'])(
        controller.signal
      )
    )
    activeCallbacks.add(operation)
    const release = () => activeCallbacks.delete(operation)
    void operation.then(release, release)
    await operation
  }

  return Object.freeze({
    initializeAfterStorageReady: async () => {
      if (state !== 'created') throw new Error('PRIVACY_RETENTION_COORDINATOR_ALREADY_INITIALIZED')
      try {
        ;(polling.register as unknown as PrivacyRetentionPollingAdapter['register'])(
          RETENTION_POLLING_TASK_ID,
          runScheduled,
          Object.freeze({
            interval: 24,
            unit: 'hours' as const,
            runImmediately: true,
            lane: 'maintenance' as const,
            backpressure: 'coalesce' as const,
            maxInFlight: 1 as const
          })
        )
        registered = true
        state = 'ready'
      } catch (error) {
        state = 'failed'
        try {
          ;(polling.unregister as unknown as PrivacyRetentionPollingAdapter['unregister'])(
            RETENTION_POLLING_TASK_ID
          )
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'PRIVACY_RETENTION_COORDINATOR_INITIALIZATION_FAILED'
          )
        }
        throw new Error('PRIVACY_RETENTION_COORDINATOR_INITIALIZATION_FAILED', { cause: error })
      }
    },

    runManualCleanup: (categories, signal) => {
      if (state !== 'ready') {
        return Promise.resolve({
          ok: false as const,
          code:
            state === 'stopped'
              ? ('PRIVACY_OPERATION_CANCELLED' as const)
              : ('PRIVACY_OPERATION_FAILED' as const),
          retryable: false,
          ...(state === 'stopped' ? { cancelled: true } : {})
        })
      }
      return (service.runCleanup as unknown as PrivacyLifecycleService['runCleanup'])(
        categories,
        signal
      )
    },

    updatePolicy: (selection) => {
      if (state !== 'ready') {
        return Promise.resolve(
          state === 'stopped'
            ? cancelledPolicy()
            : {
                ok: false as const,
                code: 'PRIVACY_OPERATION_FAILED' as const,
                retryable: false
              }
        )
      }
      return (service.updatePolicy as unknown as PrivacyLifecycleService['updatePolicy'])(selection)
    },

    shutdown: () => {
      if (shutdownPromise) return shutdownPromise
      state = 'stopped'
      controller.abort(new Error('PRIVACY_RETENTION_COORDINATOR_DESTROYED'))
      const errors: unknown[] = []
      if (registered) {
        registered = false
        try {
          ;(polling.unregister as unknown as PrivacyRetentionPollingAdapter['unregister'])(
            RETENTION_POLLING_TASK_ID
          )
        } catch (error) {
          errors.push(error)
        }
      }
      const callbacks = [...activeCallbacks]
      shutdownPromise = (async () => {
        try {
          await (service.destroy as unknown as PrivacyLifecycleService['destroy'])()
        } catch (error) {
          errors.push(error)
        }
        const settlements = await Promise.allSettled(callbacks)
        for (const settlement of settlements) {
          if (settlement.status === 'rejected') errors.push(settlement.reason)
        }
        if (errors.length > 0) {
          throw new AggregateError(errors, 'PRIVACY_RETENTION_COORDINATOR_SHUTDOWN_FAILED')
        }
      })()
      return shutdownPromise
    }
  })
}
