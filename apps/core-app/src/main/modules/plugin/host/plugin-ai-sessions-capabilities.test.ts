import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'
import {
  createFixedPluginAiSessionsService,
  createPluginAiSessionsCapabilities,
  type TrustedPluginAiSessionsService
} from './plugin-ai-sessions-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-ai-sessions',
  pluginInstanceId: 'ai-instance',
  activationGeneration: 1,
  key: 'ai-key'
})
const error = (code: string) => expect.objectContaining({ code })
const sources = [
  {
    platform: 'claude',
    project: 'Demo',
    updatedAt: '2026-08-31T10:00:00.000Z',
    state: 'completed',
    turnCount: 4,
    sourceId: 'safe-id'
  },
  {
    platform: 'codex',
    project: '/Users/private/project',
    updatedAt: '2026-08-30T10:00:00.000Z',
    state: 'active',
    turnCount: 2,
    sourceId: 'another-id'
  },
  {
    platform: 'gemini',
    project: 'Credentials token=sk-abcdefghijk',
    updatedAt: '2026-08-29T10:00:00.000Z',
    state: 'failed',
    turnCount: 1,
    sourceId: 'secret-id'
  }
] as const

function makeHarness(service: TrustedPluginAiSessionsService, allowed = true) {
  let current: PluginActivationIdentity | undefined = activation
  let generation = 7
  const revoked = new Set<() => void>()
  const watch = (_name: string, onRevoke: () => void) => (
    revoked.add(onRevoke),
    () => revoked.delete(onRevoke)
  )
  const capability = createPluginAiSessionsCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => generation,
    authorizeIntelligence: () => allowed,
    authorizeRead: () => allowed,
    watchIntelligencePermissionRevoked: watch,
    watchReadPermissionRevoked: watch,
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'ai-handle', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => allowed,
    watchPermissionRevoked: (_name, _permission, onRevoke) => watch(_name, onRevoke),
    onFatalViolation: () => undefined
  })
  registry.register(capability.definitions[0]!)
  return {
    capability,
    registry,
    revoke() {
      for (const callback of revoked) callback()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated' }
    },
    generation: () => generation
  }
}

