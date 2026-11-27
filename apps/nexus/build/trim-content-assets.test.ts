import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyPrecomputedDependency,
  serializePrecomputedClientManifest,
  trimPrecomputedClientManifest,
} from './trim-content-assets.mjs'

const nexusRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const tempDirs: string[] = []

function makeTempWorkerRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-trim-manifest-'))
  tempDirs.push(dir)
  mkdirSync(join(dir, 'chunks/build'), { recursive: true })
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe('trim-content-assets precomputed client manifest trimming', () => {
  it('classifies top-level static assets for removal while keeping entrypoints and SSR modules', () => {
    const entrypoints = new Set(['entry.css', '../../../node_modules/nuxt/dist/app/entry.js'])

    expect(classifyPrecomputedDependency('entry.D1zDeYpB.css', entrypoints)).toBe('static-asset')
    expect(classifyPrecomputedDependency('KaTeX_Main-Regular.woff2', entrypoints)).toBe('static-asset')
    expect(classifyPrecomputedDependency('SearchApp.abc123.jpg', entrypoints)).toBe('static-asset')
    expect(classifyPrecomputedDependency('entry.css', entrypoints)).toBe('keep')
    expect(classifyPrecomputedDependency('../../../node_modules/nuxt/dist/app/entry.js', entrypoints)).toBe('keep')
    expect(classifyPrecomputedDependency('pages/dashboard/overview.vue', entrypoints)).toBe('keep')
    expect(classifyPrecomputedDependency('components/content/TuffCodeBlock.vue', entrypoints)).toBe('keep')
  })

  it('preserves shared inline variable definitions when stripped static-asset entries originally held the assignment', async () => {
    const workerRoot = makeTempWorkerRoot()
    const manifestPath = join(workerRoot, 'chunks/build/client.precomputed.mjs')

    // Mirrors Nitro/Vite's precomputed manifest: `e={...}` and `o={...}` are assigned inside a
    // top-level static-asset entry and referenced by later SSR page entries. String-slicing the
    // entry would leave `e`/`o` undefined; parsing and re-serializing preserves and deduplicates them.
    const rawManifest = [
      'const s={dependencies:{',
      '"tuffex.css":{scripts:{},styles:{"tuffex.css":o={resourceType:"style",preload:!0,file:"tuffex.css"}},preload:{"shared.js":e={resourceType:"script",module:!0,preload:!0,file:"shared.js"},"tuffex.css":o},prefetch:{}},',
      '"pages/dashboard/overview.vue":{scripts:{"entry.js":t={resourceType:"script",module:!0,file:"entry.js"}},styles:{"tuffex.css":o},preload:{"shared.js":e,"tuffex.css":o},prefetch:{"lazy.js":{file:"lazy.js"}}},',
      '"pages/docs/[...slug].vue":{scripts:{"entry.js":t},styles:{"tuffex.css":o},preload:{"shared.js":e,"tuffex.css":o},prefetch:{}}',
      '},entrypoints:["pages/dashboard/overview.vue"],modules:{"pages/dashboard/overview.vue":["shared.js"]}};var e,o,t;export{s as default};',
    ].join('')

    writeFileSync(manifestPath, rawManifest)

    const result = await trimPrecomputedClientManifest(workerRoot)
    expect(result).not.toBeNull()
    expect(result?.removedStaticAssets).toBe(1)
    expect(result?.removedPrefetchMaps).toBe(2)
    expect(result?.keptDependencies).toBe(2)

    const writtenSource = readFileSync(manifestPath, 'utf8')
    expect(writtenSource).not.toContain('prefetch:')
    expect(writtenSource).toContain('modules:{}')

    const reloaded = (await import(`${pathToFileURL(manifestPath).href}?verify=1`)).default
    expect(Object.keys(reloaded.dependencies).sort()).toEqual([
      'pages/dashboard/overview.vue',
      'pages/docs/[...slug].vue',
    ])
    expect(reloaded.entrypoints).toEqual(['pages/dashboard/overview.vue'])
    expect(reloaded.modules).toEqual({})
    expect(reloaded.dependencies['pages/dashboard/overview.vue']).toEqual({
      scripts: { 'entry.js': { resourceType: 'script', module: true, file: 'entry.js' } },
      styles: { 'tuffex.css': { resourceType: 'style', preload: true, file: 'tuffex.css' } },
      preload: {
        'shared.js': { resourceType: 'script', module: true, preload: true, file: 'shared.js' },
        'tuffex.css': { resourceType: 'style', preload: true, file: 'tuffex.css' },
      },
    })
    expect(reloaded.dependencies['pages/docs/[...slug].vue'].preload['shared.js']).toEqual({
      resourceType: 'script',
      module: true,
      preload: true,
      file: 'shared.js',
    })
  })

  it('deduplicates repeated leaf asset descriptors in serialized output', () => {
    const sharedStyle = { resourceType: 'style', preload: true, file: 'shared.css' }
    const result = serializePrecomputedClientManifest({
      entrypoints: ['entry.js'],
      dependencies: {
        'entry.js': { scripts: {}, styles: { 'shared.css': sharedStyle }, preload: { 'shared.css': sharedStyle } },
        'pages/index.vue': { scripts: {}, styles: { 'shared.css': sharedStyle }, preload: { 'shared.css': sharedStyle } },
      },
    })

    expect(result.source).toMatch(/^const _a=\{/)
    expect(result.source.match(/"file":"shared\.css"/g)).toHaveLength(1)
  })

  it('keeps @talex-touch/tuffex/charts and GeoBubbleMap.client.vue behind import.meta.server-guarded async loaders', () => {
    const analyticsSource = readFileSync(join(nexusRoot, 'app/pages/admin/analytics.vue'), 'utf8')
    expect(analyticsSource).not.toMatch(/^import\s+\{[^}]+\}\s+from\s+['"]@talex-touch\/tuffex\/charts['"]/m)
    expect(analyticsSource).toContain("import('@talex-touch/tuffex/charts')")
    expect(analyticsSource).toContain('if (import.meta.server)')

    for (const relPath of ['app/pages/dashboard/overview.vue', 'app/pages/dashboard/devices.vue']) {
      const pageSource = readFileSync(join(nexusRoot, relPath), 'utf8')
      expect(pageSource).toContain('import.meta.server')
      expect(pageSource).toContain("import('~/components/dashboard/GeoBubbleMap.client.vue')")
    }
  })
})
