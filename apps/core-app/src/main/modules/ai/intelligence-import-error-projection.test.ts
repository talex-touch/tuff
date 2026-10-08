import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { createIntelligenceSdk } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { IntelligenceModule } from './intelligence-module'

/**
 * The MCP page learns why an import failed from the app's own channel, end to end: the real
 * registrar (`safeApiHandler` with the import projection) answers, and the renderer SDK turns the
 * answer into an error whose `code` the page reads. Every other failure keeps the public sentence.
 */

type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown>

const orchestratorMocks = vi.hoisted(() => ({
  applyImport: vi.fn(),
  previewImport: vi.fn(),
  getSnapshot: vi.fn(),
  setImportedItemActive: vi.fn(),
  cloneImportedItem: vi.fn(),
  deleteImportedItem: vi.fn()
}))

vi.mock('./ai-cli-orchestrator', () => ({ aiCliOrchestrator: orchestratorMocks }))

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

interface ChannelRegistrars {
  createChannelRegistrars: (transport: unknown) => { registerSafe: unknown }
  registerAiCliOrchestratorChannels: (registerSafe: unknown) => void
}

function registerOrchestratorChannels(): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const transport = {
    on: (event: TuffEvent<unknown, unknown> & { toEventName: () => string }, handler: Handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    }
  }
  const module = new IntelligenceModule() as unknown as ChannelRegistrars
  const { registerSafe } = module.createChannelRegistrars(transport)
  module.registerAiCliOrchestratorChannels(registerSafe)
  return handlers
}

const HOST = { eventName: 'test' } as HandlerContext

/** The renderer's SDK over the captured handlers, the way the page calls them. */
function rendererSdk(handlers: Map<string, Handler>, context: HandlerContext = HOST) {
  return createIntelligenceSdk({
    send: (async (event: { toEventName: () => string }, payload: unknown) => {
      const handler = handlers.get(event.toEventName())
      if (!handler) throw new Error(`no handler for ${event.toEventName()}`)
      return await handler(payload, context)
    }) as never
  })
}

const REQUEST = { scanId: 'scan-1', candidateIds: ['codex:mcp'] }

describe('orchestratorApplyImport failure projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [
      'Import candidate codex:mcp requires secret migration confirmation for context7',
      'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED'
    ],
    [
      'MCP_SERVER_REAUTH_REQUIRED: MCP candidate codex:mcp selects github; a server that needs re-authentication cannot run from an imported copy',
      'MCP_SERVER_REAUTH_REQUIRED'
    ],
    ['Import candidate codex:mcp changed after preview', 'AI_IMPORT_SOURCE_CHANGED'],
    [
      'Import candidate codex:mcp changed while it was being imported; try again',
      'AI_IMPORT_SOURCE_CHANGED'
    ]
  ])('hands the page a code for "%s"', async (message, code) => {
    orchestratorMocks.applyImport.mockRejectedValueOnce(new Error(message))
    const sdk = rendererSdk(registerOrchestratorChannels())

    const failure = await sdk.orchestratorApplyImport(REQUEST).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error & { code?: string }).code).toBe(code)
    // The bare code only: no candidate id, file or server name leaves main.
    expect((failure as Error).message).toBe(code)
  })

  it('keeps the public sentence for every other failure', async () => {
    orchestratorMocks.applyImport.mockRejectedValueOnce(
      new Error('Failed to persist imported secret mcpServers.release.env.API_TOKEN')
    )
    const sdk = rendererSdk(registerOrchestratorChannels())

    const failure = await sdk.orchestratorApplyImport(REQUEST).catch((error: unknown) => error)
    expect((failure as Error).message).toBe('The operation failed. Please retry.')
    expect((failure as Error & { code?: string }).code).toBeUndefined()
  })

  it('names nothing to a plugin, which is refused before the import runs', async () => {
    orchestratorMocks.applyImport.mockRejectedValueOnce(
      new Error('Import candidate codex:mcp changed after preview')
    )
    const plugin = {
      eventName: 'test',
      plugin: { name: 'third-party', uniqueKey: 'key', verified: true }
    } as HandlerContext
    const sdk = rendererSdk(registerOrchestratorChannels(), plugin)

    const failure = await sdk.orchestratorApplyImport(REQUEST).catch((error: unknown) => error)
    expect((failure as Error).message).toBe('The operation failed. Please retry.')
    expect(orchestratorMocks.applyImport).not.toHaveBeenCalled()
  })

  it('leaves the neighbouring orchestrator channels on the public sentence', async () => {
    orchestratorMocks.previewImport.mockRejectedValueOnce(
      new Error('Import candidate codex:mcp changed after preview')
    )
    const sdk = rendererSdk(registerOrchestratorChannels())

    const failure = await sdk.orchestratorPreviewImport({}).catch((error: unknown) => error)
    expect((failure as Error).message).toBe('The operation failed. Please retry.')
  })
})
