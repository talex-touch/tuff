import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type {
  PrivacyRequest,
  PrivacyResultByOperation
} from '@talex-touch/utils/transport/events/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { PrivacyLifecycleService } from './privacy-lifecycle-service'
import { isProxy } from 'node:util/types'
import { PrivacyEvents } from '@talex-touch/utils/transport/events'
import {
  normalizePrivacyRequest,
  normalizePrivacyResult
} from '@talex-touch/utils/transport/events/types'

export interface PrivacyTransportAdapter {
  on: (
    event: TuffEvent<unknown, unknown>,
    handler: (payload: unknown, context: unknown) => Promise<unknown>
  ) => () => void
}

export type PrivacyTransportService = Pick<
  PrivacyLifecycleService,
  | 'getPolicy'
  | 'updatePolicy'
  | 'getSummary'
  | 'previewCleanup'
  | 'runCleanup'
  | 'previewCategoryDelete'
  | 'exportCategories'
  | 'deleteCategories'
  | 'getProviderDisclosure'
  | 'backupSecretsPreview'
  | 'backupSecretsWrite'
  | 'restoreSecretsPreview'
  | 'restoreSecretsApply'
>

const SERVICE_METHODS = [
  'getPolicy',
  'updatePolicy',
  'getSummary',
  'previewCleanup',
  'runCleanup',
  'previewCategoryDelete',
  'exportCategories',
  'deleteCategories',
  'getProviderDisclosure',
  'backupSecretsPreview',
  'backupSecretsWrite',
  'restoreSecretsPreview',
  'restoreSecretsApply'
] as const

const TRANSPORT_SNAPSHOT_MAX_DEPTH = 8
const TRANSPORT_SNAPSHOT_MAX_ENTRIES = 4_096

function snapshotTransportData(
  value: unknown,
  state: { entries: number } = { entries: 0 },
  depth = 0
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }
  if (typeof value !== 'object' || isProxy(value) || depth >= TRANSPORT_SNAPSHOT_MAX_DEPTH) {
    throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
  }

  const prototype = Object.getPrototypeOf(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  state.entries += keys.length
  if (state.entries > TRANSPORT_SNAPSHOT_MAX_ENTRIES) {
    throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
  }

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
    const lengthDescriptor = descriptors.length
    const length = lengthDescriptor?.value
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
      throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
    }
    const result: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
      }
      result.push(snapshotTransportData(descriptor.value, state, depth + 1))
    }
    return result
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
  }
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = typeof key === 'string' ? descriptors[key] : undefined
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new Error('PRIVACY_TRANSPORT_DATA_INVALID')
    }
    result[key] = snapshotTransportData(descriptor.value, state, depth + 1)
  }
  return result
}

function invalidRequest() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_REQUEST_INVALID' as const,
    retryable: false
  })
}

function unsupported() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_OPERATION_FAILED' as const,
    retryable: false
  })
}

function isHostContext(value: unknown, expectedEventName: string): value is HandlerContext {
  if (typeof value !== 'object' || value === null || isProxy(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (
      keys.length !== 3 ||
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          !['sender', 'eventName', 'plugin'].includes(key) ||
          !Object.hasOwn(descriptors[key] ?? {}, 'value')
      )
    ) {
      return false
    }
    const sender = descriptors.sender!.value
    return (
      (typeof sender === 'object' || typeof sender === 'function') &&
      sender !== null &&
      descriptors.eventName!.value === expectedEventName &&
      descriptors.plugin!.value === undefined
    )
  } catch {
    return false
  }
}

function findDataMethod(value: object, name: string): ((...args: never[]) => unknown) | null {
  try {
    let current: object | null = value
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (isProxy(current)) return null
      const descriptor = Object.getOwnPropertyDescriptor(current, name)
      if (descriptor) {
        return Object.hasOwn(descriptor, 'value') &&
          typeof descriptor.value === 'function' &&
          !isProxy(descriptor.value)
          ? (descriptor.value as (...args: never[]) => unknown)
          : null
      }
      current = Object.getPrototypeOf(current) as object | null
    }
    return null
  } catch {
    return null
  }
}

