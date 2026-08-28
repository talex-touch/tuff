import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { StreamContext } from '@talex-touch/utils/transport/types'
import { structuredStrictStringify } from '@talex-touch/utils'
import { SdkApi } from '@talex-touch/utils/plugin'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { PLUGIN_FACING_INTELLIGENCE_EVENTS } from '@talex-touch/utils/transport/security/plugin-facing-events'
import {
  intelligenceApiEvents,
  intelligenceContextEvents
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceContextExecutionService } from './intelligence-context-execution'
import { IntelligenceModule } from './intelligence-module'

const permissionMocks = vi.hoisted(() => ({
  getPermissionModule: vi.fn(),
  checkPermission: vi.fn(),
  getPluginByName: vi.fn()
}))

const intelligenceSdkMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  stream: vi.fn()
}))

const discoveryMocks = vi.hoisted(() => ({
  getCapabilityTestMeta: vi.fn(),
  resolveCapabilityStatus: vi.fn(),
  getProviderModelOptions: vi.fn()
}))

const intelligenceConfigMocks = vi.hoisted(() => ({
  ensureIntelligenceConfigLoaded: vi.fn()
}))

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn()
}))

vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: permissionMocks.getPermissionModule
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: permissionMocks.getPluginByName
    }
  }
}))

vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>()
  return {
    ...actual,
    createLogger: (namespace: string) => {
      const logger = actual.createLogger(namespace)
      return namespace === 'Intelligence' ? { ...logger, error: loggerMocks.error } : logger
    }
  }
})

vi.mock('../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }

  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

vi.mock('@talex-touch/utils/transport/events/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@talex-touch/utils/transport/events/types')>()),
  isIntelligenceErrorCode: vi.fn(() => false)
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: intelligenceSdkMocks
}))

vi.mock('./intelligence-config', () => ({
  debugPrintConfig: vi.fn(),
  ensureIntelligenceConfigLoaded: intelligenceConfigMocks.ensureIntelligenceConfigLoaded,
  getCapabilityOptions: vi.fn(),
  setupConfigUpdateListener: vi.fn()
}))

vi.mock('./capability-testers', () => ({
  capabilityTesterRegistry: {
    get: discoveryMocks.getCapabilityTestMeta
  }
}))

vi.mock('./intelligence-capability-status', () => ({
  resolveCapabilityStatus: discoveryMocks.resolveCapabilityStatus
}))

vi.mock('./intelligence-provider-model-options', () => ({
  getProviderModelOptions: discoveryMocks.getProviderModelOptions
}))

type EventDefinition = TuffEvent<unknown, unknown> & { toEventName: () => string }
type InvokeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type StreamHandler = (payload: unknown, context: StreamContext<unknown>) => Promise<void> | void

interface RegistrarTransport {
  on: (event: EventDefinition, handler: InvokeHandler) => () => void
  onStream: (event: EventDefinition, handler: StreamHandler) => () => void
}

interface RegistrarBundle {
  registerSafe: unknown
  registerProtectedSafe: unknown
  registerProtectedStream: (
    event: EventDefinition,
    action: string,
    permissionId: string,
    handler: StreamHandler
  ) => void
}

interface IntelligenceRegistrarHarness {
  createChannelRegistrars: (transport: RegistrarTransport) => RegistrarBundle
  registerInvokeChannels: (registerSafe: unknown, registerStream: unknown) => void
  registerKnowledgeChannels: (registerSafe: unknown) => void
  registerContextChannels: (registerSafe: unknown) => void
  registerCapabilityChannels: (registerSafe: unknown, registerProtectedSafe: unknown) => void
}

const SDK_API = SdkApi.V260817
const MISMATCHED_SDK_API = SdkApi.V260713
const PROVIDER_RESULT = {
  provider: 'permission-test-provider',
  model: 'permission-test-model',
  result: 'allowed'
}
const INVOKE_PAYLOAD = {
  capabilityId: 'text.chat',
  payload: { messages: [] },
  _sdkapi: SDK_API
}

function trustedPluginContext(): HandlerContext {
  return {
    plugin: createTrustedTestPluginContext({
      name: 'permission-test-plugin',
      pluginInstanceId: 'permission-test-instance',
      uniqueKey: 'permission-test-key'
    })
  } as HandlerContext
}

