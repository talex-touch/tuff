import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import { describe, expect, it } from 'vitest'
import { build } from '../core/exporter'

async function createProject({
  rootIndexContent,
  indexEntryContent,
  manifestBuild,
}: {
  rootIndexContent?: string
  indexEntryContent?: string
  manifestBuild?: Record<string, unknown>
}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-index-'))
  await fs.writeJson(path.join(root, 'package.json'), {
    name: 'demo-plugin',
    version: '1.0.0',
  })
  await fs.writeJson(path.join(root, 'manifest.json'), {
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

  return root
}

describe('index bundling precedence', () => {
  it(
    'prefers root index.js when manifest override is absent',
    async () => {
      const root = await createProject({
        rootIndexContent: 'console.log(\'root-index\')',
        indexEntryContent: 'console.log(\'index-folder\')',
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
})