describe('intelligence.sessions capability and fixed service', () => {
  it('projects bounded metadata, filters secret/path-like project names, searches, hashes source ids, and revalidates them', async () => {
    const service = createFixedPluginAiSessionsService({
      listMetadata: async () => ({ entries: sources, incomplete: false })
    })
    const all = await service.list({ limit: 10 }, new AbortController().signal)
    expect(all).toEqual({
      status: 'ready',
      total: 1,
      incomplete: false,
      sessions: [
        expect.objectContaining({
          platform: 'claude',
          project: 'Demo',
          state: 'completed',
          turnCount: 4,
          id: expect.stringMatching(/^[a-f0-9]{16}$/)
        })
      ]
    })
    expect(all.status === 'ready' ? all.sessions : []).toHaveLength(1)
    expect(JSON.stringify(all)).not.toContain('/Users/private')
    expect(JSON.stringify(all)).not.toContain('sk-abcdefghijk')
    const filtered = await service.list({ query: 'demo', limit: 1 }, new AbortController().signal)
    expect(filtered).toMatchObject({
      status: 'ready',
      total: 1,
      sessions: [expect.objectContaining({ project: 'Demo' })]
    })

    const olderEntries = Array.from({ length: 100 }, (_, index) => ({
      platform: 'claude' as const,
      project: `Earlier session ${index}`,
      updatedAt: '2026-08-31T09:00:00.000Z',
      state: 'completed' as const,
      turnCount: 1,
      sourceId: `earlier-${index}`
    }))
    const target = {
      platform: 'codex' as const,
      project: 'Selective revalidation target',
      updatedAt: '2026-08-01T09:00:00.000Z',
      state: 'completed' as const,
      turnCount: 3,
      sourceId: 'raw-source-id-must-not-leak'
    }
    const privatePath = '/Users/private/.codex/sessions/secret.json'
    const rejectedPathEntry = { ...target, sourceId: 'rejected-path-entry', path: privatePath }
    const revalidationService = createFixedPluginAiSessionsService({
      listMetadata: async () => ({
        entries: [...olderEntries, target, rejectedPathEntry],
        incomplete: false
      })
    })
    const selected = await revalidationService.list(
      { query: target.project, limit: 1 },
      new AbortController().signal
    )
    expect(selected).toMatchObject({
      status: 'ready',
      total: 1,
      sessions: [expect.objectContaining({ project: target.project })]
    })
    if (selected.status !== 'ready') throw new Error('Expected a ready session list')
    const selectedSession = selected.sessions[0]!

    const revalidated = await revalidationService.list(
      { query: selectedSession.id, limit: 1 },
      new AbortController().signal
    )
    expect(revalidated).toEqual({
      status: 'ready',
      sessions: [selectedSession],
      total: 1,
      incomplete: false
    })
    if (revalidated.status !== 'ready') throw new Error('Expected a ready session list')
    expect(revalidated.sessions[0]).not.toHaveProperty('sourceId')
    expect(revalidated.sessions[0]).not.toHaveProperty('path')
    expect(JSON.stringify(revalidated)).not.toContain(target.sourceId)
    expect(JSON.stringify(revalidated)).not.toContain(privatePath)
  })

  it('marks source and response limits incomplete without discarding safe metadata', async () => {
    const second = {
      ...sources[0],
      project: 'Second',
      sourceId: 'safe-id-2',
      updatedAt: '2026-08-31T09:00:00.000Z'
    } as const
    const limited = createFixedPluginAiSessionsService({
      listMetadata: async () => ({ entries: [sources[0], second], incomplete: false })
    })
    await expect(limited.list({ limit: 1 }, new AbortController().signal)).resolves.toMatchObject({
      status: 'ready',
      total: 2,
      incomplete: true,
      sessions: [expect.objectContaining({ project: 'Demo' })]
    })
    const sourceLimited = createFixedPluginAiSessionsService({
      listMetadata: async () => ({ entries: [sources[0]], incomplete: true })
    })
    await expect(
      sourceLimited.list({ limit: 10 }, new AbortController().signal)
    ).resolves.toMatchObject({ status: 'ready', total: 1, incomplete: true })
  })

  it('degrades on an unavailable index and rejects aborted scans', async () => {
    const unavailable = createFixedPluginAiSessionsService({
      listMetadata: async () => {
        throw new Error('offline')
      }
    })
    await expect(unavailable.list({ limit: 10 }, new AbortController().signal)).resolves.toEqual({
      status: 'degraded',
      sessions: [],
      total: 0,
      reason: 'index-unavailable'
    })
    const controller = new AbortController()
    controller.abort()
    await expect(unavailable.list({ limit: 10 }, controller.signal)).rejects.toMatchObject(
      error('PLUGIN_HOST_CAPABILITY_CANCELLED')
    )
  })

  it('enforces literal holder, authority, permission, request/result normalization and close', async () => {
    const service = createFixedPluginAiSessionsService({
      listMetadata: async () => ({ entries: sources, incomplete: false })
    })
    const h = makeHarness(service)
    await expect(
      h.registry.dispatch('intelligence.sessions', { operation: 'list', limit: 2 })
    ).resolves.toMatchObject({ status: 'ready', total: 1 })
    expect(() =>
      createPluginAiSessionsCapabilities({
        activation: { ...activation, name: 'other' },
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeIntelligence: () => true,
        authorizeRead: () => true,
        watchIntelligencePermissionRevoked: () => () => undefined,
        watchReadPermissionRevoked: () => () => undefined,
        service
      })
    ).toThrow(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    const definition = h.capability.definitions[0]!
    const forged = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
    await expect(
      definition.invoke(
        { ...forged, identity: { ...forged.identity } } as PluginSecurityContext,
        { operation: 'list', limit: 2 },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(() => definition.validateRequest({ query: 'x', limit: 0, extra: true })).toThrow()
    expect(() =>
      definition.validateResult({ status: 'ready', sessions: [{ id: 'not-a-hash' }], total: 1 })
    ).toThrow()
    h.rotate()
    await expect(
      h.registry.dispatch('intelligence.sessions', { operation: 'list', limit: 2 })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'))
    const denied = makeHarness(service, false)
    await expect(
      denied.registry.dispatch('intelligence.sessions', { operation: 'list', limit: 2 })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))
    await h.capability.close()
    h.registry.close()
    await expect(
      h.registry.dispatch('intelligence.sessions', { operation: 'list', limit: 2 })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CLOSED'))
  })

  it('aborts active listing on caller cancellation and does not expose raw source fields', async () => {
    let seenSignal!: AbortSignal
    const service = createFixedPluginAiSessionsService({
      listMetadata: async (signal) => {
        seenSignal = signal
        return await new Promise<{
          entries: readonly (typeof sources)[number][]
          incomplete: boolean
        }>((resolve) =>
          signal.addEventListener('abort', () => resolve({ entries: [], incomplete: false }), {
            once: true
          })
        )
      }
    })
    const h = makeHarness(service)
    const controller = new AbortController()
    const call = h.registry.dispatch(
      'intelligence.sessions',
      { operation: 'list', query: 'private', limit: 5 },
      controller.signal
    )
    await vi.waitFor(() => expect(seenSignal).toBeDefined())
    controller.abort()
    await expect(call).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CANCELLED'))
  })
})