function createStreamContext(context: HandlerContext = {} as HandlerContext) {
  const emit = vi.fn()
  const error = vi.fn()
  const end = vi.fn()
  const streamContext = {
    ...context,
    emit,
    error,
    end,
    isCancelled: vi.fn(() => false),
    signal: new AbortController().signal,
    streamId: 'permission-test-stream'
  } as unknown as StreamContext<unknown>

  return { emit, end, error, streamContext }
}

function createRegistrarHarness(registerPluginSurface = true) {
  const invokeHandlers = new Map<string, InvokeHandler>()
  const streamHandlers = new Map<string, StreamHandler>()
  const on = vi.fn((event: EventDefinition, handler: InvokeHandler) => {
    invokeHandlers.set(event.toEventName(), handler)
    return () => invokeHandlers.delete(event.toEventName())
  })
  const onStream = vi.fn((event: EventDefinition, handler: StreamHandler) => {
    streamHandlers.set(event.toEventName(), handler)
    return () => streamHandlers.delete(event.toEventName())
  })
  const transport: RegistrarTransport = { on, onStream }
  const module = new IntelligenceModule() as unknown as IntelligenceRegistrarHarness
  const registrars = module.createChannelRegistrars(transport)

  if (registerPluginSurface) {
    module.registerInvokeChannels(
      registrars.registerProtectedSafe,
      registrars.registerProtectedStream
    )
    module.registerKnowledgeChannels(registrars.registerProtectedSafe)
    module.registerContextChannels(registrars.registerProtectedSafe)
    module.registerCapabilityChannels(registrars.registerSafe, registrars.registerProtectedSafe)
  }

  return { invokeHandlers, on, onStream, registrars, streamHandlers }
}

function requireInvokeHandler(
  handlers: Map<string, InvokeHandler>,
  event: { toEventName: () => string }
): InvokeHandler {
  const handler = handlers.get(event.toEventName())
  if (!handler) {
    throw new Error(`Invoke handler ${event.toEventName()} was not registered`)
  }
  return handler
}

function requireStreamHandler(
  handlers: Map<string, StreamHandler>,
  event: { toEventName: () => string }
): StreamHandler {
  const handler = handlers.get(event.toEventName())
  if (!handler) {
    throw new Error(`Stream handler ${event.toEventName()} was not registered`)
  }
  return handler
}

function expectStreamErrorCode(error: ReturnType<typeof vi.fn>, code: string): void {
  expect(error).toHaveBeenCalledOnce()
  const projected = error.mock.calls[0]?.[0] as Error & { code?: string }
  expect(projected).toBeInstanceOf(Error)
  expect(projected).toMatchObject({ message: code, code })
}

async function expectStableApiFailure(
  promise: Promise<unknown>,
  code: string,
  forbidden: string[] = []
): Promise<void> {
  const outcome = await promise
  expect(outcome).toEqual({ ok: false, error: code })
  const serialized = structuredStrictStringify(outcome)
  expect(serialized).not.toContain('"stack"')
  for (const value of forbidden) expect(serialized).not.toContain(value)
}

