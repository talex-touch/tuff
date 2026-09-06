import type { TuffItem } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecommendationSourceRegistry } from './recommendation-source-registry'

const item = (id: string): TuffItem =>
  ({
    id,
    source: { id: 'test', type: 'application', name: 'Test' },
    kind: 'app',
    render: { mode: 'default', basic: { title: id } },
    actions: [],
    meta: {}
  }) as unknown as TuffItem

describe('RecommendationSourceRegistry', () => {
  let registry: RecommendationSourceRegistry

  beforeEach(() => {
    registry = new RecommendationSourceRegistry()
  })

  it('resolves a source by its canonical id', async () => {
    const rebuild = vi.fn(async (ids: readonly string[]) => ids.map(item))
    registry.registerSource({ sourceId: 'app-provider', rebuild })

    const entry = registry.resolve('app-provider')
    expect(entry?.sourceId).toBe('app-provider')
    await expect(entry?.rebuild(['a'])).resolves.toEqual([item('a')])
  })

  it('resolves aliases to the owning source', () => {
    registry.registerSource({
      sourceId: 'file-provider',
      aliases: ['file', 'files', 'everything-provider'],
      rebuild: async () => []
    })

    expect(registry.canonicalize('everything-provider')).toBe('file-provider')
    expect(registry.resolve('files')?.sourceId).toBe('file-provider')
  })

  it('passes unknown ids through canonicalize unchanged', () => {
    expect(registry.canonicalize('never-registered')).toBe('never-registered')
    expect(registry.resolve('never-registered')).toBeUndefined()
  })

  it('rejects a duplicate source id instead of replacing the incumbent', async () => {
    const first = vi.fn(async () => [item('first')])
    registry.registerSource({ sourceId: 'dup', rebuild: first })

    expect(() =>
      registry.registerSource({ sourceId: 'dup', rebuild: async () => [item('second')] })
    ).toThrow(/already registered/)

    // The original must still be the one that answers.
    await expect(registry.resolve('dup')?.rebuild([])).resolves.toEqual([item('first')])
  })

  it('rejects an alias already claimed by another source', () => {
    registry.registerSource({ sourceId: 'a', aliases: ['shared'], rebuild: async () => [] })

    expect(() =>
      registry.registerSource({ sourceId: 'b', aliases: ['shared'], rebuild: async () => [] })
    ).toThrow(/already claimed by "a"/)
  })

  it('rejects an alias that collides with a registered source id', () => {
    registry.registerSource({ sourceId: 'app-provider', rebuild: async () => [] })

    expect(() =>
      registry.registerSource({
        sourceId: 'other',
        aliases: ['app-provider'],
        rebuild: async () => []
      })
    ).toThrow(/collides with registered source id/)
  })

  it('leaves the registry untouched when an alias conflict aborts registration', () => {
    registry.registerSource({ sourceId: 'a', aliases: ['shared'], rebuild: async () => [] })

    expect(() =>
      registry.registerSource({
        sourceId: 'b',
        aliases: ['fresh', 'shared'],
        rebuild: async () => []
      })
    ).toThrow()

    // 'fresh' was listed before the conflicting alias; a partial claim would leak it.
    expect(registry.resolve('fresh')).toBeUndefined()
    expect(registry.canonicalize('fresh')).toBe('fresh')
    expect(registry.listSourceIds()).toEqual(['a'])
  })

  it('stops resolving a source and its aliases after dispose', () => {
    const dispose = registry.registerSource({
      sourceId: 'temp',
      aliases: ['tmp'],
      rebuild: async () => []
    })

    dispose()

    expect(registry.resolve('temp')).toBeUndefined()
    expect(registry.resolve('tmp')).toBeUndefined()
    expect(registry.canonicalize('tmp')).toBe('tmp')
  })

  it('frees the alias for a new owner after dispose', () => {
    const dispose = registry.registerSource({
      sourceId: 'a',
      aliases: ['shared'],
      rebuild: async () => []
    })
    dispose()

    expect(() =>
      registry.registerSource({ sourceId: 'b', aliases: ['shared'], rebuild: async () => [] })
    ).not.toThrow()
    expect(registry.canonicalize('shared')).toBe('b')
  })

  it('is idempotent when dispose runs twice', () => {
    const dispose = registry.registerSource({ sourceId: 'temp', rebuild: async () => [] })

    expect(dispose()).toBeUndefined()
    expect(registry.unregister('temp')).toBe(false)
  })

  describe('registerProviderSource', () => {
    it('registers a provider that implements the rebuild capability', async () => {
      const provider = {
        id: 'system-actions-provider',
        rebuildRecommendationItems: vi.fn(async (ids: readonly string[]) => ids.map(item))
      }

      const dispose = registry.registerProviderSource(provider)

      expect(dispose).toBeTypeOf('function')
      await expect(registry.resolve('system-actions-provider')?.rebuild(['x'])).resolves.toEqual([
        item('x')
      ])
      expect(provider.rebuildRecommendationItems).toHaveBeenCalledWith(['x'])
    })

    it('picks up aliases declared by the provider', () => {
      registry.registerProviderSource({
        id: 'file-provider',
        recommendationSourceAliases: ['macos-spotlight-provider'],
        rebuildRecommendationItems: async () => []
      })

      expect(registry.canonicalize('macos-spotlight-provider')).toBe('file-provider')
    })

    it('returns null for a provider without the capability rather than throwing', () => {
      // Most providers never appear in recommendations; registerProvider calls this
      // unconditionally, so opting out must be silent.
      expect(registry.registerProviderSource({ id: 'preview-provider' })).toBeNull()
      expect(registry.listSourceIds()).toEqual([])
    })

    it('returns null for non-objects', () => {
      expect(registry.registerProviderSource(undefined)).toBeNull()
      expect(registry.registerProviderSource(null)).toBeNull()
      expect(registry.registerProviderSource('provider')).toBeNull()
    })

    it('binds the rebuild call to the provider instance', async () => {
      class Provider {
        readonly id = 'bound-provider'
        private readonly marker = 'kept'
        async rebuildRecommendationItems(ids: readonly string[]): Promise<TuffItem[]> {
          // Reading `this` fails if the registry stored a detached method reference.
          return ids.map((id) => item(`${id}:${this.marker}`))
        }
      }

      registry.registerProviderSource(new Provider())

      await expect(registry.resolve('bound-provider')?.rebuild(['a'])).resolves.toEqual([
        item('a:kept')
      ])
    })
  })
})
