import os from 'node:os'
import path from 'node:path'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import { build } from '../core/exporter'

async function createProject({
  rootIndexContent,
  indexEntryContent,
  preludeEntryContent,
  preludeEntryPath = 'main.ts',
  manifestBuild,
  packageJson,
}: {
  rootIndexContent?: string
  indexEntryContent?: string
  preludeEntryContent?: string
  preludeEntryPath?: string
  manifestBuild?: Record<string, unknown>
  packageJson?: Record<string, unknown>
}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-index-'))
  await fs.writeJson(path.join(root, 'package.json'), {
    name: 'demo-plugin',
    version: '1.0.0',
    ...(packageJson || {}),
  })
  await fs.writeJson(path.join(root, 'manifest.json'), {
    id: 'com.demo.plugin',
    name: 'demo-plugin',
    version: '1.0.0',
    build: manifestBuild,
  })

  if (rootIndexContent) {
    await fs.writeFile(path.join(root, 'index.js'), rootIndexContent)
  }

  if (indexEntryContent) {
    const indexDir = path.join(root, 'index')
    await fs.ensureDir(indexDir)
    await fs.writeFile(path.join(indexDir, 'main.ts'), indexEntryContent)
  }

  if (preludeEntryContent) {
    const preludePath = path.join(root, 'src/prelude', preludeEntryPath)
    await fs.ensureDir(path.dirname(preludePath))
    await fs.writeFile(preludePath, preludeEntryContent)
  }

  return root
}

describe('index bundling precedence', () => {
  it(
    'builds src/prelude/main.ts into dist/build/index.js',
    async () => {
      const root = await createProject({
        preludeEntryContent: 'console.log(\'src-prelude\')',
      })

      try {
        await build({
          root,
          outDir: 'dist',
          indexDir: 'index',
          manifest: 'manifest.json',
          minify: false,
          sourcemap: false,
        })

        const output = await fs.readFile(path.join(root, 'dist/build/index.js'), 'utf-8')
        expect(output).toContain('src-prelude')
        expect(output).toContain('Tuff Prelude bundle: src-prelude -> index.js')
      }
      finally {
        await fs.remove(root)
      }
    },
    30000,
  )

  it(
    'prefers root index.js when manifest override is absent',
    async () => {
      const root = await createProject({
        rootIndexContent: 'console.log(\'root-index\')',
        preludeEntryContent: 'console.log(\'src-prelude\')',
      })

      try {
        await build({
          root,
          outDir: 'dist',
          indexDir: 'index',
          manifest: 'manifest.json',
          minify: false,
          sourcemap: false,
          external: [],
        })

        const output = await fs.readFile(path.join(root, 'dist/build/index.js'), 'utf-8')
        expect(output).toContain('root-index')
        expect(output).not.toContain('src-prelude')
      }
      finally {
        await fs.remove(root)
      }
    },
    30000,
  )

  it(
    'uses manifest.build.prelude to force src/prelude bundling',
    async () => {
      const root = await createProject({
        rootIndexContent: 'console.log(\'root-index\')',
        preludeEntryPath: 'entry.ts',
        preludeEntryContent: 'console.log(\'manifest-prelude\')',
        manifestBuild: {
          prelude: {
            entry: 'src/prelude/entry.ts',
            format: 'cjs',
          },
        },
      })

      try {
        await build({
          root,
          outDir: 'dist',
          indexDir: 'index',
          manifest: 'manifest.json',
          minify: false,
          sourcemap: false,
        })

        const output = await fs.readFile(path.join(root, 'dist/build/index.js'), 'utf-8')
        expect(output).toContain('manifest-prelude')
        expect(output).not.toContain('root-index')
      }
      finally {
        await fs.remove(root)
      }
    },
    30000,
  )

  it(
    'uses manifest.build.index to force index/ bundling',
    async () => {
      const root = await createProject({
        rootIndexContent: 'console.log(\'root-index\')',
        indexEntryContent: 'console.log(\'index-folder\')',
        manifestBuild: {
          index: {
            entry: 'index/main.ts',
            format: 'cjs',
          },
        },
      })

      try {
        await build({
          root,
          outDir: 'dist',
          indexDir: 'index',
          manifest: 'manifest.json',
          minify: false,
          sourcemap: false,
          external: [],
        })

        const output = await fs.readFile(path.join(root, 'dist/build/index.js'), 'utf-8')
        expect(output).toContain('index-folder')
      }
      finally {
        await fs.remove(root)
      }
    },
    30000,
  )

  it(
    'bundles third-party dependencies by default and leaves electron external',
    async () => {
      const root = await createProject({
        preludeEntryContent: `
          import { uniq } from 'lodash-es'
          import { app } from 'electron'
          console.log(uniq(['a', 'a']).join(','), app?.name)
        `,
        packageJson: {
          dependencies: {
            'lodash-es': '^4.17.21',
          },
        },
      })

      await fs.ensureDir(path.join(root, 'node_modules/lodash-es'))
      await fs.writeJson(path.join(root, 'node_modules/lodash-es/package.json'), {
        name: 'lodash-es',
        version: '4.17.21',
        module: 'index.js',
        sideEffects: false,
      })
      await fs.writeFile(
        path.join(root, 'node_modules/lodash-es/index.js'),
        'export function uniq(items) { return Array.from(new Set(items)) }\n',
      )

      try {
        await build({
          root,
          outDir: 'dist',
          indexDir: 'index',
          manifest: 'manifest.json',
          minify: false,
          sourcemap: false,
        })

        const output = await fs.readFile(path.join(root, 'dist/build/index.js'), 'utf-8')
        expect(output).toContain('function uniq')
        expect(output).toContain('require("electron")')
        expect(output).not.toContain('require("lodash-es")')
      }
      finally {
        await fs.remove(root)
      }
    },
    30000,
  )
})
