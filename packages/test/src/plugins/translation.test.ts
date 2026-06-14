import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const translationPlugin = loadPluginModule(
  new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
  createPluginGlobals(),
)
const { __test: translationTest } = translationPlugin

const ALLOWED_WIDGET_PACKAGES = [
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/transport',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types',
] as const

function extractWidgetImports(source: string): string[] {
  const patterns = [
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  ]

  const imports = new Set<string>()
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    match = pattern.exec(source)
    while (match !== null) {
      imports.add(match[1]!)
      match = pattern.exec(source)
    }
  }

  return [...imports]
}

function listDisallowedWidgetImports(source: string): string[] {
  return extractWidgetImports(source).filter((moduleId) => {
    if (moduleId.startsWith('.') || moduleId.startsWith('/')) {
      return true
    }

    return !ALLOWED_WIDGET_PACKAGES.some(
      allowedPackage => moduleId === allowedPackage || moduleId.startsWith(`${allowedPackage}/`),
    )
  })
}

function resolvePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

class TestTuffItemBuilder {
  private readonly item: Record<string, any>

  constructor(id: string) {
    this.item = { id, actions: [], meta: {} }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon(icon: unknown) {
    this.item.icon = icon
    return this
  }

  setCustomRender(runtime: string, widgetId: string, payload: unknown) {
    this.item.customRender = { runtime, widgetId, payload }
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    return this.item
  }
}

const require = createRequire(import.meta.url)
const { syncTouchTranslationBundledRuntime } = require(
  '../../../../apps/core-app/scripts/lib/touch-translation-runtime-sync.js',
) as {
  syncTouchTranslationBundledRuntime: (options?: {
    projectRoot?: string
    workspaceRoot?: string
  }) => { skipped: boolean, synced: boolean }
}

function ensureBundledRuntimeSynced(): void {
  syncTouchTranslationBundledRuntime({
    projectRoot: resolvePath('../../../../apps/core-app'),
    workspaceRoot: resolvePath('../../../../'),
  })
}

describe('touch-translation shared helpers', () => {
  it('detects target language from input text', () => {
    expect(translationTest.detectLanguage('你好，世界')).toBe('zh')
    expect(translationTest.resolveTargetLanguage('你好，世界')).toBe('en')
    expect(translationTest.resolveTargetLanguage('hello world')).toBe('zh')
  })

  it('normalizes enabled providers by shared order and supported set', () => {
    const enabledProviders = translationTest.getEnabledProviderIds(
      {
        deepl: { enabled: true },
        google: { enabled: true },
        tuffintelligence: { enabled: true },
      },
      {
        supportedIds: ['google', 'tuffintelligence'],
      },
    )

    expect(enabledProviders).toEqual(['tuffintelligence', 'google'])
  })

  it('falls back to default fast providers when saved config has no supported provider', () => {
    const enabledProviders = translationTest.getEnabledProviderIds(
      {
        deepl: { enabled: true },
      },
      {
        supportedIds: ['google', 'tuffintelligence'],
      },
    )

    expect(enabledProviders).toEqual(['tuffintelligence', 'google'])
  })

  it('filters tuffintelligence out of runtime provider display when auth token is unavailable', async () => {
    const providerConfigs = [
      { id: 'tuffintelligence' },
      { id: 'google' },
    ]

    await expect(
      translationTest.filterAuthorizedProviderConfigs(providerConfigs, {
        canUseTuffIntelligenceProvider: async () => false,
      }),
    ).resolves.toEqual([{ id: 'google' }])

    await expect(
      translationTest.filterAuthorizedProviderConfigs(providerConfigs, {
        canUseTuffIntelligenceProvider: async () => true,
      }),
    ).resolves.toEqual(providerConfigs)
  })

  it('does not show tuffintelligence in triggered widget state while logged out', async () => {
    vi.useFakeTimers()
    const updatedItems: any[] = []
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        TuffItemBuilder: TestTuffItemBuilder,
        URLSearchParams,
        channel: {
          async send() {
            return ''
          },
        },
        plugin: {
          feature: {
            clearItems() {},
            updateItem(_id: string, item: unknown) {
              updatedItems.push(item)
            },
            pushItems(items: unknown[]) {
              updatedItems.push(...items)
            },
          },
          storage: {
            async getFile() {
              return {
                tuffintelligence: { enabled: true },
                google: { enabled: true },
              }
            },
            async setFile() {},
          },
          box: {
            hide() {},
          },
        },
      }),
    )
    const controller = new AbortController()
    controller.abort()

    try {
      await pluginModule.onFeatureTriggered('touch-translate', 'hello', {}, controller.signal)
      const providers = updatedItems[0]?.customRender?.payload?.providers ?? []
      expect(providers.map((provider: { id: string }) => provider.id)).toEqual(['google'])
    }
    finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('normalizes translation failure messages', () => {
    expect(translationTest.normalizeCallFailureMessage('')).toBe('调用失败：翻译服务暂不可用，请稍后重试')
    expect(translationTest.normalizeErrorMessage('permission denied')).toBe('权限被拒绝：请在插件设置中授予所需权限后重试')
    expect(translationTest.normalizeErrorMessage('无输入：')).toBe('无输入：请输入要翻译的文本')
  })

  it('keeps provider secrets out of metadata and reads runtime secrets from plugin storage', async () => {
    const secretGetCalls: string[] = []
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        plugin: {
          feature: {
            clearItems() {},
            pushItems() {},
          },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          secret: {
            async get(key: string) {
              secretGetCalls.push(key)
              return key === 'providers.baidu.secretKey' ? 'secure-baidu-secret' : null
            },
          },
          box: {
            hide() {},
          },
        },
      }),
    )

