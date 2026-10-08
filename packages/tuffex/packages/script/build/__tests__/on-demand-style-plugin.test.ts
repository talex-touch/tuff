import type { Rollup } from 'vite'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { build, normalizePath } from 'vite'
import { describe, expect, it } from 'vitest'
import { expandStyleClosure, tuffexOnDemandStylePlugin } from '../on-demand-style-plugin'

const styleDeps = {
  'progress-bar': ['tooltip', 'spinner'],
  'tooltip': ['base-anchor'],
  'base-anchor': ['base-surface'],
  'dialog': ['base-surface'],
}

const execFileAsync = promisify(execFile)
const progressStyles = ['base-anchor', 'base-surface', 'progress-bar', 'spinner', 'tooltip']
const allStyles = ['base-anchor', 'base-surface', 'dialog', 'progress-bar', 'spinner', 'tooltip']
const componentExports: Record<string, string> = {
  'base-surface': 'TxBaseSurface',
  'base-anchor': 'TxBaseAnchor',
  'tooltip': 'TxTooltip',
  'spinner': 'TxSpinner',
  'progress-bar': 'TxProgressBar',
  'dialog': 'TxDialog',
  'ghost': 'TxGhost',
}

type Mode = 'generic' | 'componentDistRoot'

interface Snapshot {
  components: string[]
  styles: string[]
  value?: string
}

interface BuiltObservation {
  snapshots: Snapshot[]
  emittedStyles: string[]
}

// Execute the emitted ES modules, not the transform's source text. The child
// process isolates the browser preload boundary from Vitest's global state.
// Its link adapter reads actual CSS assets; it does not fake component imports.
const observeBuiltModules = String.raw`
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const { outDir, entry, initialCss, actions } = JSON.parse(process.argv[1]);
const links = initialCss.map(file => ({
  href: pathToFileURL(join(outDir, file)).href,
  rel: 'stylesheet',
}));
globalThis.__fixtureComponents = [];
globalThis.document = {
  createElement() {
    return {
      relList: { supports: () => true },
      setAttribute() {},
      addEventListener(event, callback) {
        if (event === 'load') queueMicrotask(callback);
      },
    };
  },
  getElementsByTagName: () => links,
  querySelector(selector) {
    const href = /link\[href="([^"]+)"\]/.exec(selector)?.[1];
    return href ? links.find(link => link.href === href
      && (!selector.includes('stylesheet') || link.rel === 'stylesheet')) : null;
  },
  head: { appendChild: link => links.push(link) },
};
globalThis.window = { dispatchEvent() {} };

async function snapshot(value) {
  const css = await Promise.all(links.filter(link => link.rel === 'stylesheet')
    .map(link => readFile(new URL(link.href), 'utf8')));
  return {
    components: [...globalThis.__fixtureComponents].sort(),
    styles: css.flatMap(text => [...text.matchAll(/\.fixture-([a-z0-9-]+)\s*\{/g)]
      .map(match => match[1])).sort(),
    value,
  };
}

const module = await import(pathToFileURL(join(outDir, entry)).href);
const snapshots = [await snapshot(module.initial)];
for (const action of actions) {
  const activated = await module[action]();
  snapshots.push(await snapshot(activated.default));
}
process.stdout.write(JSON.stringify(snapshots));
`

