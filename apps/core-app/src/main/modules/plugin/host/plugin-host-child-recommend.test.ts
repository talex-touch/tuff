import { describe, expect, it, vi } from 'vitest'
import {
  RECOMMENDATION_MODEL_VERSION,
  TIME_CONTRIBUTION_MAX,
  type UsageBehaviorFacts
} from '@talex-touch/utils/core-box/recommendation-weights'
import { recommendWeights } from '@talex-touch/utils/plugin/sdk/recommend'
import { loadPluginPrelude } from './plugin-host-child-runtime'

/**
 * The isolated child realm is the only place a plugin can reach `recommend.*`, so these tests drive
 * the real VM (`loadPluginPrelude`) and assert on what crosses the wire. The host end of the
 * capability is faked: the child projection, the callback encoding, and the realm-local weight
 * model are what is under test here.
 */
const RECOMMEND_REGISTER = 'recommend.provider.register'
const RECOMMEND_UNREGISTER = 'recommend.provider.unregister'

function payload(
  scriptContent: string,
  declared: { register?: boolean; unregister?: boolean } = {}
) {
  const capabilityManifest: Array<{
    id: string
    callbackLifetime: 'transient' | 'resource'
    callbackFields: string[]
  }> = []
  if (declared.register) {
    capabilityManifest.push({
      id: RECOMMEND_REGISTER,
      callbackLifetime: 'resource',
      callbackFields: ['canProvide', 'getCandidates', 'onExecute']
    })
  }
  if (declared.unregister) {
    capabilityManifest.push({
      id: RECOMMEND_UNREGISTER,
      callbackLifetime: 'transient',
      callbackFields: []
    })
  }
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: 'reco-live' }
    },
    capabilityManifest,
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

const resourceToken = Object.freeze(Object.create(null) as object)

