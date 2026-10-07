import type { Manifest } from 'vite'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { nexusDemoLoadersPlugin } from './nexus-demo-loaders'

const execFileAsync = promisify(execFile)

interface Snapshot {
  startup: string
  modules: string[]
  styles: string[]
  implementations: string[]
  value?: { kind: string, dependency: string, payload: number }
}

// Observe files actually loaded by Node, not loader names or manifest flags.
// Rollup's module ownership maps those files back to the fixture implementations,
// including side-effect-free demos whose accidental download is otherwise silent.
const observeLoadedChunks = String.raw`
import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

let outDir;
let logFile;
export function initialize(data) {
  ({ outDir, logFile } = data);
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:')) {
    const file = relative(outDir, fileURLToPath(url));
    if (!file.startsWith('..')) appendFileSync(logFile, JSON.stringify(file) + '\n');
  }
  return result;
}
`

// Dynamic imports intentionally exercise the emitted loading boundary. The
// selected loader URL is a runtime input; a static import cannot model it.
// Only the browser link boundary is adapted, in an isolated child process.
// Component code, Vite's preload runtime, and the read CSS assets are real output.
const observeDemo = String.raw`
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { outDir, startupScripts, startupCss, loader, hookFile, logFile, implementations } = JSON.parse(process.argv[1]);
register(pathToFileURL(hookFile), { data: { outDir, logFile } });
const links = startupCss.map(file => ({
  href: pathToFileURL(join(outDir, file)).href,
  rel: 'stylesheet',
}));

globalThis.__fixtureModules = [];
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
  const loadedFiles = (await readFile(logFile, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  return {
    startup: globalThis.__fixtureStartup,
    modules: [...globalThis.__fixtureModules].sort(),
    implementations: [...new Set(loadedFiles.flatMap(file => implementations[file] ?? []))].sort(),
    styles: css.flatMap(text => [...text.matchAll(/\.fixture-([a-z0-9-]+)\s*\{/g)]
      .map(match => match[1])).sort(),
    value,
  };
}

for (const script of startupScripts) {
  await import(pathToFileURL(join(outDir, script)).href);
}
const snapshots = [await snapshot()];
const selected = await import(pathToFileURL(join(outDir, loader)).href);
snapshots.push(await snapshot());
const demo = await selected.default();
snapshots.push(await snapshot(demo.default));
process.stdout.write(JSON.stringify(snapshots));
`

