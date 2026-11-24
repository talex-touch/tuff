import type { StoreProviderDefinition } from '@talex-touch/utils/store'
import {
  DEFAULT_GITHUB_STORE_URL,
  DEFAULT_NPM_REGISTRY_URL,
  STORE_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/store'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/modules/nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://tuff.tagzxia.com'
}))

import { getMissingDefaultStoreSourceIds, normalizeStoreSourcesPayload } from './store-sources'

describe('store-sources normalization and migration', () => {
  it('seeds Tuff Nexus, GitHub, and NPM Registry by default with real URLs', () => {
    const result = normalizeStoreSourcesPayload(null, {
      ensureDefaults: true,
      baseUrl: 'https://tuff.tagzxia.com'
    })

    expect(result.version).toBe(STORE_SOURCES_STORAGE_VERSION)
    expect(result.sources.map((s) => s.id)).toEqual(['tuff-nexus', 'github-releases', 'npm-scope'])
    expect(result.sources.every((s) => !s.outdated)).toBe(true)

    const github = result.sources.find((s) => s.id === 'github-releases')!
    expect(github.name).toBe('GitHub')
    expect(github.url).toBe(DEFAULT_GITHUB_STORE_URL)
    expect(github.enabled).toBe(false)
    expect(github.config?.mode).toBe('search')

    const npm = result.sources.find((s) => s.id === 'npm-scope')!
    expect(npm.name).toBe('NPM Registry')
    expect(npm.url).toBe(DEFAULT_NPM_REGISTRY_URL)
    expect(npm.enabled).toBe(false)
    expect(npm.config?.registryUrl).toBe(DEFAULT_NPM_REGISTRY_URL)
    expect(npm.config?.keywords).toEqual(['tuff-plugin', 'talex-touch-plugin'])
  })

  it('migrates legacy v1 payload: prunes dead placeholders and upgrades GitHub & NPM in place', () => {
    const legacyV1Sources: StoreProviderDefinition[] = [
      {
        id: 'tuff-nexus',
        name: 'Tuff Nexus',
        type: 'tpexApi',
        url: 'https://old.example.com',
        config: { apiUrl: 'https://old.example.com/api/store/plugins' },
        description: 'Tuff 官方插件市场，提供经过审核的插件。',
        enabled: true,
        priority: 110,
        trustLevel: 'official',
        readOnly: true,
        isOfficial: true,
        outdated: false
      },
      {
        id: 'npm-scope',
        name: 'NPM 包',
        type: 'npmPackage',
        config: { registryUrl: 'https://registry.npmjs.org', keyword: 'talex-touch-plugin' },
        description: '基于 NPM 关键字或 scope 的插件发布渠道。',
        enabled: false,
        priority: 60,
        trustLevel: 'unverified',
        readOnly: false,
        isOfficial: false,
        outdated: false
      },
      {
        id: 'talex-official',
        name: 'Talex Official',
        type: 'nexusStore',
        url: 'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json',
        enabled: false,
        priority: 100,
        trustLevel: 'official',
        readOnly: true,
        isOfficial: true,
        outdated: true
      },
      {
        id: 'github-releases',
        name: 'GitHub Releases',
        type: 'repository',
        config: { platform: 'github', apiBase: 'https://api.github.com' },
        description: '从 GitHub 仓库 releases / manifest 中读取插件。',
        enabled: false,
        priority: 80,
        trustLevel: 'unverified',
        readOnly: false,
        isOfficial: false,
        outdated: true
      },
      {
        id: 'gitee-repos',
        name: 'Gitee 仓库',
        type: 'repository',
        config: { platform: 'gitee', apiBase: 'https://gitee.com/api/v5' },
        description: 'Gitee 平台插件仓库，适合国内网络。',
        enabled: false,
        priority: 70,
        trustLevel: 'unverified',
        readOnly: false,
        isOfficial: false,
        outdated: true
      }
    ]

    const migrated = normalizeStoreSourcesPayload(
      { version: 1, sources: legacyV1Sources },
      { baseUrl: 'https://tuff.tagzxia.com' }
    )

    expect(migrated.version).toBe(STORE_SOURCES_STORAGE_VERSION)
    expect(migrated.sources.map((s) => s.id)).toEqual([
      'tuff-nexus',
      'github-releases',
      'npm-scope'
    ])

    const nexus = migrated.sources[0]!
    expect(nexus.url).toBe('https://tuff.tagzxia.com')
    expect(nexus.config?.apiUrl).toBe('https://tuff.tagzxia.com/api/store/plugins')

    const github = migrated.sources[1]!
    expect(github.name).toBe('GitHub')
    expect(github.url).toBe(DEFAULT_GITHUB_STORE_URL)
    expect(github.outdated).toBe(false)
    expect(github.priority).toBe(90)

    const npm = migrated.sources[2]!
    expect(npm.name).toBe('NPM Registry')
    expect(npm.url).toBe(DEFAULT_NPM_REGISTRY_URL)
    expect(npm.outdated).toBe(false)
    expect(npm.priority).toBe(80)
  })

  it('migrates PR #2287 v1 npm-scope payload (with default url and tuff-plugin keyword) to v2 keywords and priority', () => {
    const migrated = normalizeStoreSourcesPayload(
      {
        version: 1,
        sources: [
          {
            id: 'npm-scope',
            name: 'NPM 包',
            type: 'npmPackage',
            url: DEFAULT_NPM_REGISTRY_URL,
            config: { registryUrl: DEFAULT_NPM_REGISTRY_URL, keyword: 'tuff-plugin' },
            description: '基于 NPM 关键字或 scope 的插件发布渠道。',
            enabled: false,
            priority: 60,
            trustLevel: 'unverified',
            outdated: false
          }
        ]
      },
      { baseUrl: 'https://tuff.tagzxia.com' }
    )

    const npm = migrated.sources.find((s) => s.id === 'npm-scope')!
    expect(npm.name).toBe('NPM Registry')
    expect(npm.url).toBe(DEFAULT_NPM_REGISTRY_URL)
    expect(npm.priority).toBe(80)
    expect(npm.config?.keyword).toBe('tuff-plugin')
    expect(npm.config?.keywords).toEqual(['tuff-plugin', 'talex-touch-plugin'])
  })

  it('preserves user customizations during v1 migration', () => {
    const migrated = normalizeStoreSourcesPayload(
      {
        version: 1,
        sources: [
          {
            id: 'npm-scope',
            name: 'My NPM Mirror',
            type: 'npmPackage',
            url: 'https://registry.npmmirror.com',
            config: { registryUrl: 'https://registry.npmmirror.com', keyword: 'my-custom-kw' },
            enabled: true,
            priority: 65
          },
          {
            id: 'gitee-repos',
            name: 'Gitee 仓库',
            type: 'repository',
            url: 'https://gitee.com/team/plugin-a',
            enabled: true,
            priority: 70
          }
        ]
      },
      { baseUrl: 'https://tuff.tagzxia.com' }
    )

    const npm = migrated.sources.find((s) => s.id === 'npm-scope')!
    expect(npm.name).toBe('My NPM Mirror')
    expect(npm.url).toBe('https://registry.npmmirror.com')
    expect(npm.enabled).toBe(true)
    expect(npm.config?.keyword).toBe('my-custom-kw')

    const gitee = migrated.sources.find((s) => s.id === 'gitee-repos')
    expect(gitee?.url).toBe('https://gitee.com/team/plugin-a')
    expect(migrated.sources.some((s) => s.id === 'github-releases')).toBe(true)
    expect(migrated.sources.some((s) => s.id === 'tuff-nexus')).toBe(true)
  })

  it('respects deleted optional defaults on v2 boot and restores them only on demand', () => {
    const v2WithoutNpm = {
      version: STORE_SOURCES_STORAGE_VERSION,
      sources: [
        {
          id: 'tuff-nexus',
          name: 'Tuff Nexus',
          type: 'tpexApi' as const,
          url: 'https://tuff.tagzxia.com',
          enabled: true,
          priority: 110,
          isOfficial: true,
          readOnly: true
        }
      ]
    }

    const normalBoot = normalizeStoreSourcesPayload(v2WithoutNpm, {
      ensureDefaults: true,
      baseUrl: 'https://tuff.tagzxia.com'
    })
    expect(normalBoot.sources.map((s) => s.id)).toEqual(['tuff-nexus'])
    expect(getMissingDefaultStoreSourceIds(normalBoot.sources)).toEqual([
      'github-releases',
      'npm-scope'
    ])

    const restored = normalizeStoreSourcesPayload(normalBoot, {
      restoreMissingDefaults: true,
      baseUrl: 'https://tuff.tagzxia.com'
    })
    expect(restored.sources.map((s) => s.id)).toEqual([
      'tuff-nexus',
      'github-releases',
      'npm-scope'
    ])
  })
})