async function buildFixture(
  mode: Mode,
  source: string,
  actions: string[],
  progressEntryExtra = '',
): Promise<BuiltObservation> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'tuffex-lazy-style-'))
  try {
    // Vite resolves symlinks before assigning module IDs (/tmp is /private/tmp
    // on macOS). Canonicalize all fixture paths, including componentDistRoot.
    const root = await realpath(fixtureRoot)
    const packageRoot = join(root, 'node_modules/@talex-touch/tuffex')
    const componentDistRoot = join(packageRoot, 'dist/es')
    const entry = join(root, '.nuxt/components.plugin.ts')
    const outDir = join(root, 'output')
    await mkdir(dirname(entry), { recursive: true })
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: '@talex-touch/tuffex',
      type: 'module',
      exports: {
        './*/style.css': './dist/es/*/style.css',
        './*': './dist/es/*/index.js',
      },
    }))
    for (const [name, exported] of Object.entries(componentExports)) {
      const directory = join(componentDistRoot, name)
      await mkdir(directory, { recursive: true })
      const dependencies = styleDeps[name as keyof typeof styleDeps] ?? []
      await writeFile(join(directory, 'index.js'), [
        ...dependencies.map(dependency => `import '../${dependency}/index.js';`),
        `globalThis.__fixtureComponents.push('${name}');`,
        `export const ${exported} = '${name}';`,
        `export default ${exported};`,
        name === 'progress-bar' ? progressEntryExtra : '',
      ].join('\n'))
      await writeFile(join(directory, 'style.css'), `.fixture-${name} { --fixture-${name}: 1; }`)
    }
    await writeFile(entry, source)
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: './',
      plugins: [tuffexOnDemandStylePlugin({
        styleDeps,
        ...(mode === 'componentDistRoot' ? { componentDistRoot } : {}),
      })],
      build: {
        outDir,
        write: true,
        minify: false,
        cssMinify: false,
        cssCodeSplit: true,
        modulePreload: { polyfill: false },
        rollupOptions: { input: entry, preserveEntrySignatures: 'strict' },
      },
    }) as Rollup.RollupOutput
    const chunks = result.output.filter((output): output is Rollup.OutputChunk => output.type === 'chunk')
    const entryChunk = chunks.find(chunk => chunk.isEntry && chunk.facadeModuleId === normalizePath(entry))
    if (!entryChunk)
      throw new Error('Vite did not emit the fixture entry')

    // A browser initially loads only CSS attached to the entry's static output
    // graph. Dynamic CSS is observed through Vite's emitted preload runtime.
    const initialCss = new Set<string>()
    const visited = new Set<string>()
    function visitStaticChunk(chunk: Rollup.OutputChunk) {
      if (visited.has(chunk.fileName))
        return
      visited.add(chunk.fileName)
      const metadata = (chunk as Rollup.OutputChunk & {
        viteMetadata?: { importedCss: Set<string> }
      }).viteMetadata
      for (const file of metadata?.importedCss ?? [])
        initialCss.add(file)
      for (const file of chunk.imports) {
        const dependency = chunks.find(candidate => candidate.fileName === file)
        if (!dependency)
          throw new Error(`Missing emitted static chunk: ${file}`)
        visitStaticChunk(dependency)
      }
    }
    visitStaticChunk(entryChunk)
    const emittedStyles = result.output.flatMap((output) => {
      if (output.type !== 'asset' || !output.fileName.endsWith('.css'))
        return []
      const css = typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8')
      return [...css.matchAll(/\.fixture-([a-z0-9-]+)\s*\{/g)].map(match => match[1]!)
    }).sort()
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      observeBuiltModules,
      JSON.stringify({ outDir, entry: entryChunk.fileName, initialCss: [...initialCss], actions }),
    ], { encoding: 'utf8' })
    return { snapshots: JSON.parse(stdout), emittedStyles }
  }
  finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