    expect(pluginModule.__test.stripProviderSecrets('baidu', {
      appId: 'baidu-app',
      secretKey: 'plain-secret',
      apiUrl: 'https://example.test',
    })).toEqual({
      appId: 'baidu-app',
      apiUrl: 'https://example.test',
    })
    await expect(pluginModule.__test.mergeProviderSecrets('baidu', {
      appId: 'baidu-app',
    })).resolves.toEqual({
      appId: 'baidu-app',
      secretKey: 'secure-baidu-secret',
    })
    expect(secretGetCalls).toEqual(['providers.baidu.secretKey'])
  })

  it('rechecks network permission after a denied translation request', async () => {
    let checkGranted = false
    const request = vi.fn(async () => checkGranted)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        permission: {
          check: async () => checkGranted,
          request,
        },
      }),
    )

    await expect(pluginModule.__test.ensureNetworkPermission()).resolves.toBe(false)

    checkGranted = true
    await expect(pluginModule.__test.ensureNetworkPermission()).resolves.toBe(true)

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('blocks network and AI helpers when permission sdk is unavailable', async () => {
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        permission: withoutGlobal(),
      }),
    )

    await expect(pluginModule.__test.ensureNetworkPermission()).resolves.toBe(false)
    await expect(pluginModule.__test.ensureClipboardWritePermission()).resolves.toBe(false)
    await expect(pluginModule.__test.canUseTuffIntelligenceProvider({ authToken: 'token' })).resolves.toBe(false)
  })

  it('blocks translation copy when clipboard.write permission is denied', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: {
          check: async () => false,
          request,
        },
        plugin: {
          feature: {
            clearItems() {},
            pushItems() {},
          },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide },
        },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'translated text' }],
    })

    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制翻译结果')
    expect(writeText).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks translation copy when permission sdk is unavailable', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: withoutGlobal(),
        plugin: {
          feature: {
            clearItems() {},
            pushItems() {},
          },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide },
        },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'translated text' }],
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('copies translation payload after clipboard.write permission is granted', async () => {
    const hide = vi.fn()
    const writeText = vi.fn()
    const request = vi.fn()
    const pluginModule = loadPluginModule(
      new URL('../../../../plugins/touch-translation/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: {
          check: async () => true,
          request,
        },
        plugin: {
          feature: {
            clearItems() {},
            pushItems() {},
          },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide },
        },
      }),
    )

    const result = await pluginModule.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: 'translated text' }],
    })

    expect(request).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith('translated text')
    expect(hide).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ externalAction: true, status: 'started' })
  })

  it('keeps translate-panel widgets sandbox-compatible in canonical and bundled runtime copies', () => {
    ensureBundledRuntimeSynced()

    const widgetFiles = [
      resolvePath('../../../../plugins/touch-translation/widgets/translate-panel.vue'),
      resolvePath('../../../../plugins/touch-translation/dist/build/widgets/translate-panel.vue'),
      resolvePath('../../../../apps/core-app/tuff/modules/plugins/touch-translation/widgets/translate-panel.vue'),
      resolvePath('../../../../apps/core-app/tuff/modules/plugins/touch-translation/dist/build/widgets/translate-panel.vue'),
    ]

    for (const widgetFile of widgetFiles) {
      const source = fs.readFileSync(widgetFile, 'utf-8')
      expect(source).not.toContain('../shared/translation-shared.cjs')
      expect(listDisallowedWidgetImports(source)).toEqual([])
    }
  })

  it('keeps bundled touch-translation runtime files aligned with canonical build output', () => {
    const canonicalRoot = resolvePath('../../../../plugins/touch-translation/')
    const canonicalBuildRoot = path.join(canonicalRoot, 'dist/build')
    const bundledRoot = resolvePath('../../../../apps/core-app/tuff/modules/plugins/touch-translation/')

    ensureBundledRuntimeSynced()

    const bundledBuildRoot = path.join(bundledRoot, 'dist/build')

    const canonicalPackage = JSON.parse(
      fs.readFileSync(path.join(canonicalRoot, 'package.json'), 'utf-8'),
    ) as { version: string }
    const canonicalBuildManifest = JSON.parse(
      fs.readFileSync(path.join(canonicalBuildRoot, 'manifest.json'), 'utf-8'),
    ) as { version: string }
    const bundledPackage = JSON.parse(
      fs.readFileSync(path.join(bundledRoot, 'package.json'), 'utf-8'),
    ) as { version: string }
    const bundledManifest = JSON.parse(
      fs.readFileSync(path.join(bundledRoot, 'manifest.json'), 'utf-8'),
    ) as { version: string }
    const bundledBuildManifest = JSON.parse(
      fs.readFileSync(path.join(bundledBuildRoot, 'manifest.json'), 'utf-8'),
    ) as { version: string }

    expect(bundledPackage.version).toBe(canonicalPackage.version)
    expect(bundledManifest.version).toBe(canonicalBuildManifest.version)
    expect(bundledBuildManifest.version).toBe(canonicalBuildManifest.version)
    expect(fs.readFileSync(path.join(bundledRoot, 'index.js'), 'utf-8')).toBe(
      fs.readFileSync(path.join(canonicalBuildRoot, 'index.js'), 'utf-8'),
    )
    expect(
      fs.readFileSync(path.join(bundledRoot, 'widgets/translate-panel.vue'), 'utf-8'),
    ).toBe(fs.readFileSync(path.join(canonicalBuildRoot, 'widgets/translate-panel.vue'), 'utf-8'))
    expect(
      fs.existsSync(
        path.join(canonicalRoot, 'dist', `touch-translation-${canonicalBuildManifest.version}.tpex`),
      ),
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(bundledRoot, 'dist', `touch-translation-${canonicalBuildManifest.version}.tpex`),
      ),
    ).toBe(true)
  })

  it('does not depend on plugin.search in canonical and bundled translation preludes', () => {
    ensureBundledRuntimeSynced()

    const preludeFiles = [
      resolvePath('../../../../plugins/touch-translation/index.js'),
      resolvePath('../../../../plugins/touch-translation/dist/build/index.js'),
      resolvePath('../../../../apps/core-app/tuff/modules/plugins/touch-translation/index.js'),
      resolvePath('../../../../apps/core-app/tuff/modules/plugins/touch-translation/dist/build/index.js'),
    ]

    for (const preludeFile of preludeFiles) {
      const source = fs.readFileSync(preludeFile, 'utf-8')
      expect(source).not.toContain('plugin.search.updateQuery')
    }
  })
})
