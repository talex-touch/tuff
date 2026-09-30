import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityError, PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { PluginHostResourceRegistry } from './plugin-host-resources'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'
import { createPluginRecommendationCapabilities } from './plugin-host-recommend-capabilities'

/**
 * Host side of the plugin recommendation capability.
 *
 * The child-realm projection is covered by `plugin-host-child-recommend.test.ts`; this file pins
 * what the host does with a registration once it arrives: which tenant it is registered under,
 * which provider callbacks survive the capability call, what a refusal or a throw does to the
 * accepted count, and that after unregister/disposal the source is really no longer executable.
 * Nothing here asserts how many times an internal helper was called — reachability is the contract.
 */
const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'recommend-host-handle',
  hostGeneration: 4
}

const REGISTER = 'recommend.provider.register'
const UNREGISTER = 'recommend.provider.unregister'
const PROVIDER_ID = 'reco-live-provider'

function activation(name: string): PluginActivationIdentity {
  return {
    name,
    pluginInstanceId: `instance-${name}`,
    activationGeneration: 1,
    key: `key-${name}`
  }
}

/**
 * Stands in for the engine the capability registers into. It applies the real acceptance rule —
 * `false` and a thrown error are failures, anything else is exactly one accepted use — and the real
 * ownership rule: unregister is addressed as `(pluginName, providerId)` and refuses when the entry
 * belongs to another plugin.
 */
interface RecommendEngineHarness {
  api: {
    registerPluginProvider(pluginName: string, provider: { id: string }): () => void
    unregisterPluginProvider(pluginName: string, providerId: string): boolean
  }
  providers: Map<string, { pluginName: string; provider: Record<string, unknown> }>
  registerPluginProvider: ReturnType<typeof vi.fn>
  execute(
    providerId: string,
    candidate?: Record<string, unknown>,
    args?: Record<string, unknown>
  ): Promise<{ accepted: boolean }>
}

function createEngine(): RecommendEngineHarness {
  const providers = new Map<string, { pluginName: string; provider: Record<string, unknown> }>()
  const registerPluginProvider = vi.fn((pluginName: string, provider: { id: string }) => {
    const entry = { pluginName, provider: provider as never }
    providers.set(provider.id, entry)
    // The real engine's registration disposer is stale-safe: it only removes the entry it created,
    // so a teardown that runs after a same-id re-registration leaves the replacement alone.
    return () => {
      if (providers.get(provider.id) === entry) providers.delete(provider.id)
    }
  })
  const unregisterPluginProvider = vi.fn((pluginName: string, providerId: string) => {
    const entry = providers.get(providerId)
    if (!entry || entry.pluginName !== pluginName) return false
    providers.delete(providerId)
    return true
  })
  return {
    api: { registerPluginProvider, unregisterPluginProvider },
    providers,
    registerPluginProvider,
    /** The engine's verdict for one candidate, including its failure mapping. */
    async execute(
      providerId: string,
      candidate: Record<string, unknown> = {},
      args: Record<string, unknown> = {}
    ): Promise<{ accepted: boolean }> {
      const provider = providers.get(providerId)?.provider as
        | { onExecute?: (candidate: unknown, args: unknown) => unknown }
        | undefined
      if (typeof provider?.onExecute !== 'function') return { accepted: false }
      try {
        const result = await provider.onExecute(candidate, args)
        return { accepted: result !== false }
      } catch {
        return { accepted: false }
      }
    }
  }
}

function createHarness(
  pluginName: string,
  engine: RecommendEngineHarness = createEngine(),
  /** The real registry is constructed with `maxResources: 1` for capability resource handles. */
  maxResources?: number
) {
  const current = activation(pluginName)
  const resources = new PluginHostResourceRegistry({
    owner,
    activation: current,
    resolveCurrentActivation: () => current,
    isActive: () => true,
    ...(maxResources === undefined ? {} : { maxResources })
  })
  const capability = createPluginRecommendationCapabilities({
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => owner.hostGeneration,
    api: engine.api
  } as never)
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation: current,
    resolveCurrentActivation: () => current,
    authorize: () => true,
    watchPermissionRevoked: () => () => undefined,
    resources,
    onFatalViolation: () => undefined
  })
  for (const definition of capability.definitions) registry.register(definition)
  return { registry, resources, engine, activation: current }
}

