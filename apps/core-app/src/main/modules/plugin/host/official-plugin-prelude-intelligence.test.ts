import type { PluginHostCapability } from './plugin-host-wire'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude, PluginHostChildError } from './plugin-host-child-runtime'

const pluginsRoot = path.resolve(process.cwd(), '../../plugins')
const scriptContent = readFileSync(path.join(pluginsRoot, 'touch-intelligence', 'index.js'), 'utf8')
const capabilities = [
  'permission.check',
  'feature.registry.add',
  'feature.registry.remove',
  'feature.registry.list',
  'feature.items.widget.push',
  'feature.items.push',
  'feature.items.clear',
  'storage.file.read',
  'storage.file.write',
  'clipboard.write',
  'clipboard.copy-and-paste',
  'intelligence.invoke',
  'intelligence.context.invoke'
] as const satisfies readonly PluginHostCapability[]

interface IntelligenceHarnessState {
  clipboard: string[]
  contextRequests: Array<Record<string, unknown>>
  features: Array<Record<string, unknown>>
  items: Array<Record<string, unknown>>
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) throw new Error('intelligence Prelude fixture timed out')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function createHarness(generation: number) {
  const state: IntelligenceHarnessState = {
    clipboard: [],
    contextRequests: [],
    features: [],
    items: []
  }
  const invokeCapability = vi.fn(
    async (capability: PluginHostCapability, payload: unknown): Promise<unknown> => {
      switch (capability) {
        case 'permission.check':
          return { granted: true }
        case 'feature.registry.list':
          return { features: state.features }
        case 'feature.registry.add':
          state.features.push((payload as { feature: Record<string, unknown> }).feature)
          return { added: true }
        case 'feature.registry.remove': {
          const featureId = (payload as { featureId: string }).featureId
          const previousLength = state.features.length
          state.features = state.features.filter((feature) => feature.id !== featureId)
          return { removed: state.features.length !== previousLength }
        }
        case 'feature.items.clear': {
          const removed = state.items.length
          state.items = []
          return { removed }
        }
        case 'feature.items.widget.push':
        case 'feature.items.push':
          state.items = (payload as { items: Array<Record<string, unknown>> }).items
          return { ok: true }
        case 'storage.file.read':
          return { found: false }
        case 'storage.file.write':
          return { ok: true }
        case 'clipboard.write':
          state.clipboard.push((payload as { content: { text: string } }).content.text)
          return { ok: true }
        case 'clipboard.copy-and-paste':
          return { ok: true }
        case 'intelligence.invoke': {
          const request = payload as { operation: string }
          if (request.operation !== 'provider-models.list') {
            throw new Error('unexpected direct Intelligence invoke')
          }
          return {
            operation: 'provider-models.list',
            capabilityId: 'text.chat',
            providers: [
              {
                providerId: 'fixture-provider',
                providerName: 'Fixture Provider',
                providerType: 'local',
                models: ['fixture-model'],
                defaultModel: 'fixture-model',
                capabilities: ['text.chat'],
                available: true
              }
            ]
          }
        }
        case 'intelligence.context.invoke': {
          const request = payload as Record<string, unknown>
          state.contextRequests.push(request)
          return {
            operation: 'context.invoke',
            invocation: {
              result: `isolated answer ${generation}`,
              providerId: 'fixture-provider',
              modelId: 'fixture-model',
              traceId: `trace-${generation}`,
              latency: 12
            },
            context: {
              mode: 'new',
              scope: 'retrieval',
              itemCount: 1,
              tokenBudget: 1200,
              tokenEstimate: 12,
              sourceTypes: ['current_input'],
              retrievalItemCount: 0,
              citationCount: 0,
              degradedReason: 'isolated_context_persistence_unavailable'
            }
          }
        }
        default:
          throw new Error(`unexpected capability: ${capability}`)
      }
    }
  )
  const runtime = loadPluginPrelude(
    {
      scriptContent,
      snapshot: {
        platform: 'darwin',
        arch: 'arm64',
        locale: 'zh-CN',
        manifest: { name: 'touch-intelligence', activationGeneration: generation }
      },
      capabilityManifest: capabilities.map((id) => ({
        id,
        callbackLifetime: 'transient' as const,
        callbackFields: []
      })),
      callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
    },
    { invokeCapability }
  )
  return { invokeCapability, runtime, state }
}

describe('official touch-intelligence Prelude isolation regression', () => {
  it('loads the real Prelude twice and keeps Context, widget, clipboard, and generation state isolated', async () => {
    const first = createHarness(1)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'intelligence-ask',
        'ai explain isolation'
      ]).promise
    ).resolves.toBe(true)
    await waitUntil(
      () =>
        first.state.items[0]?.render != null &&
        (first.state.items[0].render as { custom?: { data?: { status?: string } } }).custom?.data
          ?.status === 'ready'
    )

    const ready = first.state.items[0]
    expect(
      (ready.render as { custom: { data: Record<string, unknown> } }).custom.data
    ).toMatchObject({
      answer: 'isolated answer 1',
      provider: 'fixture-provider',
      model: 'fixture-model',
      status: 'ready'
    })
    expect(first.state.contextRequests).toHaveLength(1)
    expect(first.state.contextRequests[0]).not.toHaveProperty('caller')
    expect(JSON.stringify(first.state.contextRequests[0])).not.toContain(
      'plugin:touch-intelligence'
    )

    await expect(
      first.runtime.callLifecycle('onItemAction', [ready, { actionId: 'copy-answer' }]).promise
    ).resolves.toMatchObject({ status: 'started' })
    expect(first.state.clipboard).toEqual(['isolated answer 1'])
    first.runtime.shutdown()

    const second = createHarness(2)
    await second.runtime.callLifecycle('onInit', []).promise
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'intelligence-ask',
      'ai explain the second generation'
    ]).promise
    await waitUntil(
      () =>
        (second.state.items[0]?.render as { custom?: { data?: { status?: string } } } | undefined)
          ?.custom?.data?.status === 'ready'
    )
    expect(
      (second.state.items[0].render as { custom: { data: { answer: string } } }).custom.data.answer
    ).toBe('isolated answer 2')
    expect(second.state.clipboard).toEqual([])
    await expect(first.runtime.callLifecycle('onItemAction', [ready]).promise).rejects.toEqual(
      expect.objectContaining<Partial<PluginHostChildError>>({ code: 'PLUGIN_HOST_CHILD_CLOSED' })
    )
    second.runtime.shutdown()
  })
})
