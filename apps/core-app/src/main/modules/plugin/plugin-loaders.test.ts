import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CURRENT_SDK_VERSION, PERMISSION_ENFORCEMENT_MIN_VERSION } from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPluginLoader, createPluginLoadShell } from './plugin-loaders'

const { appMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false }
}))

const { networkRequestMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: appMock
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: networkRequestMock
  })
}))

vi.mock('../../core/tuff-icon', () => ({
  TuffIconImpl: class {
    status = 'ready'

    constructor() {}

    async init() {}
  }
}))

vi.mock('./plugin', () => ({
  TouchPlugin: class {
    name: string
    displayName?: string
    localizedName?: unknown
    localizedDescription?: unknown
    icon: unknown
    version: string
    desc: string
    readme: string
    dev: Record<string, unknown>
    pluginPath: string
    issues: Array<Record<string, unknown>>
    features: unknown[]
    searchProviders?: unknown[]
    indexedSources?: unknown[]
    declaredPermissions?: {
      required: string[]
      optional: string[]
      reasons: Record<string, string>
      localizedReasons?: Record<string, unknown>
    }
    loadState: string
    loadError?: { code: string; message: string }
    creationOptions?: { skipDataInit?: boolean }
    logger: {
      error: ReturnType<typeof vi.fn>
      debug: ReturnType<typeof vi.fn>
      warn: ReturnType<typeof vi.fn>
    }

    constructor(
      name: string,
      icon: unknown,
      version: string,
      desc: string,
      readme: string,
      dev: Record<string, unknown>,
      pluginPath: string,
      _platforms?: unknown,
      options?: { skipDataInit?: boolean }
    ) {
      this.name = name
      this.icon = icon
      this.version = version
      this.desc = desc
      this.readme = readme
      this.dev = dev
      this.pluginPath = pluginPath
      this.issues = []
      this.features = []
      this.loadState = 'ready'
      this.creationOptions = options
      this.logger = { error: vi.fn(), debug: vi.fn(), warn: vi.fn() }
    }

    addFeature() {
      return true
    }

    setLoadState(state: string, loadError?: { code: string; message: string }) {
      this.loadState = state
      this.loadError = loadError
    }
  }
}))

async function createPluginDir(manifest: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'plugin-loaders-test-'))
  const pluginPath = path.join(root, 'touch-translation')
  await fs.mkdir(pluginPath, { recursive: true })
  await fs.writeFile(
    path.join(pluginPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )
  return pluginPath
}

