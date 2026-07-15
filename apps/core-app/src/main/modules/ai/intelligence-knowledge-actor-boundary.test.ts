import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceKnowledgeEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { IntelligenceModule } from './intelligence-module'

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

const localKnowledgeEngineMocks = vi.hoisted(() => ({
  indexDocument: vi.fn(async (input: { id?: string }) => ({
    document: { id: input.id },
    chunks: []
  })),
  indexChunk: vi.fn(async (input: { id?: string; documentId?: string }) => ({
    chunk: { id: input.id, documentId: input.documentId }
  })),
  search: vi.fn(async () => ({ status: 'ok', hits: [] })),
  buildContext: vi.fn(async () => ({
    status: 'ok',
    contextText: '',
    chunks: [],
    tokenEstimate: 0,
    citations: []
  }))
}))

vi.mock('./intelligence-local-knowledge-engine', () => ({
  localKnowledgeEngine: localKnowledgeEngineMocks
}))
vi.mock('@talex-touch/utils/transport/events/types', () => ({
  isIntelligenceErrorCode: vi.fn(() => false)
}))

type KnowledgeHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown
type KnowledgeEventKey = 'indexDocument' | 'indexChunk' | 'search' | 'buildContext'

interface KnowledgeChannelRegistrar {
  registerKnowledgeChannels: (register: unknown) => void
}

function captureKnowledgeHandlers(): Map<string, KnowledgeHandler> {
  const handlers = new Map<string, KnowledgeHandler>()
  const register = vi.fn(
    (
      event: TuffEvent<unknown, unknown> & { toEventName: () => string },
      _action: string,
      _permissionId: string,
      handler: KnowledgeHandler
    ) => {
      handlers.set(event.toEventName(), handler)
    }
  )
  const module = new IntelligenceModule() as unknown as KnowledgeChannelRegistrar
  module.registerKnowledgeChannels(register)
  return handlers
}

function getHandler(
  handlers: Map<string, KnowledgeHandler>,
  eventKey: KnowledgeEventKey
): KnowledgeHandler {
  const handler = handlers.get(intelligenceKnowledgeEvents[eventKey].toEventName())
  if (!handler) {
    throw new Error(`Knowledge handler for ${eventKey} was not registered`)
  }
  return handler
}

function pluginContext(pluginId = 'notes-plugin'): HandlerContext {
  return {
    plugin: { name: pluginId, uniqueKey: `${pluginId}-key`, verified: true }
  } as HandlerContext
}

function lastInput(operation: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const input = operation.mock.calls.at(-1)?.[0]
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Knowledge engine did not receive an object payload')
  }
  return input as Record<string, unknown>
}