function registration(overrides: Record<string, unknown> = {}) {
  return {
    id: PROVIDER_ID,
    name: 'Isolated recommendation actions',
    canProvide: () => true,
    getCandidates: () => [{ id: 'reco-live-success', title: '隔离推荐成功动作', priority: 100 }],
    onExecute: () => true,
    ...overrides
  }
}

describe('host recommendation capability', () => {
  it('registers a plugin candidate source under its activation tenant and only counts accepted executions', async () => {
    const accept = createHarness('reco-live')
    await accept.registry.dispatch(REGISTER, registration())
    // The tenant is the host activation, never a field of the child payload.
    expect(accept.engine.providers.get(PROVIDER_ID)?.pluginName).toBe('reco-live')
    await expect(accept.engine.execute(PROVIDER_ID, { action: 'save' })).resolves.toEqual({
      accepted: true
    })

    const refuse = createHarness('reco-live')
    await refuse.registry.dispatch(REGISTER, registration({ onExecute: () => false }))
    await expect(refuse.engine.execute(PROVIDER_ID, { action: 'reject' })).resolves.toEqual({
      accepted: false
    })

    const fail = createHarness('reco-live')
    await fail.registry.dispatch(
      REGISTER,
      registration({
        onExecute: () => {
          throw new Error('plugin could not handle this candidate')
        }
      })
    )
    await expect(fail.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: false })
  })

  it('keeps the child callbacks usable long after the registration call returned', async () => {
    const harness = createHarness('reco-live')
    await harness.registry.dispatch(
      REGISTER,
      registration({
        canProvide: () => false,
        getCandidates: () => [{ id: 'later-candidate' }],
        onExecute: (candidate: { action?: string }) => candidate.action === 'save'
      })
    )

    const provider = harness.engine.providers.get(PROVIDER_ID)?.provider as {
      canProvide: (context: unknown) => unknown
      getCandidates: (context: unknown) => unknown
      onExecute: (candidate: unknown, args: unknown) => unknown
    }
    // These are the very functions the child sent: the host must still be able to ask for
    // candidates on a later pass and to execute on a later click.
    expect(await provider.canProvide({})).toBe(false)
    expect(await provider.getCandidates({})).toEqual([{ id: 'later-candidate' }])
    await expect(harness.engine.execute(PROVIDER_ID, { action: 'save' })).resolves.toEqual({
      accepted: true
    })
    await expect(harness.engine.execute(PROVIDER_ID, { action: 'reject' })).resolves.toEqual({
      accepted: false
    })
  })

  it('cannot let another plugin unregister this plugin provider id', async () => {
    const engine = createEngine()
    const incumbent = createHarness('reco-live', engine)
    await incumbent.registry.dispatch(REGISTER, registration())

    const intruder = createHarness('other-plugin', engine)
    const removed = await intruder.registry.dispatch(UNREGISTER, { providerId: PROVIDER_ID })

    expect(removed).toBe(false)
    expect(engine.providers.get(PROVIDER_ID)?.pluginName).toBe('reco-live')
    await expect(engine.execute(PROVIDER_ID, { action: 'save' })).resolves.toEqual({
      accepted: true
    })
  })

  it('makes the source unreachable once unregistered, and reports an unknown id as not removed', async () => {
    const harness = createHarness('reco-live')
    await harness.registry.dispatch(REGISTER, registration())

    await expect(harness.registry.dispatch(UNREGISTER, { providerId: PROVIDER_ID })).resolves.toBe(
      true
    )
    expect(harness.engine.providers.has(PROVIDER_ID)).toBe(false)
    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: false })

    // A second unregister has nothing left to remove and must say so rather than claim success.
    await expect(harness.registry.dispatch(UNREGISTER, { providerId: PROVIDER_ID })).resolves.toBe(
      false
    )
  })

  it('refuses a child-supplied tenant instead of honouring it', async () => {
    const engine = createEngine()
    const incumbent = createHarness('reco-live', engine)
    await incumbent.registry.dispatch(REGISTER, registration())

    const intruder = createHarness('other-plugin', engine)
    await expect(
      intruder.registry.dispatch(UNREGISTER, {
        providerId: PROVIDER_ID,
        pluginName: 'reco-live'
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' }))
    // The incumbent survived both the rejected request and the intruder's honest attempt.
    expect(engine.providers.get(PROVIDER_ID)?.pluginName).toBe('reco-live')
  })

  it('revokes the provider when the registration resource is disposed', async () => {
    const harness = createHarness('reco-live')
    const retained = (await harness.registry.dispatch(REGISTER, registration())) as object
    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: true })

    // Disposal is the host-side revocation path (plugin unload / activation teardown).
    const descriptor = harness.resources.inspect(retained)
    expect(descriptor).not.toBeNull()
    await harness.resources.dispose(descriptor!.id, descriptor!.kind)

    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: false })
  })

  it('does not let a stale registration disposer remove a provider re-registered under the same id', async () => {
    const harness = createHarness('reco-live')
    const stale = (await harness.registry.dispatch(REGISTER, registration())) as object
    await harness.registry.dispatch(UNREGISTER, { providerId: PROVIDER_ID })
    await harness.registry.dispatch(REGISTER, registration({ name: 'second registration' }))
    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: true })

    // A reloading plugin reuses its id; a teardown belonging to the previous registration must not
    // revoke the source that replaced it.
    const staleDescriptor = harness.resources.inspect(stale)
    expect(staleDescriptor).not.toBeNull()
    await harness.resources.dispose(staleDescriptor!.id, staleDescriptor!.kind)

    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: true })
  })

  it('leaves no provider behind when the registry cannot hand out the registration resource', async () => {
    // The host allocates one resource handle per successful registration. A plugin that already
    // holds its single handle leaves the next registration with nothing to hand back — and the
    // provider must not survive that failure, or a resource-less source stays executable while
    // its owner believes the registration was rejected.
    const harness = createHarness('reco-live', createEngine(), 1)

    const first = (await harness.registry.dispatch(REGISTER, registration())) as object
    expect(harness.engine.providers.has(PROVIDER_ID)).toBe(true)

    // The handler's own failure is reported to the child as a failed call, not as a resource
    // error: what the child may rely on is that the registration did not take effect.
    await expect(
      harness.registry.dispatch(REGISTER, registration({ id: 'reco-live-second' }))
    ).rejects.toEqual(expect.objectContaining({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' }))

    // The rejected provider is not executable, and it leaves no row in the engine roster.
    expect(harness.engine.providers.has('reco-live-second')).toBe(false)
    await expect(harness.engine.execute('reco-live-second')).resolves.toEqual({ accepted: false })

    // Nor can it be unregistered later: nothing was registered, so there is nothing to remove.
    await expect(
      harness.registry.dispatch(UNREGISTER, { providerId: 'reco-live-second' })
    ).resolves.toBe(false)

    // The holder of the one resource is unaffected.
    expect(harness.resources.inspect(first)).not.toBeNull()
    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: true })
  })

  it('rejects a registration on a closed registry without leaving a provider behind', async () => {
    // Teardown races: the registry can close between the child's call and the handler. The resource
    // layer refuses the invocation outright, so the handler never runs and no provider is created —
    // the child is told the resource layer is gone rather than getting a half-registered source.
    const harness = createHarness('reco-live', createEngine(), 1)
    await harness.resources.close()

    await expect(harness.registry.dispatch(REGISTER, registration())).rejects.toEqual(
      expect.objectContaining({ code: 'PLUGIN_HOST_RESOURCE_CLOSED' })
    )
    expect(harness.engine.providers.size).toBe(0)
    expect(harness.engine.registerPluginProvider).not.toHaveBeenCalled()
    await expect(harness.engine.execute(PROVIDER_ID)).resolves.toEqual({ accepted: false })
  })

  it('rejects a payload that is not a provider object before touching the engine', async () => {
    const harness = createHarness('reco-live')

    await expect(harness.registry.dispatch(REGISTER, PROVIDER_ID)).rejects.toBeInstanceOf(
      PluginHostCapabilityError
    )
    await expect(
      harness.registry.dispatch(REGISTER, registration({ onExecute: undefined }))
    ).rejects.toEqual(expect.objectContaining({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' }))
    expect(harness.engine.providers.size).toBe(0)
  })

  it('accepts a callback only at a field the capability declared', async () => {
    const harness = createHarness('reco-live')

    await expect(
      harness.registry.dispatch(
        REGISTER,
        registration({ canProvide: () => true, extraHook: () => true })
      )
    ).rejects.toEqual(expect.objectContaining({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' }))
    expect(harness.engine.providers.size).toBe(0)
  })
})