describe('nexusDemoLoadersPlugin production manifest', () => {
  it('keeps small demo implementations out of startup and unrelated activations when chunk merging is enabled', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'nexus-demo-manifest-'))
    try {
      // Vite assigns canonical module IDs; /tmp is a symlink on macOS.
      const root = await realpath(fixtureRoot)
      const contentRoot = join(root, 'app/components/content')
      const demoRoot = join(contentRoot, 'demos')
      const outDir = join(root, 'output')
      const loaderBase = '/_nuxt/demos/test-release/'
      const hookFile = join(root, 'observe-loaded-chunks.mjs')
      await writeFile(hookFile, observeLoadedChunks)
      await mkdir(demoRoot, { recursive: true })
      await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
      await writeFile(join(root, 'index.html'), '<html><head></head><body><script type="module" src="/main.ts"></script></body></html>')
      await writeFile(join(root, 'main.ts'), [
        `import { startApplication } from './app-shell'`,
        `globalThis.__fixtureStartup = startApplication()`,
      ].join('\n'))
      await writeFile(join(root, 'app-shell.ts'), [
        `import { dependency } from './app/components/content/shared'`,
        `import './app.css'`,
        `export const startApplication = () => 'application-ready:' + dependency`,
      ].join('\n'))
      await writeFile(join(root, 'app.css'), '.fixture-app { --fixture-app: 1; }')
      await writeFile(join(contentRoot, 'demo-registry.ts'), [
        'export const demoRegistry = {',
        `  ButtonAlias: () => import('./demos/ActualButton.ts'),`,
        `  ChartAlias: () => import('./demos/DifferentChart.ts'),`,
        `  SpinnerAlias: () => import('./demos/SilentSpinner.ts'),`,
        '}',
      ].join('\n'))
      await writeFile(join(contentRoot, 'shared.ts'), [
        `import './shared.css'`,
        `globalThis.__fixtureModules.push('shared')`,
        `export const dependency = 'shared-dependency'`,
      ].join('\n'))
      await writeFile(join(contentRoot, 'shared.css'), '.fixture-shared { --fixture-shared: 1; }')
      const demos = [
        { alias: 'ButtonAlias', file: 'ActualButton.ts', kind: 'button', payload: 7, effect: true },
        { alias: 'ChartAlias', file: 'DifferentChart.ts', kind: 'chart', payload: 42, effect: true },
        { alias: 'SpinnerAlias', file: 'SilentSpinner.ts', kind: 'spinner', payload: 3, effect: false },
      ]
      for (const demo of demos) {
        await writeFile(join(demoRoot, demo.file), [
          `import { dependency } from '../shared'`,
          `import './${demo.kind}.css'`,
          ...(demo.effect ? [`globalThis.__fixtureModules.push('${demo.kind}')`] : []),
          `export default { kind: '${demo.kind}', dependency, payload: ${demo.payload} }`,
        ].join('\n'))
        await writeFile(join(demoRoot, `${demo.kind}.css`), `.fixture-${demo.kind} { --fixture-${demo.kind}: 1; }`)
      }
      const implementations: Record<string, string[]> = {}
      await build({
        root,
        configFile: false,
        logLevel: 'silent',
        base: './',
        plugins: [
          nexusDemoLoadersPlugin(root, loaderBase),
          {
            name: 'fixture-emitted-demo-ownership',
            generateBundle(_options, bundle) {
              for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk')
                  continue
                implementations[chunk.fileName] = demos
                  .filter(demo => Object.hasOwn(chunk.modules, join(demoRoot, demo.file)))
                  .map(demo => demo.kind)
              }
            },
          },
        ],
        build: {
          outDir,
          manifest: true,
          minify: false,
          cssMinify: false,
          cssCodeSplit: true,
          modulePreload: { polyfill: false },
          rollupOptions: {
            input: join(root, 'index.html'),
            output: { experimentalMinChunkSize: 4096 },
          },
        },
      })
      const manifest = JSON.parse(await readFile(join(outDir, '.vite/manifest.json'), 'utf8')) as Manifest
      const application = manifest['index.html']
      if (!application)
        throw new Error('Production manifest is missing the application entry')

      // Consume the real production manifest the way a startup script planner
      // does: every entry and its static imports contribute scripts/CSS. Do not
      // filter demo filenames here; that would hide the emitFile isEntry bug.
      const startupScripts = new Set<string>()
      const startupCss = new Set<string>()
      const visited = new Set<string>()
      function visitStartup(key: string) {
        if (visited.has(key))
          return
        visited.add(key)
        const asset = manifest[key]
        if (!asset)
          throw new Error(`Manifest references an unknown startup module: ${key}`)
        startupScripts.add(asset.file)
        for (const file of asset.css ?? [])
          startupCss.add(file)
        for (const imported of asset.imports ?? [])
          visitStartup(imported)
      }
      for (const [key, asset] of Object.entries(manifest)) {
        if (asset.isEntry)
          visitStartup(key)
      }

      // Each child starts cold. Observe both module effects and the actual loaded
      // implementation code: a pure, unselected demo must not hitchhike either.
      for (const demo of demos) {
        const loader = `${loaderBase.replace(/^\/+/, '')}${demo.alias}.js`
        const logFile = join(root, `${demo.alias}-loaded-chunks.jsonl`)
        await writeFile(logFile, '')
        const { stdout } = await execFileAsync(process.execPath, [
          '--input-type=module',
          '--eval',
          observeDemo,
          JSON.stringify({
            outDir,
            startupScripts: [...startupScripts],
            startupCss: [...startupCss],
            loader,
            hookFile,
            logFile,
            implementations,
          }),
        ], { encoding: 'utf8' })
        const snapshots = JSON.parse(stdout) as Snapshot[]
        const cold = {
          startup: 'application-ready:shared-dependency',
          modules: ['shared'],
          implementations: [],
          styles: ['app', 'shared'],
        }
        expect(snapshots, demo.alias).toEqual([
          cold,
          cold,
          {
            startup: 'application-ready:shared-dependency',
            modules: [...(demo.effect ? [demo.kind] : []), 'shared'].sort(),
            implementations: [demo.kind],
            styles: ['app', demo.kind, 'shared'].sort(),
            value: { kind: demo.kind, dependency: 'shared-dependency', payload: demo.payload },
          },
        ])
      }
    }
    finally {
      await rm(fixtureRoot, { recursive: true, force: true })
    }
  })
})