describe('IntelligenceModule plugin channel permission boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMocks.getPluginByName.mockReturnValue({ sdkapi: SDK_API })
    permissionMocks.checkPermission.mockReturnValue({ allowed: true })
    permissionMocks.getPermissionModule.mockReturnValue({
      checkPermission: permissionMocks.checkPermission
    })
    intelligenceSdkMocks.invoke.mockResolvedValue(PROVIDER_RESULT)
    intelligenceSdkMocks.stream.mockImplementation(async function* () {
      yield { type: 'text-delta', text: 'allowed' }
    })
    discoveryMocks.resolveCapabilityStatus.mockReturnValue({
      capabilityId: 'text.chat',
      available: true,
      providerIds: ['permission-test-provider']
    })
  })

  it('lets an authoritative permitted plugin reach the provider through the real registrar', async () => {
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)

    await expect(handler(INVOKE_PAYLOAD, trustedPluginContext())).resolves.toEqual({
      ok: true,
      result: PROVIDER_RESULT
    })

    expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
      'permission-test-plugin',
      'intelligence.basic',
      SDK_API
    )
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledOnce()
  })

  it('keeps host renderer calls working when the plugin permission runtime is unavailable', async () => {
    permissionMocks.getPermissionModule.mockReturnValue(null)
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)

    await expect(handler(INVOKE_PAYLOAD, {} as HandlerContext)).resolves.toEqual({
      ok: true,
      result: PROVIDER_RESULT
    })

    expect(permissionMocks.getPermissionModule).not.toHaveBeenCalled()
    expect(permissionMocks.checkPermission).not.toHaveBeenCalled()
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledOnce()
  })

  it('fails a trusted plugin closed when the permission runtime is unavailable', async () => {
    permissionMocks.getPermissionModule.mockReturnValue(null)
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)

    await expectStableApiFailure(
      Promise.resolve(handler(INVOKE_PAYLOAD, trustedPluginContext())),
      'INTELLIGENCE_PERMISSION_UNAVAILABLE',
      ['intelligence.basic', 'permission-test-plugin']
    )
    expect(intelligenceSdkMocks.invoke).not.toHaveBeenCalled()
  })

  it('rejects invoke, stream, and discovery before their dependencies when permission is denied', async () => {
    permissionMocks.checkPermission.mockReturnValue({
      allowed: false,
      reason: 'deny-secret-for-permission-test-plugin'
    })
    const { invokeHandlers, streamHandlers } = createRegistrarHarness()
    const plugin = trustedPluginContext()

    await expectStableApiFailure(
      Promise.resolve(
        requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)(INVOKE_PAYLOAD, plugin)
      ),
      'INTELLIGENCE_PERMISSION_DENIED',
      ['deny-secret-for-permission-test-plugin', 'permission-test-plugin']
    )

    const stream = createStreamContext(plugin)
    await requireStreamHandler(streamHandlers, intelligenceApiEvents.stream)(
      INVOKE_PAYLOAD,
      stream.streamContext
    )
    expectStreamErrorCode(stream.error, 'INTELLIGENCE_PERMISSION_DENIED')

    await expectStableApiFailure(
      Promise.resolve(
        requireInvokeHandler(invokeHandlers, intelligenceApiEvents.getCapabilityStatus)(
          { capabilityId: 'text.chat', _sdkapi: SDK_API },
          plugin
        )
      ),
      'INTELLIGENCE_PERMISSION_DENIED'
    )

    expect(intelligenceSdkMocks.invoke).not.toHaveBeenCalled()
    expect(intelligenceSdkMocks.stream).not.toHaveBeenCalled()
    expect(discoveryMocks.resolveCapabilityStatus).not.toHaveBeenCalled()
  })

  it('checks permission on every call and observes a revoke before the second provider call', async () => {
    permissionMocks.checkPermission
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValue({ allowed: false, reason: 'revoked' })
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)
    const plugin = trustedPluginContext()

    await expect(handler(INVOKE_PAYLOAD, plugin)).resolves.toMatchObject({ ok: true })
    await expectStableApiFailure(
      Promise.resolve(handler(INVOKE_PAYLOAD, plugin)),
      'INTELLIGENCE_PERMISSION_DENIED'
    )

    expect(permissionMocks.checkPermission).toHaveBeenCalledTimes(2)
    expect(intelligenceSdkMocks.invoke).toHaveBeenCalledOnce()
  })

  it('rejects a caller-authored verified flag before permission or provider work', async () => {
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)
    const forged = {
      plugin: {
        name: 'permission-test-plugin',
        uniqueKey: 'forged-key',
        verified: true
      }
    } as HandlerContext

    await expectStableApiFailure(
      Promise.resolve(handler(INVOKE_PAYLOAD, forged)),
      'INTELLIGENCE_PERMISSION_DENIED'
    )
    expect(permissionMocks.getPermissionModule).not.toHaveBeenCalled()
    expect(permissionMocks.checkPermission).not.toHaveBeenCalled()
    expect(intelligenceSdkMocks.invoke).not.toHaveBeenCalled()
  })

  it('rejects sdkapi mismatch before permission or provider work', async () => {
    const { invokeHandlers } = createRegistrarHarness()
    const handler = requireInvokeHandler(invokeHandlers, intelligenceApiEvents.invoke)

    await expectStableApiFailure(
      Promise.resolve(
        handler({ ...INVOKE_PAYLOAD, _sdkapi: MISMATCHED_SDK_API }, trustedPluginContext())
      ),
      'SDKAPI_MISMATCH',
      [String(MISMATCHED_SDK_API), String(SDK_API), 'permission-test-plugin']
    )
    expect(permissionMocks.checkPermission).not.toHaveBeenCalled()
    expect(intelligenceSdkMocks.invoke).not.toHaveBeenCalled()
  })

  it('routes every one of the 14 plugin-facing Intelligence events through intelligence.basic', async () => {
    permissionMocks.checkPermission.mockReturnValue({ allowed: false, reason: 'denied' })
    const { invokeHandlers, on, onStream, streamHandlers } = createRegistrarHarness()
    const plugin = trustedPluginContext()
    const eventNames = PLUGIN_FACING_INTELLIGENCE_EVENTS.map((event) => event.toEventName())

    expect(PLUGIN_FACING_INTELLIGENCE_EVENTS).toHaveLength(14)
    expect(new Set(eventNames)).toHaveProperty('size', 14)

    for (const event of PLUGIN_FACING_INTELLIGENCE_EVENTS) {
      const eventName = event.toEventName()
      const invokeHandler = invokeHandlers.get(eventName)
      const streamHandler = streamHandlers.get(eventName)

      expect(Number(Boolean(invokeHandler)) + Number(Boolean(streamHandler))).toBe(1)
      if (streamHandler) {
        const stream = createStreamContext(plugin)
        await streamHandler({ _sdkapi: SDK_API }, stream.streamContext)
        expectStreamErrorCode(stream.error, 'INTELLIGENCE_PERMISSION_DENIED')
      } else if (invokeHandler) {
        await expectStableApiFailure(
          Promise.resolve(invokeHandler({ _sdkapi: SDK_API }, plugin)),
          'INTELLIGENCE_PERMISSION_DENIED'
        )
      }
    }

    const registrationNames = [...on.mock.calls, ...onStream.mock.calls].map(([event]) =>
      (event as EventDefinition).toEventName()
    )
    for (const eventName of eventNames) {
      expect(registrationNames.filter((registered) => registered === eventName)).toHaveLength(1)
    }
    expect(permissionMocks.checkPermission).toHaveBeenCalledTimes(14)
    expect(permissionMocks.checkPermission.mock.calls).toEqual(
      Array.from({ length: 14 }, () => ['permission-test-plugin', 'intelligence.basic', SDK_API])
    )
  })

  it('forwards the transport abort signal into Context stream execution', async () => {
    const { streamHandlers } = createRegistrarHarness()
    const stream = createStreamContext(trustedPluginContext())
    const contextStream = vi
      .spyOn(intelligenceContextExecutionService, 'stream')
      .mockImplementation(async function* (_data, _actor, hostOptions) {
        expect(hostOptions?.signal).toBe(stream.streamContext.signal)
      })

    try {
      await requireStreamHandler(streamHandlers, intelligenceContextEvents.stream)(
        { capabilityId: 'text.chat', payload: {}, _sdkapi: SDK_API },
        stream.streamContext
      )
    } finally {
      contextStream.mockRestore()
    }

    expect(stream.end).toHaveBeenCalledOnce()
    expect(stream.error).not.toHaveBeenCalled()
  })

  it('projects stream failures and logs only a stable error code', async () => {
    const { registrars, streamHandlers } = createRegistrarHarness(false)
    const rawError = Object.assign(new Error('provider-stream-secret'), {
      code: 'PROVIDER_SECRET_CODE',
      cause: new Error('provider-cause-secret')
    })
    registrars.registerProtectedStream(
      intelligenceApiEvents.stream as unknown as EventDefinition,
      'Test generic stream failure',
      'intelligence.basic',
      async () => {
        throw rawError
      }
    )
    const stream = createStreamContext()

    await requireStreamHandler(streamHandlers, intelligenceApiEvents.stream)(
      INVOKE_PAYLOAD,
      stream.streamContext
    )

    expect(stream.error).toHaveBeenCalledOnce()
    const projected = stream.error.mock.calls[0]?.[0] as Error & { code?: string }
    expect(projected).toBeInstanceOf(Error)
    expect(projected).toMatchObject({ message: 'UNKNOWN', code: 'UNKNOWN' })
    expect(loggerMocks.error).toHaveBeenCalledWith('Test generic stream failure failed', {
      meta: { code: 'UNKNOWN' }
    })
    expect(JSON.stringify(loggerMocks.error.mock.calls)).not.toContain('provider-stream-secret')
    expect(JSON.stringify(loggerMocks.error.mock.calls)).not.toContain('provider-cause-secret')
  })
})
