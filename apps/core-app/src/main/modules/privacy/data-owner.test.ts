import type { PrivacyDataCategory } from '@talex-touch/utils/transport/events/types'
import type { PrivacyDataOwnerCandidate } from './data-owner'
import { describe, expect, it, vi } from 'vitest'
import {
  createPrivacyDataOwnerRegistry,
  definePrivacyDataOwner,
  privacyOwnerCompletedDelete,
  privacyOwnerCompletedExport
} from './data-owner'
import {
  isValidPrivacyOwnerRequest,
  normalizePrivacyOwnerLimits,
  privacyInspectionResult,
  privacyPreviewResult,
  resolvePrivacyDeleteScope
} from './owner-utils'
import { DEFAULT_PRIVACY_RETENTION_POLICY } from './retention-policy'

function candidate(category: PrivacyDataCategory): PrivacyDataOwnerCandidate {
  const retentionMs =
    category === 'clipboard-history'
      ? DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'].retentionMs
      : category === 'search-history'
        ? DEFAULT_PRIVACY_RETENTION_POLICY.categories['search-history'].retentionMs
        : null
  return {
    categories: [category],
    inspect: vi.fn(async () => privacyInspectionResult(category, retentionMs, 0, 0)),
    previewDelete: vi.fn(async () => privacyPreviewResult(category)),
    delete: vi.fn(async () => privacyOwnerCompletedDelete(category)),
    export: vi.fn(async () => privacyOwnerCompletedExport(category)),
    applyRetention: vi.fn(async () => [privacyOwnerCompletedDelete(category)])
  }
}

