import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../exporter'

async function withPluginFixture(fn: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-builder-widget-'))
  try {
    await fs.writeJson(path.join(root, 'package.json'), {
      name: 'demo-plugin',
      version: '1.0.0',
    })
    await fs.writeJson(path.join(root, 'manifest.json'), {
      id: 'com.tuffex.demo',
      name: 'demo-plugin',
      version: '1.0.0',
      description: 'Demo plugin',
      icon: { type: 'emoji', value: 'D' },
      features: [
        {
          id: 'translate',
          name: 'Translate',
          desc: 'Translate text',
          icon: { type: 'emoji', value: 'T' },
          push: true,
          platform: {},
          commands: [{ type: 'over', value: ['tr'] }],
          interaction: { type: 'widget', path: 'panel' },
        },
      ],
    })
    await fs.ensureDir(path.join(root, 'widgets'))
    await fs.writeFile(
      path.join(root, 'widgets', 'panel.vue'),
      [
        '<script setup lang="ts">',
        'import { computed } from \'vue\'',
        'const title = computed(() => \'Hello\')',
        '</script>',
        '<template><div class="panel">{{ title }}</div></template>',
        '<style>.panel{color:red;}</style>',
      ].join('\n'),
    )
    await fs.ensureDir(path.join(root, 'dist'))
    await fs.writeFile(path.join(root, 'dist', 'index.html'), '<div></div>')

    await fn(root)
  }
  finally {
    await fs.remove(root)
  }
}

async function readManifest(root: string) {
  return await fs.readJson(path.join(root, 'manifest.json'))
}

async function writeManifest(root: string, manifest: unknown) {
  await fs.writeJson(path.join(root, 'manifest.json'), manifest, { spaces: 2 })
}

describe('builder widget precompile', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('packages widget precompiled output and manifest metadata', async () => {
    await withPluginFixture(async (root) => {
      await build({
        root,
        outDir: 'dist',
        versionSync: { enabled: false },
      })

      const manifest = await fs.readJson(path.join(root, 'dist', 'build', 'manifest.json'))
      const widget = manifest.build.widgets[0]

      expect(widget).toMatchObject({
        featureId: 'translate',
        sourcePath: 'widgets/panel.vue',
        compiledPath: 'widgets/.compiled/demo-plugin__translate.cjs',
        metaPath: 'widgets/.compiled/demo-plugin__translate.meta.json',
        widgetId: 'demo-plugin::translate',
      })
      await expect(
        fs.pathExists(path.join(root, 'dist', 'build', widget.compiledPath)),
      ).resolves.toBe(true)
      await expect(
        fs.pathExists(path.join(root, 'dist', 'build', widget.metaPath)),
      ).resolves.toBe(true)
      expect(widget.styles).toContain('.panel')
      expect(widget.dependencies).toContain('vue')
    })
  })

  it('includes vue dependency for template-only widgets', async () => {
    await withPluginFixture(async (root) => {
      await fs.writeFile(
        path.join(root, 'widgets', 'panel.vue'),
        '<template><div class="panel">Hello</div></template>',
      )

      await build({
        root,
        outDir: 'dist',
        versionSync: { enabled: false },
      })

      const manifest = await fs.readJson(path.join(root, 'dist', 'build', 'manifest.json'))
      expect(manifest.build.widgets[0].dependencies).toEqual(['vue'])
    })
  })

  it('fails when a widget source file is missing', async () => {
    await withPluginFixture(async (root) => {
      const manifest = await readManifest(root)
      manifest.features[0].interaction.path = 'missing'
      await writeManifest(root, manifest)

      await expect(
        build({
          root,
          outDir: 'dist',
          versionSync: { enabled: false },
        }),
      ).rejects.toThrow(/WIDGET_NOT_FOUND.*translate/)
    })
  })

  it('fails when a widget imports an allowed package subpath not exposed by runtime sandbox', async () => {
    await withPluginFixture(async (root) => {
      await fs.writeFile(
        path.join(root, 'widgets', 'panel.vue'),
        [
          '<script setup>',
          'import { WIDGET_COMPILED_DIR } from "@talex-touch/utils/plugin/widget"',
          'void WIDGET_COMPILED_DIR',
          '</script>',
          '<template><div /></template>',
        ].join('\n'),
      )

      await expect(
        build({
          root,
          outDir: 'dist',
          versionSync: { enabled: false },
        }),
      ).rejects.toThrow(/WIDGET_INVALID_DEPENDENCY.*@talex-touch\/utils\/plugin\/widget/)
    })
  })

  it('fails when a widget imports a disallowed dependency', async () => {
    await withPluginFixture(async (root) => {
      await fs.writeFile(
        path.join(root, 'widgets', 'panel.vue'),
        [
          '<script setup>',
          'import helper from "../shared/helper.js"',
          'void helper',
          '</script>',
          '<template><div /></template>',
        ].join('\n'),
      )

      await expect(
        build({
          root,
          outDir: 'dist',
          versionSync: { enabled: false },
        }),
      ).rejects.toThrow(/WIDGET_INVALID_DEPENDENCY.*translate/)
    })
  })

  it('fails when Vue SFC template compilation reports errors', async () => {
    await withPluginFixture(async (root) => {
      await fs.writeFile(
        path.join(root, 'widgets', 'panel.vue'),
        '<template><div v-if=""></div></template>',
      )

      await expect(
        build({
          root,
          outDir: 'dist',
          versionSync: { enabled: false },
        }),
      ).rejects.toThrow(/WIDGET_TEMPLATE_ERROR.*translate/)
    })
  })

  it('skips experimental widgets unless explicitly included', async () => {
    await withPluginFixture(async (root) => {
      const manifest = await readManifest(root)
      manifest.features[0].experimental = true
      await writeManifest(root, manifest)

      await build({
        root,
        outDir: 'dist',
        versionSync: { enabled: false },
      })

      const packagedManifest = await fs.readJson(path.join(root, 'dist', 'build', 'manifest.json'))
      expect(packagedManifest.build?.widgets).toBeUndefined()
      await expect(
        fs.pathExists(path.join(root, 'dist', 'build', 'widgets', '.compiled')),
      ).resolves.toBe(false)
    })
  })
})
