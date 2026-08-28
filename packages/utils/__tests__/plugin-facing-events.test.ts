import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TuffEvent } from '../transport/event/types'
import type { StreamController } from '../transport/types'
import { createPluginIntelligenceFacade } from '../plugin/sdk/intelligence'
import {
  isPluginFacingEvent,
  PLUGIN_FACING_INTELLIGENCE_EVENTS,
  pluginFacingEventNames,
} from '../transport/security/plugin-facing-events'
import { ClipboardEvents, PluginEvents, StorageEvents } from '../transport/events'
import { TuffMainTransport } from '../transport/sdk/main-transport'
import {
  createIntelligenceSdk,
  type IntelligenceSdkTransport,
} from '../transport/sdk/domains/intelligence'

const { ipcHandle, browserWindowMock } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  browserWindowMock: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandle },
  MessageChannelMain: class {},
  BrowserWindow: browserWindowMock,
}))

/** Records which `<channel>:<event>` pairs a transport actually binds. */
function createHarness() {
  const bound = new Set<string>()
  const channel = {
    regChannel: vi.fn((type: string, eventName: string) => {
      bound.add(`${type}:${eventName}`)
      return () => bound.delete(`${type}:${eventName}`)
    }),
    sendTo: vi.fn(),
    send: vi.fn(),
  }
  const keyManager = {
    requestKey: vi.fn(),
    revokeKey: vi.fn(),
    resolveKey: vi.fn(),
    isValidKey: vi.fn(() => false),
    resolveIdentity: vi.fn(),
    resolveCurrentIdentity: vi.fn(),
    resolveSenderIdentity: vi.fn(),
  }
  return {
    bound,
    transport: new TuffMainTransport(channel as never, keyManager as never),
  }
}

/**
 * The plugin channel's allowlist has to stay equal to what the plugin SDK actually sends (#688).
 *
 * `TuffMainTransport` binds a handler to `BRIDGE_CHANNEL.PLUGIN` only when its event is on that
 * list. Getting the list wrong fails in one of two directions, and only one of them is loud:
 *
 * - **too short** — a plugin's call is simply never answered. No error, no log, no compile
 *   failure, and no test here drives a real plugin view, so it would ship.
 * - **too long** — a host-only handler is reachable from any plugin view again, which is the
 *   defect this closed.
 *
 * So the list is not curated by hand: this re-derives it from `packages/utils/plugin/**`, the
 * only path a plugin has to the transport, and fails on any difference in either direction.
 */

const UTILS_ROOT = path.resolve(__dirname, '..')
/**
 * Everything a plugin can import and reach the transport through.
 *
 * Deliberately just `plugin/`. `renderer/storage` looks like a peer but is renderer-only —
 * neither the plugin SDK nor any plugin in this repo imports it — and including it silently
 * added four `StorageEvents.app.*` entries to the allowlist, which is the "too long"
 * direction above.
 */
const PLUGIN_SDK_ROOTS = ['plugin']
/** How the SDK hands an event to the transport. */
const SEND_SHAPES = /(?:\.send|\.sendStream|\.openStream|\.invoke|\.stream|\.on)\(\s*((?:[A-Z][A-Za-z0-9]*Events)\.[A-Za-z0-9_.]+)/g

/**
 * Transport infrastructure rather than SDK surface: a plugin upgrades to a MessagePort through
 * these, so they are reachable by design and no `plugin/**` source names them.
 */
const PROTOCOL_EVENTS = [
  'TransportEvents.port.upgrade',
  'TransportEvents.port.confirm',
  'TransportEvents.port.close',
  'TransportEvents.port.error',
]

const APPROVED_INTELLIGENCE_FACADE_METHOD_PATHS = [
  'agent.run',
  'audio.stt',
  'audio.transcribe',
  'audio.tts',
  'chatLangChain',
  'code.debug',
  'code.explain',
  'code.generate',
  'code.refactor',
  'code.review',
  'content.extract',
  'contextEvaluateMemory',
  'contextInvoke',
  'contextStream',
  'embedding.generate',
  'getCapabilityStatus',
  'getCapabilityTestMeta',
  'getProviderModelOptions',
  'image.analyze',
  'image.caption',
  'image.edit',
  'image.generate',
  'image.translateE2e',
  'intent.detect',
  'invoke',
  'keywords.extract',
  'knowledgeBuildContext',
  'knowledgeIndexChunk',
  'knowledgeIndexDocument',
  'knowledgeSearch',
  'rag.query',
  'search.rerank',
  'search.semantic',
  'sentiment.analyze',
  'stream',
  'text.chat',
  'text.classify',
  'text.grammar',
  'text.rewrite',
  'text.summarize',
  'text.translate',
  'ttsSpeak',
  'vision.ocr',
  'workflow.execute',
] as const

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist')
        sourceFiles(full, found)
      continue
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.'))
      found.push(full)
  }
  return found
}