describe('plugin host child recommend facade', () => {
  it('registers a provider through the declared resource capability and hands the host live callbacks', async () => {
    interface CapturedProvider {
      canProvide: (context: unknown) => Promise<unknown>
      getCandidates: (context: unknown) => Promise<unknown>
      onExecute: (candidate: unknown, args: unknown) => Promise<unknown>
    }
    let registered: CapturedProvider | undefined
    const invokeCapability = vi.fn(async (capability: string, request: unknown) => {
      expect(capability).toBe(RECOMMEND_REGISTER)
      registered = request as CapturedProvider
      return resourceToken
    })
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const disposer = await recommend.registerProvider({
                id: 'reco-live-provider',
                name: 'Isolated recommendation actions',
                canProvide: () => true,
                getCandidates: () => [{ id: 'reco-live-success', title: '隔离推荐成功动作', priority: 100 }],
                onExecute: (candidate) => candidate.action !== 'reject'
              })
              return {
                disposerType: typeof disposer,
                keys: Object.keys(recommend),
                weightsType: typeof recommend.weights,
                frozen: Object.isFrozen(recommend) && Object.isFrozen(recommend.registerProvider),
                nullPrototype: Object.getPrototypeOf(recommend) === null,
                pluginProjection: typeof plugin.recommend
              }
            }
          }
        `,
        { register: true, unregister: true }
      ),
      {
        invokeCapability,
        inspectResource: (value) =>
          value === resourceToken ? { id: 'reco-provider-resource', kind: 'disposer' } : null
      }
    )

    const result = (await runtime.callLifecycle('onInit', []).promise) as Record<string, unknown>
    expect(result.disposerType).toBe('function')
    expect(result.keys).toEqual(['registerProvider', 'unregisterProvider', 'weights'])
    expect(result.weightsType).toBe('object')
    expect(result.frozen).toBe(true)
    expect(result.nullPrototype).toBe(true)
    expect(result.pluginProjection).toBe('object')

    // The provider callbacks must outlive the capability call that delivered them: the host invokes
    // them on later recommendation passes and executions, not while the registration request runs.
    expect(registered).toBeDefined()
    await expect(registered!.canProvide({})).resolves.toBe(true)
    await expect(registered!.getCandidates({})).resolves.toEqual([
      { id: 'reco-live-success', title: '隔离推荐成功动作', priority: 100 }
    ])
    await expect(registered!.onExecute({ action: 'save' }, {})).resolves.toBe(true)
    await expect(registered!.onExecute({ action: 'reject' }, {})).resolves.toBe(false)

    runtime.shutdown()
  })

  it('releases the host resource exactly once when the returned disposer is called', async () => {
    const disposeResource = vi.fn(async () => undefined)
    const invokeCapability = vi.fn(async () => resourceToken)
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const disposer = await recommend.registerProvider({
                id: 'reco-live-provider',
                name: 'Isolated recommendation actions',
                canProvide: () => true,
                getCandidates: () => [],
                onExecute: () => true
              })
              // A plugin may dispose from more than one path; the second call must not send a
              // second release for a resource the host has already dropped.
              await disposer()
              await disposer()
              return { disposed: true }
            }
          }
        `,
        { register: true }
      ),
      {
        invokeCapability,
        inspectResource: (value) =>
          value === resourceToken ? { id: 'reco-provider-resource', kind: 'disposer' } : null,
        disposeResource
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({ disposed: true })
    // Registration arrives via the capability call (third arg is the lifecycle scope, as with every
    // sibling facade); release goes through the resource disposer, not a second capability call.
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(
      RECOMMEND_REGISTER,
      expect.any(Object),
      expect.any(Number)
    )
    // The disposer must carry back the descriptor the host issued, or the host cannot find the
    // resource to release — and it must do so once, not once per disposer call.
    expect(disposeResource).toHaveBeenCalledExactlyOnceWith('reco-provider-resource', 'disposer')

    runtime.shutdown()
  })

  it('returns the host outcome from unregisterProvider instead of assuming success', async () => {
    for (const outcome of [true, false]) {
      const invokeCapability = vi.fn(async (capability: string) => {
        expect(capability).toBe(RECOMMEND_UNREGISTER)
        return outcome
      })
      const runtime = loadPluginPrelude(
        payload(
          `
            module.exports = {
              async onInit() {
                return { removed: await recommend.unregisterProvider('reco-live-provider') }
              }
            }
          `,
          { unregister: true }
        ),
        { invokeCapability }
      )

      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
        removed: outcome
      })
      runtime.shutdown()
    }
  })

  it('projects recommend without opening a Node escape or re-exposing raw host capabilities', async () => {
    const invokeCapability = vi.fn(async () => resourceToken)
    const runtime = loadPluginPrelude(
      {
        ...payload(
          `
            module.exports = {
              onInit() {
                let escape = false
                let weightsEscape = false
                try { recommend.registerProvider.constructor('return process')() } catch { escape = true }
                try { recommend.weights.behaviorScore.constructor('return process')() } catch { weightsEscape = true }
                return {
                  recommendType: typeof recommend,
                  processType: typeof process,
                  requireType: typeof require,
                  moduleLookup: typeof __filename,
                  hostCapabilitiesType: typeof hostCapabilities,
                  escape,
                  weightsEscape
                }
              }
            }
          `,
          { register: true }
        ),
        // A prelude that normally hides the raw host-capability bridge must keep hiding it after
        // recommend is projected; the new capability must not become a second privileged surface.
        snapshot: {
          platform: 'darwin',
          arch: 'arm64',
          locale: 'zh-CN',
          manifest: { name: 'touch-translation' }
        }
      },
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      recommendType: 'object',
      processType: 'undefined',
      requireType: 'undefined',
      moduleLookup: 'undefined',
      hostCapabilitiesType: 'undefined',
      escape: true,
      weightsEscape: true
    })
    runtime.shutdown()
  })

  it('omits the recommend facade entirely when no recommend capability is declared', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          onInit() {
            return {
              globalRecommend: typeof recommend,
              pluginRecommend: typeof plugin.recommend
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      globalRecommend: 'undefined',
      pluginRecommend: 'undefined'
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('projects a realm-local weight model that agrees with the published standalone model', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `
        module.exports = {
          onInit(samples) {
            const w = recommend.weights
            return {
              timeOneUseOneDay: w.timeContribution(samples.oneUse, samples.now, samples.nowMs),
              timeNineUses: w.timeContribution(samples.nineUses, samples.now, samples.nowMs),
              timeTenUses: w.timeContribution(samples.tenUses, samples.now, samples.nowMs),
              timeThirtyUses: w.timeContribution(samples.thirtyUses, samples.now, samples.nowMs),
              behaviorThirtyUses: w.behaviorScore(samples.thirtyUses),
              frequentFiveUses: w.isFrequentEligible(samples.fiveUses),
              frequentFourUses: w.isFrequentEligible(samples.fourUsesTwoDays),
              priorityFull: w.pluginPriorityContribution(100),
              priorityUndefined: w.pluginPriorityContribution(undefined),
              modelVersion: w.modelVersion,
              timeContributionMax: w.constants.timeContributionMax,
              frozen: Object.isFrozen(w)
            }
          }
        }
        `,
        { register: true }
      )
    )

    const now = { hourOfDay: 10, dayOfWeek: 3, isWorkingHours: true, timeSlot: 'morning' as const }
    const nowMs = Date.parse('2026-09-30T10:00:00.000Z')
    const samples = {
      now,
      nowMs,
      oneUse: facts({ executeCount30: 1, executeCount7: 1, activeDays30: 1 }),
      nineUses: concentrated({ executeCount30: 9, executeCount7: 9, activeDays30: 3 }, nowMs),
      tenUses: concentrated({ executeCount30: 10, executeCount7: 10, activeDays30: 3 }, nowMs),
      fiveUses: facts({ executeCount30: 5, executeCount7: 5, activeDays30: 3 }),
      fourUsesTwoDays: facts({ executeCount30: 4, executeCount7: 4, activeDays30: 2 }),
      thirtyUses: concentrated({ executeCount30: 30, executeCount7: 30, activeDays30: 3 }, nowMs)
    }

    const result = (await runtime.callLifecycle('onInit', [samples]).promise) as Record<
      string,
      unknown
    >

    // The evidence gate is the point of the shared model: one concentrated use earns nothing, and
    // nine uses over three days is still below the 10-execution / 3-day threshold.
    expect(result.timeOneUseOneDay).toBe(0)
    expect(result.timeNineUses).toBe(0)
    // Ten uses over three days clears the gate; its time points are real but never exceed the cap,
    // and at full evidence the contribution saturates exactly at the cap.
    expect(result.timeTenUses as number).toBeGreaterThan(0)
    expect(result.timeTenUses as number).toBeLessThanOrEqual(TIME_CONTRIBUTION_MAX)
    expect(result.timeThirtyUses).toBe(TIME_CONTRIBUTION_MAX)
    // Strict frequent admission is 5 uses across 3 days; 4 uses across 2 days must not qualify.
    expect(result.frequentFiveUses).toBe(true)
    expect(result.frequentFourUses).toBe(false)
    expect(result.priorityUndefined).toBe(0)
    expect(result.modelVersion).toBe(RECOMMENDATION_MODEL_VERSION)
    expect(result.timeContributionMax).toBe(TIME_CONTRIBUTION_MAX)
    expect(result.frozen).toBe(true)

    // Everything the child computed must equal the host-side model at the same inputs. A second,
    // divergent scoring implementation inside the child realm would otherwise be invisible.
    expect(result.timeTenUses).toBe(recommendWeights.timeContribution(samples.tenUses, now, nowMs))
    expect(result.timeThirtyUses).toBe(
      recommendWeights.timeContribution(samples.thirtyUses, now, nowMs)
    )
    expect(result.behaviorThirtyUses).toBe(recommendWeights.behaviorScore(samples.thirtyUses))
    expect(result.priorityFull).toBe(recommendWeights.pluginPriorityContribution(100))

    runtime.shutdown()
  })
})

