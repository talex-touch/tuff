import type { PluginHostCapability } from './plugin-host-wire'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

const snapshot = {
  platform: 'darwin',
  arch: 'arm64',
  locale: 'zh-CN',
  manifest: { name: 'touch-dictation', activationGeneration: 1 }
}

function declaration(id: PluginHostCapability) {
  return id === 'voice.stream'
    ? { id, callbackLifetime: 'resource' as const, callbackFields: ['onEvent'] }
    : { id, callbackLifetime: 'transient' as const, callbackFields: [] }
}

describe('plugin Prelude voice facade', () => {
  it('projects invoke and stream methods with terminal auto-dispose', async () => {
    const token = Object.freeze(Object.create(null))
    const disposeResource = vi.fn(async () => undefined)
    const invokeCapability = vi.fn(
      async (capability: PluginHostCapability, payload: unknown): Promise<unknown> => {
        if (capability === 'voice.invoke') {
          const request = payload as { operation: string }
          return request.operation === 'dictate'
            ? {
                operation: 'dictate',
                data: {
                  text: 'final words',
                  raw: 'raw words',
                  source: 'native-cpal',
                  polished: true
                }
              }
            : { operation: 'speak', data: { format: 'wav', played: true } }
        }
        if (capability === 'voice.stream') {
          const request = payload as {
            onEvent: (event: unknown) => Promise<unknown>
          }
          await request.onEvent({ type: 'partial', text: 'partial words' })
          await request.onEvent({ type: 'final', text: 'final words', language: 'en-US' })
          await request.onEvent({ type: 'end' })
          return token
        }
        throw new Error(`unexpected capability: ${capability}`)
      }
    )
    const runtime = loadPluginPrelude(
      {
        scriptContent: `
          module.exports = {
            async onInit() {
              const events = []
              let ended = 0
              const controller = await plugin.voice.asrStream(
                { language: 'en-US' },
                {
                  onData: async (event) => { events.push(event) },
                  onEnd: async () => { ended += 1 }
                }
              )
              const dictated = await plugin.voice.dictate({ cleanup: true })
              const spoken = await plugin.voice.speak({ text: 'hello', play: true })
              return {
                events,
                ended,
                dictated,
                spoken,
                controller: {
                  id: controller.id,
                  cancelled: controller.cancelled,
                  keys: Object.keys(controller),
                  frozen: Object.isFrozen(controller),
                  nullPrototype: Object.getPrototypeOf(controller) === null
                },
                voiceFrozen: Object.isFrozen(plugin.voice),
                voicePrototype: Object.getPrototypeOf(plugin.voice)
              }
            }
          }
        `,
        snapshot,
        capabilityManifest: (['voice.invoke', 'voice.stream'] as const).map(declaration),
        callbackLimits: {
          maxCallbacks: 64,
          maxConcurrentCallbacks: 16,
          maxResources: 32
        }
      },
      {
        invokeCapability,
        inspectResource: (value) =>
          value === token ? { id: 'voice-stream-1', kind: 'stream' } : null,
        disposeResource
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      events: [
        { type: 'partial', text: 'partial words' },
        { type: 'final', text: 'final words', language: 'en-US' },
        { type: 'end' }
      ],
      ended: 1,
      dictated: {
        text: 'final words',
        raw: 'raw words',
        source: 'native-cpal',
        polished: true
      },
      spoken: { format: 'wav', played: true },
      controller: {
        id: 'voice-stream-1',
        cancelled: false,
        keys: ['id', 'cancelled', 'cancel'],
        frozen: true,
        nullPrototype: true
      },
      voiceFrozen: true,
      voicePrototype: null
    })
    expect(disposeResource).toHaveBeenCalledTimes(1)
    expect(invokeCapability.mock.calls.map(([capability]) => capability)).toEqual([
      'voice.stream',
      'voice.invoke',
      'voice.invoke'
    ])
    runtime.shutdown()
  })

  it('maps stream errors to stable child errors and disposes once', async () => {
    const token = Object.freeze(Object.create(null))
    const disposeResource = vi.fn(async () => undefined)
    const runtime = loadPluginPrelude(
      {
        scriptContent: `
          module.exports = {
            async onInit() {
              let errorCode = ''
              const controller = await plugin.voice.asrStream({}, {
                onData: () => { throw new Error('child callback detail') },
                onError: (error) => { errorCode = error.code }
              })
              await controller.cancel()
              await controller.cancel()
              return { errorCode, cancelled: controller.cancelled }
            }
          }
        `,
        snapshot,
        capabilityManifest: [declaration('voice.stream')],
        callbackLimits: {
          maxCallbacks: 64,
          maxConcurrentCallbacks: 16,
          maxResources: 32
        }
      },
      {
        invokeCapability: async (_capability, payload) => {
          const onEvent = (payload as { onEvent: (event: unknown) => Promise<unknown> }).onEvent
          await onEvent({ type: 'partial', text: 'will fail' })
          return token
        },
        inspectResource: (value) =>
          value === token ? { id: 'voice-stream-error', kind: 'stream' } : null,
        disposeResource
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      errorCode: 'VOICE_STREAM_CALLBACK_FAILED',
      cancelled: true
    })
    expect(disposeResource).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it('omits voice entirely when neither fixed capability is declared', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      {
        scriptContent: `
          module.exports = {
            onInit() {
              return {
                voice: typeof plugin.voice,
                globalVoice: typeof voice
              }
            }
          }
        `,
        snapshot,
        capabilityManifest: [],
        callbackLimits: {
          maxCallbacks: 64,
          maxConcurrentCallbacks: 16,
          maxResources: 32
        }
      },
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      voice: 'undefined',
      globalVoice: 'undefined'
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })
})
