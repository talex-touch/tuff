import type { Rollup } from 'vite'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { build, normalizePath, parseAst } from 'vite'
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

interface Fixture {
  /** Appended to a component's built entry. */
  entryExtras?: Partial<Record<string, string>>
  /** More built files, by their path under `dist/es`. */
  files?: Record<string, string>
  lazyStyleDeps?: Record<string, string[]>
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
  fixture: Fixture = {},
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
        fixture.entryExtras?.[name] ?? '',
      ].join('\n'))
      await writeFile(join(directory, 'style.css'), `.fixture-${name} { --fixture-${name}: 1; }`)
    }
    for (const [path, code] of Object.entries(fixture.files ?? {})) {
      await mkdir(dirname(join(componentDistRoot, path)), { recursive: true })
      await writeFile(join(componentDistRoot, path), code)
    }
    await writeFile(entry, source)
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      base: './',
      plugins: [tuffexOnDemandStylePlugin({
        styleDeps,
        lazyStyleDeps: fixture.lazyStyleDeps,
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
    ].join('\n'), [], { entryExtras: { 'progress-bar': stylesheetImpostors } })

    expect(snapshots).toEqual([{
      components: progressStyles,
      styles: progressStyles,
      value: 'progress-bar',
    }])
    expect(emittedStyles).toEqual(progressStyles)
  })

  it('brings the complete style closure of a sibling a built component loads on first use, and only then', async () => {
    // The shape TxImageGallery ships: a file under the entry's src/ that reaches the sibling's
    // built entry by relative path. The lazy table names the edge, as the published one does,
    // and a build must not act on it up front.
    const { snapshots, emittedStyles } = await buildFixture(mode, [
      `import { TxDialog, loadProgress, loadRuntime } from '@talex-touch/tuffex/dialog'`,
      `export const initial = TxDialog`,
      `export const openRuntime = () => loadRuntime()`,
      `export const openProgress = () => loadProgress()`,
    ].join('\n'), ['openRuntime', 'openProgress'], {
      entryExtras: { dialog: `export * from './src/TxDialog.vue.js';` },
      files: {
        'dialog/src/TxDialog.vue.js': [
          `export const loadProgress = () => import('../../progress-bar/index.js');`,
          // The component's own code, loaded later: no sibling's stylesheets come with it.
          `export const loadRuntime = () => import('./runtime.js');`,
        ].join('\n'),
        'dialog/src/runtime.js': `export default 'runtime';`,
      },
      lazyStyleDeps: { dialog: ['progress-bar'] },
    })

    const dialogStyles = ['base-surface', 'dialog']
    expect(snapshots[0]).toEqual({ components: dialogStyles, styles: dialogStyles, value: 'dialog' })
    expect(snapshots[1]).toEqual({ components: dialogStyles, styles: dialogStyles, value: 'runtime' })
    // Resolving to the sibling's module, not to whatever its stylesheets were loaded alongside.
    expect(snapshots[2]).toEqual({ components: allStyles, styles: allStyles, value: 'progress-bar' })
    // base-surface is already on the page; the sibling's closure must not bring a second copy.
    expect(emittedStyles).toEqual(allStyles)
  })
})

/** A hook as this plugin defines it: a plain function, never Vite's `{ handler }` form. */
function hookOf<T>(hook: T | { handler: T } | undefined): T {
  if (typeof hook !== 'function')
    throw new Error('Expected the hook as a plain function')
  return hook
}

