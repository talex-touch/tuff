import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { PluginHostResourceRegistry } from './plugin-host-resources'
import {
  createPluginVoiceCapabilities,
  type PluginVoiceHostService,
  type PluginVoiceStreamEvent
} from './plugin-voice-capabilities'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'voice-owner',
  hostGeneration: 17
}

const activation: PluginActivationIdentity = {
  name: 'touch-dictation',
  pluginInstanceId: 'dictation-instance',
  activationGeneration: 4,
  key: 'dictation-key'
}

function createControlledStream() {
  const pending: Array<{
    resolve: (value: IteratorResult<PluginVoiceStreamEvent>) => void
  }> = []
  let closed = false
  const next = vi.fn(async () => {
    if (closed) return { done: true, value: undefined } as IteratorResult<PluginVoiceStreamEvent>
    return await new Promise<IteratorResult<PluginVoiceStreamEvent>>((resolve) => {
      pending.push({ resolve })
    })
  })
  const close = vi.fn(async () => {
    if (closed) return { done: true, value: undefined } as IteratorResult<PluginVoiceStreamEvent>
    closed = true
    for (const waiter of pending.splice(0)) {
      waiter.resolve({ done: true, value: undefined })
    }
    return { done: true, value: undefined } as IteratorResult<PluginVoiceStreamEvent>
  })
  const iterable: AsyncIterable<PluginVoiceStreamEvent> = {
    [Symbol.asyncIterator]() {
      return { next, return: close }
    }
  }
  return {
    close,
    iterable,
    next,
    emit(event: PluginVoiceStreamEvent) {
      const waiter = pending.shift()
      if (!waiter) throw new Error('stream is not waiting')
      waiter.resolve({ done: false, value: event })
    }
  }
}

function createHarness(options: { authorize?: boolean } = {}) {
  const controlled = createControlledStream()
  const service: PluginVoiceHostService = Object.freeze({
    dictate: vi.fn(async () => ({
      text: 'polished',
      raw: 'raw',
      source: 'native-cpal',
      polished: true,
      language: 'zh-CN',
      durationMs: 1200,
      stoppedReason: 'silence'
    })),
    speak: vi.fn(async () => ({
      audio: 'data:audio/wav;base64,host-only-audio',
      format: 'wav',
      played: true,
      durationMs: 800
    })),
    stream: vi.fn(() => controlled.iterable)
  })
  const capabilities = createPluginVoiceCapabilities({
    resolveCurrentActivation: () => activation,
    resolveHostGeneration: () => owner.hostGeneration,
    service
  })
  let revoke: (() => void) | undefined
  let resources!: PluginHostResourceRegistry
  resources = new PluginHostResourceRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => activation,
    isActive: () => true,
    watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
      revoke = onRevoke
      return () => undefined
    },
    onFatalViolation: () => {
      void resources.close()
    }
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => activation,
    authorize: () => options.authorize ?? true,
    watchPermissionRevoked: () => () => undefined,
    resources,
    onFatalViolation: () => undefined
  })
  for (const definition of capabilities.definitions) registry.register(definition)
  return { capabilities, controlled, registry, resources, service, revoke: () => revoke?.() }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition was not reached')
}

describe('plugin voice capabilities', () => {
  it('registers fixed voice IDs with permission and resource callback metadata', () => {
    const { capabilities } = createHarness()

    expect(
      capabilities.definitions.map((definition) => ({
        id: definition.id,
        permission: definition.permission,
        callbackLifetime: definition.callbackLifetime,
        callbackFields: definition.callbackFields
      }))
    ).toEqual([
      {
        id: 'voice.invoke',
        permission: 'voice.dictation',
        callbackLifetime: 'transient',
        callbackFields: []
      },
      {
        id: 'voice.stream',
        permission: 'voice.dictation',
        callbackLifetime: 'resource',
        callbackFields: ['onEvent']
      }
    ])
    expect(Object.isFrozen(capabilities.definitions)).toBe(true)
  })

  it('validates fixed invoke payloads and strips synthesized audio from child results', async () => {
    const { registry, service } = createHarness()

    await expect(
      registry.dispatch('voice.invoke', {
        operation: 'dictate',
        payload: { cleanup: true, language: 'zh-CN', maxDurationMs: 10_000 }
      })
    ).resolves.toEqual({
      operation: 'dictate',
      data: {
        text: 'polished',
        raw: 'raw',
        source: 'native-cpal',
        polished: true,
        language: 'zh-CN',
        durationMs: 1200,
        stoppedReason: 'silence'
      }
    })

    const spoken = await registry.dispatch('voice.invoke', {
      operation: 'speak',
      payload: { text: 'hello', language: 'en-US', play: true }
    })
    expect(spoken).toEqual({
      operation: 'speak',
      data: { format: 'wav', played: true, durationMs: 800 }
    })
    expect(JSON.stringify(spoken)).not.toMatch(/host-only-audio|base64/i)
    expect(service.speak).toHaveBeenCalledTimes(1)
  })

  it.each([
    { operation: 'raw-event', payload: null },
    { operation: 'speak', payload: { text: '', token: 'child-token' } },
    { operation: 'dictate', payload: { cleanup: true, pluginName: 'other' } },
    { operation: 'dictate', payload: { maxDurationMs: 999_999 } }
  ])('rejects malformed or authority-bearing invoke DTOs before host work', async (request) => {
    const { registry, service } = createHarness()

    await expect(registry.dispatch('voice.invoke', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    expect(service.dictate).not.toHaveBeenCalled()
    expect(service.speak).not.toHaveBeenCalled()
  })

  it('streams one bounded event at a time and closes the owner resource on dispose', async () => {
    const { controlled, registry, resources } = createHarness()
    let releaseCallback: (() => void) | undefined
    const onEvent = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          releaseCallback = resolve
        })
    )

    const handle = await registry.dispatch('voice.stream', {
      payload: { cleanup: true, language: 'zh-CN' },
      onEvent
    })
    expect(resources.inspect(handle)).toMatchObject({ kind: 'stream' })
    await waitUntil(() => controlled.next.mock.calls.length === 1)

    controlled.emit({ type: 'partial', text: 'first' })
    await waitUntil(() => onEvent.mock.calls.length === 1)
    expect(controlled.next).toHaveBeenCalledTimes(1)
    releaseCallback?.()
    await waitUntil(() => controlled.next.mock.calls.length === 2)

    const resource = resources.inspect(handle)!
    await resources.dispose(resource.id, resource.kind)
    expect(controlled.close).toHaveBeenCalledTimes(1)
    expect(resources.size).toBe(0)
  })

  it('disposes the retained stream when voice permission is revoked', async () => {
    const { controlled, registry, resources, revoke } = createHarness()
    const handle = await registry.dispatch('voice.stream', {
      payload: {},
      onEvent: vi.fn(async () => undefined)
    })
    expect(resources.inspect(handle)).not.toBeNull()

    revoke()
    await waitUntil(() => controlled.close.mock.calls.length === 1)
    expect(resources.size).toBe(0)
  })
})
