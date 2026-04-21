import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LEGACY_TRANSLATION_WIDGET_IMPORT,
  repairTouchTranslationRuntimeIfNeeded,
  TOUCH_TRANSLATION_PLUGIN_NAME
} from './plugin-runtime-repair'

async function ensureFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

async function createRuntimePlugin(
  rootDir: string,
  options: {
    includeLegacyWidgetImport?: boolean
    includePackageJson?: boolean
    manifestVersion?: string
    packageVersion?: string
  }
): Promise<string> {
  const pluginDir = path.join(rootDir, TOUCH_TRANSLATION_PLUGIN_NAME)
  await fs.mkdir(pluginDir, { recursive: true })

  await ensureFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(
      {
        id: 'com.tuffex.translation',
        name: TOUCH_TRANSLATION_PLUGIN_NAME,
        version: options.manifestVersion ?? '1.0.3',
        main: 'index.js'
      },
      null,
      2
    )
  )
  await ensureFile(path.join(pluginDir, 'index.js'), 'module.exports = { runtime: "old" }\n')
  await ensureFile(
    path.join(pluginDir, 'widgets/translate-panel.vue'),
    options.includeLegacyWidgetImport
      ? `<script setup lang="ts">\nimport legacy from '${LEGACY_TRANSLATION_WIDGET_IMPORT}'\n</script>\n`
      : `<script setup lang="ts">\nimport { useChannel } from '@talex-touch/utils/plugin/sdk'\n</script>\n`
  )

  if (options.includePackageJson !== false) {
    await ensureFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify(
        {
          name: '@talex-touch/touch-translation-plugin',
          version: options.packageVersion ?? options.manifestVersion ?? '1.0.3'
        },
        null,
        2
      )
    )
  }

  await ensureFile(path.join(pluginDir, 'shared/translation-shared.cjs'), 'module.exports = {};\n')
  return pluginDir
}

async function createSourcePlugin(sourceDir: string, version = '1.0.4'): Promise<void> {
  await fs.mkdir(sourceDir, { recursive: true })
  await ensureFile(
    path.join(sourceDir, 'manifest.json'),
    JSON.stringify(
      {
        id: 'com.tuffex.translation',
        name: TOUCH_TRANSLATION_PLUGIN_NAME,
        version,
        main: 'index.js',
        dev: {
          enable: false,
          address: '',
          source: false
        }
      },
      null,
      2
    )
  )
  await ensureFile(path.join(sourceDir, 'index.js'), 'module.exports = { runtime: "new" }\n')
  await ensureFile(
    path.join(sourceDir, 'widgets/translate-panel.vue'),
    `<script setup lang="ts">\nimport { useChannel } from '@talex-touch/utils/plugin/sdk'\n</script>\n`
  )
}

describe('plugin-runtime-repair', () => {
  const createdRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      createdRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true }))
    )
  })

  it('repairs stale touch-translation runtime plugin from the bundled runtime seed', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const pluginRootDir = path.join(root, 'runtime/plugins')
    const appPath = path.join(root, 'app-root')
    const sourceDir = path.join(appPath, 'tuff/modules/plugins/touch-translation')

    await createRuntimePlugin(pluginRootDir, {
      includeLegacyWidgetImport: true,
      manifestVersion: '1.0.3',
      packageVersion: '1.0.3'
    })
    await createSourcePlugin(sourceDir, '1.0.4')

    const result = await repairTouchTranslationRuntimeIfNeeded({
      pluginRootDir,
      appPath,
      isPackaged: true
    })

    expect(result.status).toBe('repaired')
    expect(result.repaired).toBe(true)
    expect(result.sourceDir).toBe(sourceDir)
    expect(result.driftReasons).toContain('legacy-widget-shared-import')

    const repairedManifest = JSON.parse(
      await fs.readFile(
        path.join(pluginRootDir, TOUCH_TRANSLATION_PLUGIN_NAME, 'manifest.json'),
        'utf-8'
      )
    ) as { version: string }
    expect(repairedManifest.version).toBe('1.0.4')

    const repairedWidget = await fs.readFile(
      path.join(pluginRootDir, TOUCH_TRANSLATION_PLUGIN_NAME, 'widgets/translate-panel.vue'),
      'utf-8'
    )
    expect(repairedWidget).not.toContain(LEGACY_TRANSLATION_WIDGET_IMPORT)
    await expect(
      fs.access(
        path.join(pluginRootDir, TOUCH_TRANSLATION_PLUGIN_NAME, 'shared/translation-shared.cjs')
      )
    ).rejects.toThrow()
  })

  it('prefers canonical dist/build source in unpackaged runtime', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const workspaceRoot = path.join(root, 'workspace')
    const pluginRootDir = path.join(workspaceRoot, 'runtime/plugins')
    const appPath = path.join(workspaceRoot, 'apps/core-app')
    const canonicalSourceDir = path.join(workspaceRoot, 'plugins/touch-translation/dist/build')
    const bundledSourceDir = path.join(appPath, 'tuff/modules/plugins/touch-translation')

    await createRuntimePlugin(pluginRootDir, {
      includeLegacyWidgetImport: true,
      manifestVersion: '1.0.2',
      packageVersion: '1.0.2'
    })
    await createSourcePlugin(canonicalSourceDir, '1.0.4')
    await createSourcePlugin(bundledSourceDir, '1.0.1')

    const result = await repairTouchTranslationRuntimeIfNeeded({
      pluginRootDir,
      appPath,
      isPackaged: false
    })

    expect(result.status).toBe('repaired')
    expect(result.sourceDir).toBe(canonicalSourceDir)
  })

  it('skips healthy runtime plugin without rewriting files', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const pluginRootDir = path.join(root, 'runtime/plugins')
    const appPath = path.join(root, 'app-root')
    const sourceDir = path.join(appPath, 'tuff/modules/plugins/touch-translation')
    const targetDir = await createRuntimePlugin(pluginRootDir, {
      includeLegacyWidgetImport: false,
      manifestVersion: '1.0.4',
      packageVersion: '1.0.4'
    })
    await createSourcePlugin(sourceDir, '1.0.4')

    const beforeStat = await fs.stat(path.join(targetDir, 'index.js'))
    const result = await repairTouchTranslationRuntimeIfNeeded({
      pluginRootDir,
      appPath,
      isPackaged: true
    })
    const afterStat = await fs.stat(path.join(targetDir, 'index.js'))

    expect(result.status).toBe('healthy')
    expect(result.repaired).toBe(false)
    expect(result.driftReasons).toEqual([])
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs)
  })
})
