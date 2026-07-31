import type { PluginHostCapability } from './plugin-host-wire'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

const pluginsRoot = path.resolve(process.cwd(), '../../plugins')
const token = Object.freeze(Object.create(null))

function capabilityDeclaration(id: PluginHostCapability) {
  return id === 'voice.stream'
    ? { id, callbackLifetime: 'resource' as const, callbackFields: ['onEvent'] }
    : { id, callbackLifetime: 'transient' as const, callbackFields: [] }
}

function createHarness(options: { denyVoice?: boolean } = {}) {
  const state = {
    items: [] as Array<Record<string, unknown>>,
    pasted: [] as string[],
    spoken: [] as string[]
  }
  const disposeResource = vi.fn(async () => undefined)
  const invokeCapability = vi.fn(
    async (capability: PluginHostCapability, payload: unknown): Promise<unknown> => {
      switch (capability) {
        case 'feature.items.clear':
          state.items = []
          return { removed: 0 }
        case 'feature.items.push':
          state.items = structuredClone(
            (payload as { items: Array<Record<string, unknown>> }).items
          )
          return { ok: true }
        case 'clipboard.read':
          return { op: 'text', text: 'clipboard words' }
        case 'clipboard.write':
          state.pasted.push((payload as { content: { text: string } }).content.text)
          return { ok: true }
        case 'clipboard.copy-and-paste':
          state.pasted.push((payload as { text: string }).text)
          return { success: true }
        case 'voice.invoke': {
          if (options.denyVoice) {
            throw Object.assign(new Error('/private/voice/provider'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { operation: string; payload: { text?: string } }
          if (request.operation === 'speak') {
            state.spoken.push(request.payload.text ?? '')
            return { operation: 'speak', data: { format: 'wav', played: true } }
          }
          return {
            operation: 'dictate',
            data: {
              text: 'fallback words',
              raw: 'fallback words',
              source: 'native-cpal',
              polished: false
            }
          }
        }
        case 'voice.stream': {
          if (options.denyVoice) {
            throw Object.assign(new Error('/private/voice/stream'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const onEvent = (payload as { onEvent: (event: unknown) => Promise<unknown> }).onEvent
          await onEvent({ type: 'partial', text: 'partial words' })
          await onEvent({ type: 'final', text: 'isolated final', language: 'en-US' })
          await onEvent({ type: 'end' })
          return token
        }
        default:
          throw new Error(`unexpected capability: ${capability}`)
      }
    }
  )
  const capabilities = [
    'feature.items.push',
    'feature.items.clear',
    'clipboard.read',
    'clipboard.write',
    'clipboard.copy-and-paste',
    'voice.invoke',
    'voice.stream'
  ] as const satisfies readonly PluginHostCapability[]
  const runtime = loadPluginPrelude(
    {
      scriptContent: readFileSync(path.join(pluginsRoot, 'touch-dictation/index.js'), 'utf8'),
      snapshot: {
        platform: 'darwin',
        arch: 'arm64',
        locale: 'zh-CN',
        manifest: { name: 'touch-dictation', activationGeneration: 1 }
      },
      capabilityManifest: capabilities.map(capabilityDeclaration),
      callbackLimits: {
        maxCallbacks: 64,
        maxConcurrentCallbacks: 16,
        maxResources: 32
      }
    },
    {
      invokeCapability,
      inspectResource: (value) =>
        value === token ? { id: 'dictation-stream-1', kind: 'stream' } : null,
      disposeResource
    }
  )
  return { disposeResource, invokeCapability, runtime, state }
}

describe('official stream Prelude isolation regression', () => {
  it('touch-dictation triggers, streams, pastes and disposes its owner resource', async () => {
    const harness = createHarness()
    await expect(
      harness.runtime.callLifecycle('onFeatureTriggered', [
        'dictate',
        { text: '' },
        { id: 'dictate' }
      ]).promise
    ).resolves.toBe(true)
    const start = harness.state.items[0]

    await expect(harness.runtime.callLifecycle('onItemAction', [start]).promise).resolves.toEqual({
      externalAction: true,
      success: true,
      message: '已听写并粘贴：isolated final'
    })
    expect(harness.state.pasted).toEqual(['isolated final'])
    expect(harness.disposeResource).toHaveBeenCalledTimes(1)
    expect(harness.invokeCapability.mock.calls.map(([capability]) => capability)).toContain(
      'voice.stream'
    )
    harness.runtime.shutdown()
  })

  it('touch-dictation speaks clipboard text and redacts voice denials', async () => {
    const allowed = createHarness()
    await allowed.runtime.callLifecycle('onFeatureTriggered', [
      'speak',
      { text: '' },
      { id: 'speak' }
    ]).promise
    await expect(
      allowed.runtime.callLifecycle('onItemAction', [allowed.state.items[0]]).promise
    ).resolves.toMatchObject({ success: true })
    expect(allowed.state.spoken).toEqual(['clipboard words'])
    allowed.runtime.shutdown()

    const denied = createHarness({ denyVoice: true })
    await denied.runtime.callLifecycle('onFeatureTriggered', [
      'dictate',
      { text: '' },
      { id: 'dictate' }
    ]).promise
    const result = await denied.runtime.callLifecycle('onItemAction', [denied.state.items[0]])
      .promise
    expect(result).toMatchObject({ success: false })
    expect(JSON.stringify(result)).not.toMatch(/private|provider|voice\/stream/)
    denied.runtime.shutdown()
  })
})
