import type { PluginHostCapability } from './plugin-host-wire'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude, PluginHostChildError } from './plugin-host-child-runtime'

const pluginsRoot = path.resolve(process.cwd(), '../../plugins')
const scriptContent = readFileSync(path.join(pluginsRoot, 'touch-translation', 'index.js'), 'utf8')
const capabilities = [
  'feature.items.push',
  'feature.items.clear',
  'storage.file.read',
  'clipboard.write',
  'intelligence.invoke'
] as const satisfies readonly PluginHostCapability[]

function createHarness(generation: number) {
  const state = {
    clipboard: [] as string[],
    items: [] as Array<Record<string, unknown>>,
    requests: [] as Array<Record<string, unknown>>
  }
  const invokeCapability = vi.fn(
    async (capability: PluginHostCapability, payload: unknown): Promise<unknown> => {
      if (capability === 'feature.items.clear') {
        const removed = state.items.length
        state.items = []
        return { removed }
      }
      if (capability === 'feature.items.push') {
        state.items = (payload as { items: Array<Record<string, unknown>> }).items
        return { ok: true }
      }
      if (capability === 'storage.file.read') {
        return {
          found: true,
          value: {
            'provider-a': { enabled: true },
            'provider-b': { enabled: true },
            ignored: { enabled: true, apiKey: 'must-not-cross' }
          }
        }
      }
      if (capability === 'clipboard.write') {
        state.clipboard.push((payload as { content: { text: string } }).content.text)
        return { ok: true }
      }
      if (capability !== 'intelligence.invoke') {
        throw new Error(`unexpected capability: ${capability}`)
      }

      const request = payload as Record<string, unknown>
      state.requests.push(request)
      if (request.operation === 'provider-models.list') {
        return {
          operation: 'provider-models.list',
          capabilityId: 'text.translate',
          providers: ['provider-a', 'provider-b'].map((providerId) => ({
            providerId,
            providerName: providerId,
            providerType: 'fixture',
            models: [`${providerId}-model`],
            defaultModel: `${providerId}-model`,
            capabilities: ['text.translate'],
            available: true
          }))
        }
      }
      if (request.capabilityId === 'vision.ocr') {
        return {
          operation: 'capability.invoke',
          result: { text: `recognized-${generation}` },
          providerId: 'ocr-provider',
          modelId: 'ocr-model',
          traceId: `ocr-${generation}`,
          latency: 2
        }
      }
      if (request.capabilityId === 'text.translate') {
        const text = (request.payload as { text: string }).text
        const provider = (request.options as { preferredProviderId: string }).preferredProviderId
        return {
          operation: 'capability.invoke',
          result: `${provider}:${text}:generation-${generation}`,
          providerId: provider,
          modelId: `${provider}-model`,
          traceId: `translate-${generation}`,
          latency: 3
        }
      }
      throw new Error('unexpected Intelligence operation')
    }
  )
  const runtime = loadPluginPrelude(
    {
      scriptContent,
      snapshot: {
        platform: 'darwin',
        arch: 'arm64',
        locale: 'zh-CN',
        manifest: { name: 'touch-translation', activationGeneration: generation }
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

function copyItem(items: Array<Record<string, unknown>>): Record<string, unknown> {
  const item = items.find(
    (candidate) =>
      Array.isArray(candidate.actions) &&
      candidate.actions.some(
        (action) =>
          action &&
          typeof action === 'object' &&
          (action as { id?: unknown }).id === 'copy-translation'
      )
  )
  if (!item) throw new Error('translation result item missing')
  return item
}

describe('official touch-translation Prelude isolation regression', () => {
  it('runs text, multi-source, screenshot, copy, and two isolated generations with fake providers', async () => {
    const first = createHarness(1)
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', ['touch-translate', 'hello']).promise
    ).resolves.toBe(true)
    expect(JSON.stringify(first.state.items)).toContain('provider-a:hello:generation-1')
    expect(JSON.stringify(first.state.requests)).not.toMatch(/apiKey|token|endpoint|authorization/i)

    const firstItem = copyItem(first.state.items)
    await expect(
      first.runtime.callLifecycle('onItemAction', [firstItem]).promise
    ).resolves.toMatchObject({
      status: 'started'
    })
    expect(first.state.clipboard).toEqual(['provider-a:hello:generation-1'])

    await first.runtime.callLifecycle('onFeatureTriggered', ['multi-source-translate', 'world'])
      .promise
    expect(first.state.items).toHaveLength(2)
    expect(JSON.stringify(first.state.items)).toContain('provider-b:world:generation-1')

    await first.runtime.callLifecycle('onFeatureTriggered', [
      'screenshot-translate',
      { inputs: [{ type: 'image', content: 'data:image/png;base64,iVBORw0KGgo=' }] }
    ]).promise
    expect(JSON.stringify(first.state.items)).toContain('recognized-1:generation-1')
    expect(JSON.stringify(first.state.items)).not.toContain('data:image/png')
    first.runtime.shutdown()

    const second = createHarness(2)
    await second.runtime.callLifecycle('onFeatureTriggered', ['touch-translate', 'hello']).promise
    expect(JSON.stringify(second.state.items)).toContain('provider-a:hello:generation-2')
    expect(second.state.clipboard).toEqual([])
    await expect(
      second.runtime.callLifecycle('onItemAction', [firstItem]).promise
    ).resolves.toMatchObject({ status: 'ignored', reason: 'stale-request' })
    expect(second.state.clipboard).toEqual([])
    await expect(first.runtime.callLifecycle('onItemAction', [firstItem]).promise).rejects.toEqual(
      expect.objectContaining<Partial<PluginHostChildError>>({ code: 'PLUGIN_HOST_CHILD_CLOSED' })
    )
    second.runtime.shutdown()
  })
})