describe('style imports on a dev server', () => {
  // A dialog that loads progress-bar on first use, which loads ghost on first use in turn.
  const lazyStyleDeps = { 'dialog': ['progress-bar'], 'progress-bar': ['ghost'] }
  const source = `import { TxDialog } from '@talex-touch/tuffex/dialog'\nexport default TxDialog`

  function injectedStyles(command: 'build' | 'serve'): string[] {
    const plugin = tuffexOnDemandStylePlugin({ styleDeps, lazyStyleDeps })
    hookOf(plugin.configResolved).call({} as never, { command } as never)
    const result = hookOf(plugin.transform)
      .call({ parse: parseAst } as never, source, '/app/src/main.ts') as { code: string } | null
    return [...(result?.code ?? '').matchAll(/^import '@talex-touch\/tuffex\/([a-z0-9-]+)\/style\.css';$/gm)]
      .map(match => match[1]!)
  }

  it('puts what a component loads on first use on the page with it, transitively, after its own closure', () => {
    // Pre-bundled dependencies are out of reach of the hand-off a build makes to the sibling's
    // import, so the sibling's stylesheets have to be there before the sibling is.
    expect(injectedStyles('serve')).toEqual([
      'base-surface',
      'dialog',
      'base-anchor',
      'tooltip',
      'spinner',
      'progress-bar',
      'ghost',
    ])
  })

  it('leaves them to the sibling\'s own import in a build', () => {
    expect(injectedStyles('build')).toEqual(['base-surface', 'dialog'])
  })

  it('marks transformed dist component barrels with moduleSideEffects: true so Rolldown preserves injected CSS under sideEffects: ["**/*.css", "**/*.scss"]', () => {
    const plugin = tuffexOnDemandStylePlugin({
      styleDeps,
      componentDistRoot: '/pkg/dist/es',
    })
    hookOf(plugin.configResolved).call({} as never, { command: 'build' } as never)
    const barrelCode = `import TxDialog from './src/TxDialog.vue.js';\nexport { TxDialog };`
    const result = hookOf(plugin.transform)
      .call({ parse: parseAst } as never, barrelCode, '/pkg/dist/es/dialog/index.js') as {
        code: string
        moduleSideEffects?: boolean
      } | null

    expect(result).not.toBeNull()
    expect(result?.moduleSideEffects).toBe(true)
    expect(result?.code).toContain(`import '../base-surface/style.css';`)
    expect(result?.code).toContain(`import './style.css';`)
  })

  it('injects the charts stylesheet for deep @talex-touch/tuffex/charts/src/* static, dynamic, and dist imports', () => {
    const plugin = tuffexOnDemandStylePlugin({ styleDeps })
    hookOf(plugin.configResolved).call({} as never, { command: 'build' } as never)

    const staticResult = hookOf(plugin.transform).call(
      { parse: parseAst } as never,
      `import { TxChoroplethMap } from '@talex-touch/tuffex/charts/src/maps'\nexport default TxChoroplethMap`,
      '/app/src/MapView.vue',
    ) as { code: string, moduleSideEffects?: boolean } | null
    expect(staticResult?.code).toContain(`import '@talex-touch/tuffex/charts/style.css';`)
    expect(staticResult?.moduleSideEffects).toBe(true)

    const dynamicResult = hookOf(plugin.transform).call(
      { parse: parseAst } as never,
      `export const load = () => import('@talex-touch/tuffex/charts/src/echart')`,
      '/app/src/EChartView.vue',
    ) as { code: string } | null
    expect(dynamicResult?.code).toContain(`import('@talex-touch/tuffex/charts/style.css')`)

    const distPlugin = tuffexOnDemandStylePlugin({
      styleDeps,
      componentDistRoot: '/pkg/dist/es',
    })
    hookOf(distPlugin.configResolved).call({} as never, { command: 'build' } as never)
    const distResult = hookOf(distPlugin.transform).call(
      { parse: parseAst } as never,
      `import TxChoroplethMap from './src/TxChoroplethMap.vue.js';\nexport { TxChoroplethMap };`,
      '/pkg/dist/es/charts/src/maps/index.js',
    ) as { code: string, moduleSideEffects?: boolean } | null
    expect(distResult?.moduleSideEffects).toBe(true)
    expect(distResult?.code).toContain(`import '../../style.css';`)
  })
})
