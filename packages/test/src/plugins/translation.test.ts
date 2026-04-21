import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

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

  it('normalizes translation failure messages', () => {
    expect(translationTest.normalizeCallFailureMessage('')).toBe('调用失败：翻译服务暂不可用，请稍后重试')
    expect(translationTest.normalizeErrorMessage('permission denied')).toBe('权限被拒绝：请在插件设置中授予所需权限后重试')
    expect(translationTest.normalizeErrorMessage('无输入：')).toBe('无输入：请输入要翻译的文本')
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
})