describe('privacy data owner registry', () => {
  it('snapshots methods and serializes operations owned by one adapter', async () => {
    const calls: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const source = candidate('clipboard-history')
    source.delete = vi.fn(async () => {
      calls.push('first:start')
      await firstBarrier
      calls.push('first:end')
      return privacyOwnerCompletedDelete('clipboard-history')
    })
    const owner = definePrivacyDataOwner(source)
    const original = source.delete

    const first = owner.delete(
      {
        category: 'clipboard-history',
        mode: 'retention',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
        nowMs: Date.now()
      },
      new AbortController().signal
    )
    const second = owner.inspect(
      {
        category: 'clipboard-history',
        policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
        nowMs: Date.now()
      },
      new AbortController().signal
    )
    source.delete = vi.fn(async () => {
      throw new Error('replacement must not be observed')
    })

    await Promise.resolve()
    expect(calls).toEqual(['first:start'])
    expect(source.inspect).not.toHaveBeenCalled()
    releaseFirst?.()
    await Promise.all([first, second])

    expect(calls).toEqual(['first:start', 'first:end'])
    expect(source.inspect).toHaveBeenCalledOnce()
    expect(original).toHaveBeenCalledOnce()
  })

  it('normalizes non-finite and accessor-backed owner limits without invoking getters', () => {
    expect(
      normalizePrivacyOwnerLimits({
        batchSize: Number.NaN,
        maxRows: Number.POSITIVE_INFINITY,
        maxDurationMs: Number.NEGATIVE_INFINITY
      })
    ).toEqual({ batchSize: 100, maxRows: 2_000, maxDurationMs: 10_000 })

    const getter = vi.fn(() => 1)
    const limits = Object.defineProperty({}, 'batchSize', { get: getter })
    expect(normalizePrivacyOwnerLimits(limits)).toEqual({
      batchSize: 100,
      maxRows: 2_000,
      maxDurationMs: 10_000
    })
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects accessor-backed requests and unknown delete modes without invoking getters', () => {
    const getter = vi.fn(() => Date.now())
    const accessorRequest = {
      category: 'clipboard-history',
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history']
    }
    Object.defineProperty(accessorRequest, 'nowMs', { get: getter })

    expect(isValidPrivacyOwnerRequest(accessorRequest as never)).toBe(false)
    expect(getter).not.toHaveBeenCalled()

    const unknownMode = {
      category: 'clipboard-history',
      mode: 'unexpected-mode',
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
      nowMs: Date.now()
    }
    expect(isValidPrivacyOwnerRequest(unknownMode as never)).toBe(false)
    expect(resolvePrivacyDeleteScope(unknownMode as never, true).kind).toBe('invalid')

    const extraField = {
      category: 'clipboard-history',
      policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
      nowMs: Date.now(),
      deadlineMs: Date.now() + 1_000
    }
    expect(isValidPrivacyOwnerRequest(extraField as never)).toBe(false)

    const extraPolicyField = {
      category: 'clipboard-history',
      policy: {
        ...DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
        arbitraryRetentionAuthority: true
      },
      nowMs: Date.now()
    }
    expect(isValidPrivacyOwnerRequest(extraPolicyField as never)).toBe(false)

    const nowMs = Date.now()
    expect(
      resolvePrivacyDeleteScope(
        {
          category: 'clipboard-history',
          mode: 'manual-delete',
          confirmation: 'delete-selected-data',
          policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories['clipboard-history'],
          nowMs
        },
        true
      )
    ).toEqual({
      kind: 'eligible',
      cutoffMs: Number.MAX_SAFE_INTEGER,
      includeProtected: true
    })
  })

  it('rejects accessors, proxies, sparse arrays, duplicate categories, and unowned categories', () => {
    const accessor = candidate('clipboard-history') as PrivacyDataOwnerCandidate & {
      inspect: PrivacyDataOwnerCandidate['inspect']
    }
    Object.defineProperty(accessor, 'inspect', {
      enumerable: true,
      get() {
        return vi.fn()
      }
    })
    expect(() => definePrivacyDataOwner(accessor)).toThrow('PRIVACY_OWNER_INVALID')

    const hostile = new Proxy(candidate('clipboard-history'), {
      ownKeys() {
        throw new Error('CANARY_PROXY_ERROR')
      }
    })
    expect(() => definePrivacyDataOwner(hostile)).toThrow('PRIVACY_OWNER_INVALID')

    const categoryGetter = vi.fn(() => 'clipboard-history')
    const sparseCategories = {
      ...candidate('clipboard-history'),
      categories: new Array(1)
    } as PrivacyDataOwnerCandidate
    expect(() => definePrivacyDataOwner(sparseCategories)).toThrow('PRIVACY_OWNER_INVALID')
    const accessorCategories = {
      ...candidate('clipboard-history'),
      categories: Object.defineProperty([], '0', {
        enumerable: true,
        get: categoryGetter
      })
    } as PrivacyDataOwnerCandidate
    expect(() => definePrivacyDataOwner(accessorCategories)).toThrow('PRIVACY_OWNER_INVALID')
    expect(categoryGetter).not.toHaveBeenCalled()

    const first = definePrivacyDataOwner(candidate('clipboard-history'))
    const duplicate = definePrivacyDataOwner(candidate('clipboard-history'))
    expect(() => createPrivacyDataOwnerRegistry([first, duplicate])).toThrow(
      'PRIVACY_OWNER_CATEGORY_DUPLICATE'
    )

    const registry = createPrivacyDataOwnerRegistry([first])
    expect(() => registry.get('search-history')).toThrow('PRIVACY_OWNER_CATEGORY_UNAVAILABLE')

    const ownerGetter = vi.fn(() => first)
    const accessorOwners = Object.defineProperty([], '0', {
      enumerable: true,
      get: ownerGetter
    })
    expect(() => createPrivacyDataOwnerRegistry(accessorOwners as never)).toThrow(
      'PRIVACY_OWNER_INVALID'
    )
    expect(ownerGetter).not.toHaveBeenCalled()
  })

  it('registers non-retention lifecycle categories from the shared data-category contract', () => {
    const pluginData = definePrivacyDataOwner(candidate('plugin-data'))
    const memory = definePrivacyDataOwner(candidate('intelligence-memory'))
    const registry = createPrivacyDataOwnerRegistry([pluginData, memory])

    expect(registry.get('plugin-data').categories).toEqual(['plugin-data'])
    expect(registry.get('intelligence-memory').categories).toEqual(['intelligence-memory'])
  })
})