describe('expandStyleClosure', () => {
  it('lists dependencies before the component that leans on them', () => {
    // Post-order, so a component's own rules land later in the cascade and win
    // against what it builds on.
    expect(expandStyleClosure(['progress-bar'], styleDeps)).toEqual([
      'base-surface',
      'base-anchor',
      'tooltip',
      'spinner',
      'progress-bar',
    ])
  })

  it('names a shared dependency once across several components', () => {
    // base-surface is reached through both progress-bar and dialog; emitting it
    // twice is exactly the duplication this replaced.
    const ordered = expandStyleClosure(['progress-bar', 'dialog'], styleDeps)

    expect(ordered.filter(name => name === 'base-surface')).toHaveLength(1)
    expect(ordered.indexOf('base-surface')).toBeLessThan(ordered.indexOf('dialog'))
    expect(new Set(ordered).size).toBe(ordered.length)
  })

  it('survives a cycle instead of recursing forever', () => {
    const cyclic = { a: ['b'], b: ['c'], c: ['a'] }

    const ordered = expandStyleClosure(['a'], cyclic)
    expect(ordered).toHaveLength(3)
    expect(new Set(ordered)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('passes through a component the graph says nothing about', () => {
    expect(expandStyleClosure(['unknown'], styleDeps)).toEqual(['unknown'])
  })
})

// Intentional dynamic imports exercise lazy loading: static imports would erase
// the first-screen versus activation boundary these output contracts defend.
describe.each<Mode>(['generic', 'componentDistRoot'])('Vite lazy stylesheet graph (%s)', (mode) => {
  it('keeps a generated registry cold and loads each activated component with its complete style closure', async () => {
    const { snapshots, emittedStyles } = await buildFixture(mode, [
      `import type { TxGhost } from '@talex-touch/tuffex/ghost'`,
      `export type Ghost = typeof TxGhost`,
      `/*! import { TxGhost } from '@talex-touch/tuffex/ghost'; */`,
      `export const importText = "import('@talex-touch/tuffex/ghost')"`,
      `export const loadProgress = () => import('@talex-touch/tuffex/progress-bar')`,
      `export const loadDialog = () => import('@talex-touch/tuffex/dialog')`,
    ].join('\n'), ['loadProgress', 'loadDialog'])

    expect(snapshots[0]).toEqual({ components: [], styles: [] })
    expect(snapshots[1]).toEqual({ components: progressStyles, styles: progressStyles, value: 'progress-bar' })
    expect(snapshots[2]).toEqual({ components: allStyles, styles: allStyles, value: 'dialog' })
    expect(emittedStyles).toEqual(allStyles)
  })

  it('deduplicates a shared static dependency without eagerly loading the dynamic component closure', async () => {
    const { snapshots, emittedStyles } = await buildFixture(mode, [
      `import { TxDialog } from '@talex-touch/tuffex/dialog'`,
      `import '@talex-touch/tuffex/tooltip/style.css'`,
      `export const initial = TxDialog`,
      `export const loadProgress = () => import('@talex-touch/tuffex/progress-bar')`,
    ].join('\n'), ['loadProgress'])

    expect(snapshots[0]).toEqual({
      components: ['base-surface', 'dialog'],
      styles: ['base-surface', 'dialog', 'tooltip'],
      value: 'dialog',
    })
    expect(snapshots[1]).toEqual({ components: allStyles, styles: allStyles, value: 'progress-bar' })
    // Exact rule multiplicity catches duplication across emitted CSS files as
    // well as repeated links when the lazy branch joins the static graph.
    expect(emittedStyles).toEqual(allStyles)
  })

  it('does not confuse type-only imports or CSS-looking strings and comments with real stylesheet edges', async () => {
    const stylesheetImpostors = [
      `export const styleText = '@talex-touch/tuffex/base-surface/style.css'`,
      `/*! import '@talex-touch/tuffex/base-anchor/style.css'; */`,
    ].join('\n')
    const { snapshots, emittedStyles } = await buildFixture(mode, [
      `import type { TxGhost } from '@talex-touch/tuffex/ghost'`,
      `export type Ghost = typeof TxGhost`,
      `import '@talex-touch/tuffex/tooltip/style.css'`,
      `import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'`,
      `export const initial = TxProgressBar`,
      stylesheetImpostors,
    ].join('\n'), [], stylesheetImpostors)

    expect(snapshots).toEqual([{
      components: progressStyles,
      styles: progressStyles,
      value: 'progress-bar',
    }])
    expect(emittedStyles).toEqual(progressStyles)
  })
})