describe('createPluginLoader', () => {
  const createdPaths: string[] = []

  beforeEach(() => {
    appMock.isPackaged = false
    networkRequestMock.mockReset()
  })

  afterEach(async () => {
    await Promise.all(
      createdPaths.splice(0).map(async (pluginPath) => {
        await fs.rm(path.dirname(pluginPath), { recursive: true, force: true })
      })
    )
  })

  it('uses DevPluginLoader when dev.source is enabled in unpackaged runtime', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('DevPluginLoader')
  })

  it('uses DevPluginLoader for dev-source plugins even in packaged runtime', async () => {
    appMock.isPackaged = true
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('DevPluginLoader')
  })

  it('keeps LocalPluginLoader when dev.source is disabled', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: false, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('LocalPluginLoader')
  })

  it('keeps LocalPluginLoader when dev.address protocol is invalid', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'ftp://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('LocalPluginLoader')
  })

  it('keeps dev-source behavior when remote manifest fetch succeeds', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    networkRequestMock
      .mockResolvedValueOnce({
        data: {
          name: 'touch-translation',
          version: '1.0.0',
          description: 'remote',
          icon: { type: 'emoji', value: 'x' },
          sdkapi: CURRENT_SDK_VERSION,
          category: 'utilities',
          dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
        }
      })
      .mockRejectedValueOnce(new Error('README missing'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('DEV_MODE_ACTIVE')
    expect(issueCodes).not.toContain('DEV_SOURCE_FALLBACK_LOCAL')
    expect(issueCodes).not.toContain('REMOTE_MANIFEST_FAILED')
    expect(plugin.dev).toMatchObject({ enable: true, source: true })
  })

  it('falls back to local assets when remote manifest fetch fails', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    networkRequestMock.mockRejectedValueOnce(new Error('connect refused'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('DEV_SOURCE_FALLBACK_LOCAL')
    expect(issueCodes).not.toContain('SDKAPI_BLOCKED')
    expect(issueCodes).not.toContain('REMOTE_MANIFEST_FAILED')
    expect(plugin.dev).toMatchObject({ enable: true, source: false })
  })

  it('keeps REMOTE_MANIFEST_FAILED when remote and local manifest both fail', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    await fs.writeFile(path.join(pluginPath, 'manifest.json'), '{ invalid-json', 'utf-8')
    networkRequestMock.mockRejectedValueOnce(new Error('connect refused'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('REMOTE_MANIFEST_FAILED')
    expect(issueCodes).not.toContain('DEV_SOURCE_FALLBACK_LOCAL')
  })

  it('sanitizes manifest build metadata before exposing runtime plugin state', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      build: {
        widgets: [
          {
            featureId: 'translate',
            widgetId: 'touch-translation::translate',
            sourcePath: 'widgets/panel.vue',
            compiledPath: 'widgets/.compiled/panel.cjs',
            hash: 'abc',
            styles: '',
            compiledAt: 1
          }
        ],
        internalOnly: { token: 'secret' }
      }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.build).toEqual({
      widgets: [
        expect.objectContaining({
          featureId: 'translate',
          widgetId: 'touch-translation::translate'
        })
      ]
    })
    expect(plugin.build).not.toHaveProperty('internalOnly')
  })

  it('resolves localized manifest metadata for runtime display without changing plugin id', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      displayName: {
        default: 'Translation',
        locales: {
          'zh-CN': '翻译'
        }
      },
      version: '1.0.0',
      description: {
        default: 'Translate text',
        locales: {
          'zh-CN': '翻译文本'
        }
      },
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['search.root-results'],
        optional: []
      },
      permissionReasons: {
        'search.root-results': {
          default: 'Show translation results',
          locales: {
            'zh-CN': '显示翻译结果'
          }
        }
      },
      features: [
        {
          id: 'translate',
          name: {
            default: 'Translate',
            locales: {
              'zh-CN': '翻译'
            }
          },
          desc: {
            default: 'Translate selected text',
            locales: {
              'zh-CN': '翻译选中文本'
            }
          },
          icon: { type: 'emoji', value: 'x' },
          keywords: {
            default: ['translate'],
            locales: {
              'zh-CN': ['翻译']
            }
          },
          push: true,
          platform: { darwin: true, win32: true, linux: true },
          commands: []
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.name).toBe('touch-translation')
    expect(plugin.displayName).toBe('翻译')
    expect(plugin.desc).toBe('翻译文本')
    expect(plugin.declaredPermissions?.reasons).toMatchObject({
      'search.root-results': '显示翻译结果'
    })
    expect(plugin.searchProviders?.[0]).toMatchObject({
      displayName: '翻译'
    })
  })

  it('keeps valid manifest search provider descriptors on plugin state', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['search.root-results'],
        optional: []
      },
      searchProviders: [
        {
          id: 'touch-translation.results',
          displayName: 'Translation Results',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.searchProviders).toHaveLength(1)
    expect(plugin.searchProviders?.[0]).toMatchObject({
      id: 'touch-translation.results',
      owner: 'third-party-plugin',
      mode: 'push',
      policy: {
        permissionScopes: ['root-results']
      }
    })
    expect(plugin.issues.some((issue) => issue.code === 'SEARCH_PROVIDER_PERMISSION_MISSING')).toBe(
      false
    )
  })

  it('keeps explicit official browser-data search providers without legacy derivation', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['fs.read', 'search.root-results'],
        optional: []
      },
      searchProviders: [
        {
          id: 'touch-translation.browser-bookmarks',
          displayName: 'Browser Bookmarks',
          kind: 'browser-bookmark',
          owner: 'official-plugin',
          mode: 'push',
          permissionScopes: ['root-results', 'browser-data'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      ],
      features: [
        {
          id: 'browser-data',
          name: 'Browser Data',
          desc: 'Search local browser bookmarks',
          icon: { type: 'emoji', value: 'x' },
          keywords: ['browser', 'bookmarks'],
          push: true,
          platform: { darwin: true, win32: true, linux: true },
          commands: []
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.searchProviders).toHaveLength(1)
    expect(plugin.searchProviders?.[0]).toMatchObject({
      id: 'touch-translation.browser-bookmarks',
      owner: 'official-plugin',
      kind: 'browser-bookmark',
      mode: 'push',
      policy: {
        permissionScopes: ['root-results', 'browser-data'],
        requiresUserConsent: true,
        pushesToRootResults: true
      }
    })
    expect(
      plugin.issues.some((issue) => issue.code === 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE')
    ).toBe(false)
    expect(plugin.issues.some((issue) => issue.code === 'SEARCH_PROVIDER_PERMISSION_MISSING')).toBe(
      false
    )
  })

  it('keeps official browser-data indexed source declarations as manifest metadata only', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['fs.read', 'fs.index', 'search.root-results'],
        optional: []
      },
      indexedSources: [
        {
          id: 'browser-bookmarks',
          template: 'browser-bookmarks',
          displayName: 'Browser Bookmarks',
          admission: {
            owner: 'official-plugin'
          }
        }
      ],
      searchProviders: [
        {
          id: 'touch-translation.browser-bookmarks',
          displayName: 'Browser Bookmarks',
          kind: 'browser-bookmark',
          owner: 'official-plugin',
          mode: 'push',
          permissionScopes: ['root-results', 'browser-data'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true,
          indexedSourceId: 'browser-bookmarks'
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.indexedSources).toHaveLength(1)
    expect(plugin.indexedSources?.[0]).toMatchObject({
      id: 'browser-bookmarks',
      kind: 'browser-bookmark',
      privacy: 'high',
      admission: {
        owner: 'official-plugin',
        permissionScopes: ['browser-data', 'file-system'],
        defaultState: 'disabled',
        requiresUserConsent: true
      }
    })
    expect(plugin.issues.some((issue) => issue.code === 'INDEXED_SOURCE_PERMISSION_MISSING')).toBe(
      false
    )
    expect(plugin.issues.some((issue) => issue.code === 'INDEXED_SOURCE_ADMISSION_BLOCKED')).toBe(
      false
    )
  })

  it('reports indexed source manifest permission gaps without registering the source', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['fs.read'],
        optional: []
      },
      indexedSources: [
        {
          id: 'browser-bookmarks',
          template: 'browser-bookmarks',
          admission: {
            owner: 'official-plugin'
          }
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()
    const issue = plugin.issues.find((item) => item.code === 'INDEXED_SOURCE_PERMISSION_MISSING')

    expect(plugin.indexedSources).toHaveLength(0)
    expect(issue).toMatchObject({
      type: 'error',
      source: 'indexedSource:browser-bookmarks',
      meta: {
        missingPermissionIds: ['fs.index']
      }
    })
  })

  it('reports manifest permission gaps for root-result search providers', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: [],
        optional: []
      },
      searchProviders: [
        {
          id: 'touch-translation.results',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()
    const issue = plugin.issues.find((item) => item.code === 'SEARCH_PROVIDER_PERMISSION_MISSING')

    expect(plugin.searchProviders).toHaveLength(0)
    expect(issue).toMatchObject({
      type: 'error',
      source: 'searchProvider:touch-translation.results',
      meta: {
        missingPermissionIds: ['search.root-results']
      }
    })
  })

  it('blocks third-party push search providers without explicit user consent', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['search.root-results'],
        optional: []
      },
      searchProviders: [
        {
          id: 'touch-translation.results',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'enabled',
          requiresUserConsent: false,
          pushesToRootResults: true
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()
    const issue = plugin.issues.find((item) => item.code === 'SEARCH_PROVIDER_POLICY_BLOCKED')

    expect(plugin.searchProviders).toHaveLength(0)
    expect(issue).toMatchObject({
      type: 'error',
      source: 'searchProvider:touch-translation.results',
      meta: {
        providerId: 'touch-translation.results',
        issues: ['third-party-push-requires-explicit-consent']
      }
    })
  })

  it('derives a compatibility search provider for legacy push features', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['search.root-results'],
        optional: []
      },
      features: [
        {
          id: 'translate',
          name: 'Translate',
          desc: 'Translate text',
          icon: { type: 'emoji', value: 'x' },
          keywords: ['translate'],
          push: true,
          platform: { darwin: true, win32: true, linux: true },
          commands: []
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.searchProviders).toHaveLength(1)
    expect(plugin.searchProviders?.[0]).toMatchObject({
      id: 'touch-translation.root-results',
      displayName: 'Translate',
      mode: 'push',
      policy: {
        permissionScopes: ['root-results'],
        requiresUserConsent: true,
        pushesToRootResults: true
      }
    })
    expect(
      plugin.issues.some((issue) => issue.code === 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE')
    ).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SEARCH_PROVIDER_PERMISSION_MISSING')).toBe(
      false
    )
  })

  it('derives compatibility search providers for every legacy push feature', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      permissions: {
        required: ['search.root-results'],
        optional: []
      },
      features: [
        {
          id: 'translate',
          name: 'Translate',
          desc: 'Translate text',
          icon: { type: 'emoji', value: 'x' },
          keywords: ['translate'],
          push: true,
          platform: { darwin: true, win32: true, linux: true },
          commands: []
        },
        {
          id: 'multi-translate',
          name: 'Multi Translate',
          desc: 'Translate text with multiple engines',
          icon: { type: 'emoji', value: 'x' },
          keywords: ['multi'],
          push: true,
          platform: { darwin: true, win32: true, linux: true },
          commands: []
        }
      ]
    })
    createdPaths.push(pluginPath)

    const plugin = await createPluginLoader('touch-translation', pluginPath).load()

    expect(plugin.searchProviders).toHaveLength(2)
    expect(plugin.searchProviders).toEqual([
      expect.objectContaining({
        id: 'touch-translation.translate',
        displayName: 'Translate',
        featureId: 'translate'
      }),
      expect.objectContaining({
        id: 'touch-translation.multi-translate',
        displayName: 'Multi Translate',
        featureId: 'multi-translate'
      })
    ])
    expect(
      plugin.issues.find((issue) => issue.code === 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE')
        ?.meta
    ).toMatchObject({ featureIds: ['translate', 'multi-translate'] })
  })

  it('marks plugins below the enforced sdkapi floor as blocked load failures', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'below-floor sdk plugin',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: PERMISSION_ENFORCEMENT_MIN_VERSION - 1
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_OUTDATED')).toBe(false)
  })

  it('marks plugins without sdkapi as blocked load failures', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'missing sdk plugin',
      icon: { type: 'emoji', value: 'x' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_MISSING')).toBe(false)
  })

  it('blocks plugins with unsupported sdk markers', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'unsupported sdk plugin',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: 260501,
      category: 'utilities'
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_COMPAT_WARNING')).toBe(false)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_OUTDATED')).toBe(false)
  })

  it('blocks non-canonical historical sdk markers', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-dev-utils',
      version: '1.0.0',
      description: 'local dev utilities',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: 260421,
      category: 'utilities'
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-dev-utils', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
  })

  it('creates loader plugin shells without eager data initialization', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = (await loader.load()) as unknown as {
      creationOptions?: { skipDataInit?: boolean }
    }

    expect(plugin.creationOptions).toMatchObject({ skipDataInit: true })
  })

  it('creates a shared loading shell plugin shape', () => {
    const plugin = createPluginLoadShell('broken-plugin', '/tmp/broken', { skipDataInit: true })

    expect(plugin.name).toBe('broken-plugin')
    expect(plugin.version).toBe('0.0.0')
    expect(plugin.desc).toBe('')
    expect(plugin.dev).toMatchObject({ enable: false, address: '', source: false })
    expect(plugin.loadState).toBe('loading')
  })
})