/** The event constants the plugin SDK hands to the transport, as written. */
function sdkSentConstants(): Set<string> {
  const found = new Set<string>(PROTOCOL_EVENTS)
  for (const root of PLUGIN_SDK_ROOTS) {
    for (const file of sourceFiles(path.join(UTILS_ROOT, root))) {
      for (const [, constant] of readFileSync(file, 'utf8').matchAll(SEND_SHAPES))
        found.add(constant)
    }
  }
  return found
}

/** The same constants, as the allowlist module writes them. */
function allowlistConstants(): Set<string> {
  const source = readFileSync(
    path.join(UTILS_ROOT, 'transport/security/plugin-facing-events.ts'),
    'utf8',
  )
  const body = source.slice(source.indexOf('export const PLUGIN_FACING_EVENTS'))
  return new Set(
    [...body.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*Events\.[A-Za-z0-9_.]+),$/gm)].map(
      ([, constant]) => constant,
    ),
  )
}

interface FacadeMethod {
  path: string
  invoke: (...args: unknown[]) => unknown
}

function collectFacadeMethods(root: object): FacadeMethod[] {
  const methods: FacadeMethod[] = []
  const visited = new WeakSet<object>()

  const visit = (value: object, prefix: string): void => {
    if (visited.has(value)) return
    visited.add(value)
    for (const property of Reflect.ownKeys(value)) {
      if (typeof property !== 'string') continue
      const path = prefix ? `${prefix}.${property}` : property
      const member = Reflect.get(value, property)
      if (typeof member === 'function') {
        methods.push({ path, invoke: member as (...args: unknown[]) => unknown })
      } else if (member && typeof member === 'object') {
        visit(member, path)
      }
    }
  }

  visit(root, '')
  return methods.sort((left, right) => left.path.localeCompare(right.path))
}

function probeArgs(methodPath: string): unknown[] {
  const streamOptions = {
    onStart: vi.fn(),
    onDelta: vi.fn(),
    onMessage: vi.fn(),
    onUsage: vi.fn(),
    onMetadata: vi.fn(),
    onPartEvent: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
  }
  const payload = {
    capabilityId: 'probe.capability',
    messages: [],
    payload: {},
  }

  if (methodPath === 'invoke') return ['probe.capability', payload, {}]
  if (methodPath === 'stream') return ['probe.capability', payload, streamOptions, {}]
  if (methodPath === 'contextStream') return [payload, streamOptions]
  return [payload, {}]
}

async function probeIntelligenceFacade() {
  const calls: Array<{ methodPath: string; eventName: string; mode: 'send' | 'stream' }> = []
  let activeMethodPath = ''
  const record = (event: TuffEvent<unknown, unknown>, mode: 'send' | 'stream'): void => {
    calls.push({ methodPath: activeMethodPath, eventName: event.toEventName(), mode })
  }
  const controller: StreamController = {
    cancel: vi.fn(),
    cancelled: false,
    streamId: 'intelligence-facade-probe',
  }
  const transport = {
    send: vi.fn(async (event: TuffEvent<unknown, unknown>) => {
      record(event, 'send')
      return { ok: true, result: {} }
    }),
    stream: vi.fn(async (event: TuffEvent<unknown, unknown>) => {
      record(event, 'stream')
      return controller
    }),
  } as unknown as IntelligenceSdkTransport
  const sdk = createIntelligenceSdk(transport)
  const facade = createPluginIntelligenceFacade(() => sdk)
  const methods = collectFacadeMethods(facade)

  for (const method of methods) {
    activeMethodPath = method.path
    const previousCallCount = calls.length
    await method.invoke(...probeArgs(method.path))
    expect(calls.slice(previousCallCount).map(call => call.methodPath)).toEqual([method.path])
  }

  return { calls, methodPaths: methods.map(method => method.path) }
}