describe('intelligenceModule local knowledge actor boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives plugin scope and deterministic namespaces for explicit and implicit document ids', async () => {
    const handlers = captureKnowledgeHandlers()
    const indexDocument = getHandler(handlers, 'indexDocument')
    const explicitPayload = {
      id: 'shared-document',
      sourceType: 'plugin',
      sourceUri: 'plugin://notes/getting-started',
      title: 'Getting Started',
      content: 'Plugin-owned searchable text.',
      permissionScope: 'plugin:other-plugin',
      metadata: { category: 'guide' },
      chunkSize: 320
    }
    const implicitPayload = {
      sourceType: 'plugin',
      sourceUri: 'plugin://notes/release-notes',
      title: 'Release Notes',
      content: 'Stable implicit identity source.',
      metadata: { category: 'release-notes' },
      chunkSize: 480
    }

    await indexDocument(explicitPayload, pluginContext())
    const explicitFirst = lastInput(localKnowledgeEngineMocks.indexDocument)
    await indexDocument(explicitPayload, pluginContext())
    const explicitSecond = lastInput(localKnowledgeEngineMocks.indexDocument)
    await indexDocument(implicitPayload, pluginContext())
    const implicitFirst = lastInput(localKnowledgeEngineMocks.indexDocument)
    await indexDocument(implicitPayload, pluginContext())
    const implicitSecond = lastInput(localKnowledgeEngineMocks.indexDocument)

    for (const forwarded of [explicitFirst, explicitSecond, implicitFirst, implicitSecond]) {
      expect(forwarded.permissionScope).toBe('plugin:notes-plugin')
    }
    expect(explicitFirst).toEqual({
      ...explicitPayload,
      id: expect.any(String),
      permissionScope: 'plugin:notes-plugin'
    })
    expect(implicitFirst).toEqual({
      ...implicitPayload,
      id: expect.any(String),
      permissionScope: 'plugin:notes-plugin'
    })
    expect(explicitFirst.id).not.toBe(explicitPayload.id)
    expect(implicitFirst.id).toEqual(expect.any(String))
    expect(explicitSecond.id).toBe(explicitFirst.id)
    expect(implicitSecond.id).toBe(implicitFirst.id)
  })

  it('keeps same local document identities isolated between verified plugins', async () => {
    const handlers = captureKnowledgeHandlers()
    const indexDocument = getHandler(handlers, 'indexDocument')
    const payloads = [
      {
        name: 'explicit id',
        payload: {
          id: 'shared-document',
          sourceType: 'plugin',
          title: 'Shared Document',
          content: 'Shared source content.'
        }
      },
      {
        name: 'implicit id',
        payload: {
          sourceType: 'plugin',
          sourceUri: 'plugin://shared/source',
          title: 'Shared Source',
          content: 'Shared source content.'
        }
      }
    ]

    for (const { payload } of payloads) {
      await indexDocument(payload, pluginContext('first-plugin'))
      const firstPluginInput = lastInput(localKnowledgeEngineMocks.indexDocument)
      await indexDocument(payload, pluginContext('second-plugin'))
      const secondPluginInput = lastInput(localKnowledgeEngineMocks.indexDocument)

      expect(firstPluginInput.permissionScope).toBe('plugin:first-plugin')
      expect(secondPluginInput.permissionScope).toBe('plugin:second-plugin')
      expect(firstPluginInput.id).toEqual(expect.any(String))
      expect(secondPluginInput.id).toEqual(expect.any(String))
      expect(secondPluginInput.id).not.toBe(firstPluginInput.id)
    }
  })

  it('accepts a returned scoped document id but isolates attacker-supplied chunk and document ids', async () => {
    const handlers = captureKnowledgeHandlers()
    const indexDocument = getHandler(handlers, 'indexDocument')
    const indexChunk = getHandler(handlers, 'indexChunk')
    const documentResult = (await indexDocument(
      {
        id: 'document-local-id',
        sourceType: 'plugin',
        title: 'Chunk Parent',
        content: 'Parent content.'
      },
      pluginContext()
    )) as { document: { id: string } }
    const scopedDocumentId = documentResult.document.id

    await indexChunk(
      {
        id: 'chunk-local-id',
        documentId: scopedDocumentId,
        chunkIndex: 3,
        content: 'A returned document id must remain usable.',
        metadata: { section: 'returned-parent' }
      },
      pluginContext()
    )
    const returnedParentChunk = lastInput(localKnowledgeEngineMocks.indexChunk)

    const attackerPayload = {
      id: 'chunk-local-id',
      documentId: 'plugin:other-plugin:document-local-id',
      chunkIndex: 7,
      content: 'An attacker cannot select another plugin document.',
      metadata: { section: 'attacker-parent' }
    }
    await indexChunk(attackerPayload, pluginContext())
    const attackerFirst = lastInput(localKnowledgeEngineMocks.indexChunk)
    await indexChunk(attackerPayload, pluginContext())
    const attackerSecond = lastInput(localKnowledgeEngineMocks.indexChunk)

    expect(scopedDocumentId).toEqual(expect.any(String))
    expect(returnedParentChunk).toEqual({
      ...attackerPayload,
      id: expect.any(String),
      documentId: scopedDocumentId,
      chunkIndex: 3,
      content: 'A returned document id must remain usable.',
      metadata: { section: 'returned-parent' }
    })
    expect(returnedParentChunk.id).not.toBe('chunk-local-id')
    expect(attackerFirst).toEqual({
      ...attackerPayload,
      id: expect.any(String),
      documentId: expect.any(String)
    })
    expect(attackerFirst.id).not.toBe(attackerPayload.id)
    expect(attackerFirst.documentId).not.toBe(attackerPayload.documentId)
    expect(attackerSecond.id).toBe(attackerFirst.id)
    expect(attackerSecond.documentId).toBe(attackerFirst.documentId)
  })

  it('binds plugin search and context requests to one scope without losing filters or budgets', async () => {
    const handlers = captureKnowledgeHandlers()
    const search = getHandler(handlers, 'search')
    const buildContext = getHandler(handlers, 'buildContext')
    const scopeVariants = [
      { name: 'string scope', permissionScope: 'host:core-app' },
      { name: 'scope array', permissionScope: ['plugin:other-plugin', 'host:core-app'] },
      { name: 'omitted scope' }
    ] as const

    for (const variant of scopeVariants) {
      const searchPayload = {
        query: 'retrieve exact notes',
        ...variant,
        limit: 11,
        sourceType: ['plugin', 'manual'],
        timeRange: { from: 100, to: 200 },
        metadata: { team: 'intelligence', priority: 2 }
      }
      await search(searchPayload, pluginContext())
      expect(lastInput(localKnowledgeEngineMocks.search)).toEqual({
        ...searchPayload,
        permissionScope: 'plugin:notes-plugin'
      })

      const contextPayload = {
        query: 'compose exact context',
        ...variant,
        limit: 9,
        sourceType: ['plugin', 'manual'],
        timeRange: { from: 300, to: 400 },
        metadata: { team: 'intelligence', reviewed: true },
        tokenBudget: 1_200,
        maxChunks: 6,
        dedupe: false
      }
      await buildContext(contextPayload, pluginContext())
      expect(lastInput(localKnowledgeEngineMocks.buildContext)).toEqual({
        ...contextPayload,
        permissionScope: 'plugin:notes-plugin'
      })
    }
  })

  it('forwards host knowledge payload objects unchanged for every operation', async () => {
    const handlers = captureKnowledgeHandlers()
    const calls: Array<{
      eventKey: KnowledgeEventKey
      operation: { mock: { calls: unknown[][] } }
      payload: Record<string, unknown>
    }> = [
      {
        eventKey: 'indexDocument',
        operation: localKnowledgeEngineMocks.indexDocument,
        payload: {
          id: 'host-document',
          sourceType: 'manual',
          title: 'Host Document',
          content: 'Host-owned content.',
          permissionScope: 'workspace:host'
        }
      },
      {
        eventKey: 'indexChunk',
        operation: localKnowledgeEngineMocks.indexChunk,
        payload: {
          id: 'host-chunk',
          documentId: 'host-document',
          chunkIndex: 1,
          content: 'Host-owned chunk.'
        }
      },
      {
        eventKey: 'search',
        operation: localKnowledgeEngineMocks.search,
        payload: {
          query: 'host query',
          permissionScope: ['workspace:host', 'workspace:other'],
          limit: 5
        }
      },
      {
        eventKey: 'buildContext',
        operation: localKnowledgeEngineMocks.buildContext,
        payload: {
          query: 'host context query',
          permissionScope: 'workspace:host',
          tokenBudget: 800,
          maxChunks: 3
        }
      }
    ]

    for (const { eventKey, operation, payload } of calls) {
      await getHandler(handlers, eventKey)(payload, {} as HandlerContext)
      expect(lastInput(operation)).toBe(payload)
    }
  })

  it('leaves malformed plugin document payloads to existing engine validation', async () => {
    const handlers = captureKnowledgeHandlers()
    const indexDocument = getHandler(handlers, 'indexDocument')
    const engineError = new Error('Invalid knowledge document: content is required')
    localKnowledgeEngineMocks.indexDocument.mockRejectedValueOnce(engineError)

    await expect(indexDocument(null, pluginContext())).rejects.toBe(engineError)
    expect(localKnowledgeEngineMocks.indexDocument).toHaveBeenCalledWith(null)
  })
})