function concentration(nowMs: number) {
  return {
    lastExecutedAt: nowMs,
    hourDistribution30: hourBuckets([10]),
    dayOfWeekDistribution30: dayBuckets([3], 10),
    timeSlotDistribution30: { morning: 10, afternoon: 0, evening: 0, night: 0 }
  }
}

function concentrated(overrides: Partial<UsageBehaviorFacts>, nowMs: number): UsageBehaviorFacts {
  return facts({ ...concentration(nowMs), ...overrides })
}

function hourBuckets(hours: readonly number[]): number[] {
  const buckets = new Array<number>(24).fill(0)
  for (const hour of hours) buckets[hour] = (buckets[hour] ?? 0) + 1
  return buckets
}

function dayBuckets(days: readonly number[], count: number): number[] {
  const buckets = new Array<number>(7).fill(0)
  for (const day of days) buckets[day] = count
  return buckets
}

function facts(overrides: Partial<UsageBehaviorFacts> = {}): UsageBehaviorFacts {
  return {
    executeCount: 30,
    executeCount30: 0,
    executeCount7: 0,
    activeDays30: 0,
    lastExecutedAt: null,
    decayedExecuteScore30: 0,
    hourDistribution30: new Array<number>(24).fill(0),
    dayOfWeekDistribution30: new Array<number>(7).fill(0),
    timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    ...overrides
  }
}