describe('plugin-facing event allowlist', () => {
  it('reads the sources it means to compare', () => {
    // Positive control. Both halves of the comparison below are scans, and two equal empty
    // sets pass. A wrong root, a renamed export, or a call shape the regex does not know
    // would each produce exactly that.
    expect(sdkSentConstants().size).toBeGreaterThan(80)
    expect(allowlistConstants().size).toBeGreaterThan(80)
    expect(pluginFacingEventNames().length).toBeGreaterThan(80)
  })

  it('lists exactly what the plugin SDK sends', () => {
    const sent = sdkSentConstants()
    const listed = allowlistConstants()

    // Reported separately: one direction breaks plugins silently, the other reopens #688.
    const missing = [...sent].filter(constant => !listed.has(constant)).sort()
    const extra = [...listed].filter(constant => !sent.has(constant)).sort()

    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it('derives the Intelligence allowlist from every real plugin facade method', async () => {
    const { calls, methodPaths } = await probeIntelligenceFacade()
    const reachedEventNames = [...new Set(calls.map(call => call.eventName))].sort()
    const listedEventNames = PLUGIN_FACING_INTELLIGENCE_EVENTS
      .map(event => event.toEventName())
      .sort()

    expect(methodPaths).toEqual(APPROVED_INTELLIGENCE_FACADE_METHOD_PATHS)
    expect(reachedEventNames).toEqual(listedEventNames)
    expect(
      pluginFacingEventNames().filter(name => name.startsWith('intelligence:')),
    ).toEqual(reachedEventNames)
  })

  it('detects newly exposed root and nested Intelligence facade methods', () => {
    const transport = {
      send: vi.fn(async () => ({ ok: true, result: {} })),
    } as unknown as IntelligenceSdkTransport
    const sdk = createIntelligenceSdk(transport) as ReturnType<typeof createIntelligenceSdk> & {
      futureRootMethod?: () => void
    }
    sdk.futureRootMethod = vi.fn()
    Object.assign(sdk.text, { futureNestedMethod: vi.fn() })
    const facade = createPluginIntelligenceFacade(() => sdk)
    const methodPaths = collectFacadeMethods(facade).map(method => method.path)

    expect(methodPaths).toContain('futureRootMethod')
    expect(methodPaths).toContain('text.futureNestedMethod')
    expect(methodPaths).not.toEqual(APPROVED_INTELLIGENCE_FACADE_METHOD_PATHS)
  })

  it('every listed constant resolves to a real event name', () => {
    // A typo'd path would be `undefined` at import and throw, but a *renamed* event would
    // quietly resolve to something else. Names are what the transport actually matches on.
    for (const name of pluginFacingEventNames()) {
      expect(name).toMatch(/^[a-z][\w-]*(?::[\w-]+)+$/i)
      expect(isPluginFacingEvent(name)).toBe(true)
    }
  })

  it('refuses an event nothing declared', () => {
    // The default-deny itself. Without this, an allowlist that returned true for everything
    // would satisfy every assertion above.
    expect(isPluginFacingEvent('plugin:definitely-not-declared')).toBe(false)
    expect(isPluginFacingEvent('')).toBe(false)
  })

  it('binds on() to the plugin channel only for a listed event', () => {
    const { bound, transport } = createHarness()

    transport.on(PluginEvents.storage.getStats, async () => ({}) as never)
    transport.on(StorageEvents.app.delete, async () => ({}) as never)

    // Host binding is unconditional; the plugin one is the gate.
    expect(bound.has(`main:${PluginEvents.storage.getStats.toEventName()}`)).toBe(true)
    expect(bound.has(`main:${StorageEvents.app.delete.toEventName()}`)).toBe(true)

    expect(bound.has(`plugin:${PluginEvents.storage.getStats.toEventName()}`)).toBe(true)
    expect(bound.has(`plugin:${StorageEvents.app.delete.toEventName()}`)).toBe(false)
  })

  it('applies the same gate to onStream, both start and cancel', () => {
    // Covering only `on()` would leave the entire stream surface bound — the half that is
    // easy to miss, and the one a source-level assertion is most likely to wave through.
    const { bound, transport } = createHarness()

    transport.onStream(ClipboardEvents.change, () => {})
    transport.onStream(StorageEvents.app.updated, () => {})

    const listed = ClipboardEvents.change.toEventName()
    const hostOnly = StorageEvents.app.updated.toEventName()

    expect(bound.has(`plugin:${listed}:stream:start`)).toBe(true)
    expect(bound.has(`plugin:${listed}:stream:cancel`)).toBe(true)
    expect(bound.has(`plugin:${hostOnly}:stream:start`)).toBe(false)
    expect(bound.has(`plugin:${hostOnly}:stream:cancel`)).toBe(false)
    expect(bound.has(`main:${hostOnly}:stream:start`)).toBe(true)
  })
})
