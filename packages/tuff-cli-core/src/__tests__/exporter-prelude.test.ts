import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../exporter'

interface ProjectOptions {
  rootIndexContent?: string
  indexEntryContent?: string
  preludeEntryContent?: string
  preludeEntryPath?: string
  manifestBuild?: Record<string, unknown>
  packageJson?: Record<string, unknown>
}

async function createProject({
  rootIndexContent,
  indexEntryContent,
  preludeEntryContent,
  preludeEntryPath = 'main.ts',
  manifestBuild,
  packageJson,
}: ProjectOptions) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-exporter-prelude-'))
  await fs.writeJson(path.join(root, 'package.json'), {
    name: 'demo-plugin',
    version: '1.0.0',
    ...packageJson,
  })
  await fs.writeJson(path.join(root, 'manifest.json'), {
    id: 'com.tuffex.demo',
    name: 'demo-plugin',
    version: '1.0.0',
    sdkapi: 260428,
    category: 'utilities',
    permissions: { required: [], optional: [] },
    description: 'Demo plugin',
    icon: { type: 'emoji', value: 'D' },
    features: [],
    build: manifestBuild,
  })

  if (rootIndexContent)
    await fs.writeFile(path.join(root, 'index.js'), rootIndexContent)

  if (indexEntryContent) {
    const indexEntryPath = path.join(root, 'index', 'main.ts')
    await fs.ensureDir(path.dirname(indexEntryPath))
    await fs.writeFile(indexEntryPath, indexEntryContent)
  }

  if (preludeEntryContent) {
    const preludePath = path.join(root, 'src', 'prelude', preludeEntryPath)
    await fs.ensureDir(path.dirname(preludePath))
    await fs.writeFile(preludePath, preludeEntryContent)
  }

  return root
}

async function withProject(options: ProjectOptions, fn: (root: string) => Promise<void>) {
  const root = await createProject(options)
  try {
    await fn(root)
  }
  finally {
    await fs.remove(root)
  }
}

function buildProject(root: string) {
  return build({
    root,
    outDir: 'dist',
    indexDir: 'index',
    manifest: 'manifest.json',
    minify: false,
    sourcemap: false,
  })
}

async function readBuiltIndex(root: string) {
  return await fs.readFile(path.join(root, 'dist', 'build', 'index.js'), 'utf8')
}

describe('canonical exporter Prelude bundling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it(
    'builds a src/prelude entry into the runtime index.js',
    async () => {
      await withProject(
        {
          preludeEntryContent: 'const marker: string = \'src-prelude-marker\'\nconsole.log(marker)',
        },
        async (root) => {
          await buildProject(root)

          const output = await readBuiltIndex(root)
          expect(output).toContain('src-prelude-marker')
          expect(output).not.toContain('marker: string')
        },
      )
    },
    30000,
  )

  it(
    'prefers a root index.js over an implicit src/prelude entry',
    async () => {
      await withProject(
        {
          rootIndexContent: 'console.log(\'root-index-marker\')',
          preludeEntryContent: 'console.log(\'src-prelude-marker\')',
        },
        async (root) => {
          await buildProject(root)

          const output = await readBuiltIndex(root)
          expect(output).toContain('root-index-marker')
          expect(output).not.toContain('src-prelude-marker')
        },
      )
    },
    30000,
  )

  it(
    'lets manifest.build.prelude override a root index.js',
    async () => {
      await withProject(
        {
          rootIndexContent: 'console.log(\'root-index-marker\')',
          preludeEntryPath: 'entry.ts',
          preludeEntryContent: 'console.log(\'manifest-prelude-marker\')',
          manifestBuild: {
            prelude: { entry: 'src/prelude/entry.ts', format: 'cjs' },
          },
        },
        async (root) => {
          await buildProject(root)

          const output = await readBuiltIndex(root)
          expect(output).toContain('manifest-prelude-marker')
          expect(output).not.toContain('root-index-marker')
        },
      )
    },
    30000,
  )

  it(
    'lets manifest.build.index override a root index.js',
    async () => {
      await withProject(
        {
          rootIndexContent: 'console.log(\'root-index-marker\')',
          indexEntryContent: 'console.log(\'manifest-index-marker\')',
          manifestBuild: {
            index: { entry: 'index/main.ts', format: 'cjs' },
          },
        },
        async (root) => {
          await buildProject(root)

          const output = await readBuiltIndex(root)
          expect(output).toContain('manifest-index-marker')
          expect(output).not.toContain('root-index-marker')
        },
      )
    },
    30000,
  )

  it(
    'bundles a benign third-party Prelude dependency',
    async () => {
      await withProject(
        {
          preludeEntryContent: `
            import { uniq } from 'lodash-es'
            console.log(uniq(['a', 'a']).join(','))
          `,
          packageJson: {
            dependencies: { 'lodash-es': '^4.17.21' },
          },
        },
        async (root) => {
          const dependencyRoot = path.join(root, 'node_modules', 'lodash-es')
          await fs.ensureDir(dependencyRoot)
          await fs.writeJson(path.join(dependencyRoot, 'package.json'), {
            name: 'lodash-es',
            version: '4.17.21',
            module: 'index.js',
            sideEffects: false,
          })
          await fs.writeFile(
            path.join(dependencyRoot, 'index.js'),
            'export function uniq(items) { return Array.from(new Set(items)) }\n',
          )

          await buildProject(root)

          const output = await readBuiltIndex(root)
          expect(output).toContain('function uniq')
          expect(output).not.toContain('require("lodash-es")')
        },
      )
    },
    30000,
  )

  it(
    'rejects raw Electron imports even when Prelude bundling leaves them external',
    async () => {
      await withProject(
        {
          preludeEntryContent: `
            import { app } from 'electron'
            console.log(app?.name)
          `,
        },
        async (root) => {
          await expect(buildProject(root)).rejects.toThrow(
            'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE',
          )
        },
      )
    },
    30000,
  )

  it(
    'records files beneath dot-directories in the package integrity inventory',
    async () => {
      await withProject(
        { preludeEntryContent: 'console.log(\'dot-directory-marker\')' },
        async (root) => {
          const compiledWidgetPath = path.join(
            root,
            'widgets',
            '.compiled',
            'panel.cjs',
          )
          await fs.ensureDir(path.dirname(compiledWidgetPath))
          await fs.writeFile(compiledWidgetPath, 'module.exports = {}\n')

          await buildProject(root)

          const manifest = await fs.readJson(
            path.join(root, 'dist', 'build', 'manifest.json'),
          )
          expect(manifest._files).toHaveProperty('widgets/.compiled/panel.cjs')
        },
      )
    },
    30000,
  )
})
