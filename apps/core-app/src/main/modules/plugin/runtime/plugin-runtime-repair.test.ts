import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectPluginRuntimeDrift,
  RETIRED_TRANSLATION_WIDGET_IMPORT,
  PLUGIN_RUNTIME_DRIFT_CODE
} from './plugin-runtime-repair'

async function ensureFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

async function createRuntimePlugin(
  rootDir: string,
  options: {
    includeLegacyWidgetImport?: boolean
    includeIndex?: boolean
    includePackageJson?: boolean
    manifestVersion?: string
    packageVersion?: string
  }
): Promise<string> {
  const pluginDir = path.join(rootDir, 'touch-translation')
  await fs.mkdir(pluginDir, { recursive: true })

  await ensureFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(
      {
        id: 'com.tuffex.translation',
        name: 'touch-translation',
        version: options.manifestVersion ?? '1.0.4',
        main: 'index.js'
      },
      null,
      2
    )
  )

  if (options.includeIndex !== false) {
    await ensureFile(path.join(pluginDir, 'index.js'), 'module.exports = { runtime: "ok" }\n')
  }

  await ensureFile(
    path.join(pluginDir, 'widgets/translate-panel.vue'),
    options.includeLegacyWidgetImport
      ? `<script setup lang="ts">\nimport retiredRuntimeImport from '${RETIRED_TRANSLATION_WIDGET_IMPORT}'\n</script>\n`
      : `<script setup lang="ts">\nimport { useChannel } from '@talex-touch/utils/plugin/sdk'\n</script>\n`
  )

  if (options.includePackageJson !== false) {
    await ensureFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify(
        {
          name: '@talex-touch/touch-translation-plugin',
          version: options.packageVersion ?? options.manifestVersion ?? '1.0.4'
        },
        null,
        2
      )
    )
  }

  return pluginDir
}

describe('plugin-runtime-repair', () => {
  const createdRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      createdRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true }))
    )
  })

  it('detects runtime drift when retired imports are still present', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const pluginDir = await createRuntimePlugin(root, {
      includeLegacyWidgetImport: true,
      manifestVersion: '1.0.4',
      packageVersion: '1.0.3'
    })

    const result = await inspectPluginRuntimeDrift({ pluginDir })

    expect(PLUGIN_RUNTIME_DRIFT_CODE).toBe('PLUGIN_RUNTIME_DRIFT')
    expect(result.status).toBe('drifted')
    expect(result.driftReasons).toContain('retired-runtime-import')
    expect(result.driftReasons).toContain('package-version:1.0.3<1.0.4')
  })

  it('detects runtime drift when required files are missing', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const pluginDir = await createRuntimePlugin(root, {
      includeIndex: false,
      includeLegacyWidgetImport: false
    })

    const result = await inspectPluginRuntimeDrift({ pluginDir })

    expect(result.status).toBe('drifted')
    expect(result.driftReasons).toContain('missing-index')
  })

  it('treats healthy runtime bundles as clean', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'touch-translation-runtime-'))
    createdRoots.push(root)

    const pluginDir = await createRuntimePlugin(root, {
      includeLegacyWidgetImport: false,
      manifestVersion: '1.0.4',
      packageVersion: '1.0.4'
    })

    const result = await inspectPluginRuntimeDrift({ pluginDir })

    expect(result.status).toBe('healthy')
    expect(result.driftReasons).toEqual([])
  })
})