function snapshotService(service: PrivacyTransportService): PrivacyTransportService {
  if (typeof service !== 'object' || service === null || isProxy(service)) {
    throw new Error('PRIVACY_TRANSPORT_OPTIONS_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(service)
  const result: Record<string, unknown> = Object.create(null)
  for (const name of SERVICE_METHODS) {
    const descriptor = descriptors[name]
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      typeof descriptor.value !== 'function' ||
      isProxy(descriptor.value)
    ) {
      throw new Error('PRIVACY_TRANSPORT_OPTIONS_INVALID')
    }
    result[name] = descriptor.value.bind(service)
  }
  return Object.freeze(result) as unknown as PrivacyTransportService
}

function normalizeOperationResult<T extends keyof PrivacyResultByOperation>(
  operation: T,
  value: unknown
): PrivacyResultByOperation[T] {
  try {
    return normalizePrivacyResult(operation, snapshotTransportData(value))
  } catch {
    return normalizePrivacyResult(operation, unsupported())
  }
}

export function registerPrivacyTransportHandlers(
  transport: PrivacyTransportAdapter,
  serviceSource: PrivacyTransportService
): () => void {
  if (typeof transport !== 'object' || transport === null || isProxy(transport)) {
    throw new Error('PRIVACY_TRANSPORT_OPTIONS_INVALID')
  }
  const onMethod = findDataMethod(transport, 'on')
  if (!onMethod) {
    throw new Error('PRIVACY_TRANSPORT_OPTIONS_INVALID')
  }
  const on = onMethod.bind(transport) as PrivacyTransportAdapter['on']
  const service = snapshotService(serviceSource)
  const disposers: Array<() => void> = []

  function disposeAll(): void {
    const errors: unknown[] = []
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'PRIVACY_TRANSPORT_DISPOSE_FAILED')
    }
  }

  function register<T extends keyof PrivacyResultByOperation>(
    event: TuffEvent<unknown, unknown>,
    operation: T,
    invoke: (request: Extract<PrivacyRequest, { operation: T }>) => Promise<unknown>
  ): void {
    try {
      disposers.push(
        on(event, async (payload, context) => {
          if (!isHostContext(context, event.toEventName())) return invalidRequest()
          let request: PrivacyRequest
          try {
            request = normalizePrivacyRequest(snapshotTransportData(payload))
          } catch {
            return invalidRequest()
          }
          if (request.operation !== operation) return invalidRequest()
          try {
            return normalizeOperationResult(
              operation,
              await invoke(request as Extract<PrivacyRequest, { operation: T }>)
            )
          } catch {
            return normalizeOperationResult(operation, unsupported())
          }
        })
      )
    } catch (error) {
      try {
        disposeAll()
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'PRIVACY_TRANSPORT_REGISTRATION_FAILED')
      }
      throw error
    }
  }

  register(PrivacyEvents.policy.get as TuffEvent<unknown, unknown>, 'policy.get', () =>
    service.getPolicy()
  )
  register(PrivacyEvents.policy.update as TuffEvent<unknown, unknown>, 'policy.update', (request) =>
    service.updatePolicy(request.policy)
  )
  register(PrivacyEvents.summary.get as TuffEvent<unknown, unknown>, 'summary.get', (request) =>
    service.getSummary(request.categories)
  )
  register(
    PrivacyEvents.cleanup.preview as TuffEvent<unknown, unknown>,
    'cleanup.preview',
    (request) => service.previewCleanup(request.categories)
  )
  register(PrivacyEvents.cleanup.run as TuffEvent<unknown, unknown>, 'cleanup.run', (request) =>
    service.runCleanup(request.categories)
  )
  register(
    PrivacyEvents.category.export as TuffEvent<unknown, unknown>,
    'category.export',
    (request) => service.exportCategories(request.categories)
  )
  register(
    PrivacyEvents.category.deletePreview as TuffEvent<unknown, unknown>,
    'category.delete-preview',
    (request) => service.previewCategoryDelete(request.categories)
  )
  register(
    PrivacyEvents.category.delete as TuffEvent<unknown, unknown>,
    'category.delete',
    (request) =>
      service.deleteCategories(request.categories, request.confirmation, request.previewId)
  )
  register(
    PrivacyEvents.provider.disclosure as TuffEvent<unknown, unknown>,
    'provider-disclosure.get',
    () => service.getProviderDisclosure()
  )
  register(
    PrivacyEvents.secret.backupPreview as TuffEvent<unknown, unknown>,
    'secret-backup.preview',
    () => service.backupSecretsPreview()
  )
  register(
    PrivacyEvents.secret.backupWrite as TuffEvent<unknown, unknown>,
    'secret-backup.write',
    (request) => service.backupSecretsWrite(request.password)
  )
  register(
    PrivacyEvents.secret.restorePreview as TuffEvent<unknown, unknown>,
    'secret-restore.preview',
    (request) => service.restoreSecretsPreview(request.password)
  )
  register(
    PrivacyEvents.secret.restoreApply as TuffEvent<unknown, unknown>,
    'secret-restore.apply',
    (request) =>
      service.restoreSecretsApply(request.restoreId, request.password, request.conflictPolicy)
  )

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    disposeAll()
  }
}
