import { existsSync, readFileSync } from 'node:fs'
import { readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

type ComponentStyleOutput = {
  type: 'asset' | 'chunk'
  fileName?: string
  source?: unknown
  isEntry?: boolean
  name?: string
  imports?: string[]
  modules?: Record<string, unknown>
  viteMetadata?: {
    importedCss?: Iterable<unknown>
  }
}

type ComponentStyleBuildResult = {
  output: ComponentStyleOutput[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rootPath = resolve(__dirname, '../../..')
const componentRoot = resolve(rootPath, 'packages/components')
const componentSrcRoot = resolve(componentRoot, 'src')
const distPath = resolve(rootPath, 'dist')
const tempOutDir = resolve(rootPath, '.style-build')
const packageJson = JSON.parse(readFileSync(resolve(rootPath, 'package.json'), 'utf-8'))
const emptyStateStyleAliases = new Set([
  'blank-slate',
  'empty',
  'error-state',
  'guide-state',
  'loading-state',
  'no-data',
  'no-selection',
  'offline-state',
  'permission-state',
  'search-empty',
])

const externalDeps = Array.from(
  new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]),
)

async function getComponentEntries() {
  const dirents = await readdir(componentSrcRoot, { withFileTypes: true })
  const entries: Record<string, string> = {}

  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name === 'utils')
      continue
    // Not every directory under src/ is a component — a shared __tests__ folder
    // has no index.ts, and listing it as an entry fails the whole build with an
    // unresolved-entry error. Mirrors the same guard in components/vite.config.js.
    const entry = resolve(componentSrcRoot, dirent.name, 'index.ts')
    if (!existsSync(entry))
      continue
    entries[dirent.name] = entry
  }

  return entries
}

export interface ComponentStyleParts {
  /** CSS produced by this component's own SFCs. */
  own: string[]
  /** Sibling components whose stylesheets this one needs, as directory names. */
  deps: string[]
}

/**
 * Which component a chunk's code came from, read off the source paths in
 * `src/<component>/…`. Verified against the real build: of the 139 chunks that
 * carry CSS, none mixes modules from two components, so a chunk's stylesheet
 * always belongs to exactly one of them.
 */
function chunkOwner(chunk: ComponentStyleOutput, componentNames: Set<string>): string | null {
  for (const moduleId of Object.keys(chunk.modules ?? {})) {
    const marker = moduleId.indexOf('/src/')
    if (marker < 0)
      continue
    const name = moduleId.slice(marker + '/src/'.length).split('/')[0]
    if (name && componentNames.has(name))
      return name
  }
  return null
}

/**
 * Splits every entry's stylesheet into the rules the component itself owns and
 * the siblings it leans on.
 *
 * Inlining the whole dependency graph is what made these files enormous: the
 * base-surface rules were copied into 26 packages and the spinner's into 29,
 * so the 151 stylesheets came to 2.2 MiB of which 68% was the same bytes over
 * and over. Each stylesheet now carries only its own rules, and the graph is
 * published beside them as `style-deps.json` for the on-demand plugin to walk.
 *
 * The dependencies are deliberately *not* written as `@import`s. A bundler
 * resolves those within one CSS module graph but not across two separate JS
 * imports of two stylesheets, so five components importing base-surface still
 * inlined it five times. Independent `import` statements are the thing that
 * dedupes, because a module graph loads one path exactly once.
 */
export function collectCssAssets(result: Awaited<ReturnType<typeof build>>, componentNames: Set<string>) {
  const buildResult = result as ComponentStyleBuildResult | ComponentStyleBuildResult[]
  const outputs = Array.isArray(buildResult) ? buildResult.flatMap(item => item.output) : buildResult.output
  const cssAssets = new Map<string, string>()
  const chunks = new Map<string, ComponentStyleOutput>()
  const entryCss = new Map<string, ComponentStyleParts>()

  for (const output of outputs) {
    if (output.type === 'asset' && output.fileName?.endsWith('.css')) {
      cssAssets.set(output.fileName, String(output.source))
    }
    if (output.type === 'chunk' && output.fileName) {
      chunks.set(output.fileName, output)
    }
  }

  /**
   * `seenCss` is keyed on the emitted asset, not the chunk that pulled it in.
   * Two chunks inside one component can import the same stylesheet — the
   * vendored `github-markdown.css` reaches `stream-markdown` through both its
   * index and its block renderers — and walking by chunk alone appended the
   * whole sheet twice: 628 scoped selectors in a file that has 314, ~44 KiB of
   * exact duplicate in one on-demand stylesheet.
   */
  function cssOf(chunk: ComponentStyleOutput, seenCss: Set<string>): string[] {
    return Array.from(chunk.viteMetadata?.importedCss ?? [])
      .filter((fileName): fileName is string => typeof fileName === 'string')
      .filter((fileName) => {
        if (seenCss.has(fileName))
          return false
        seenCss.add(fileName)
        return true
      })
      .map(fileName => cssAssets.get(fileName))
      .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
  }

  function walk(
    componentName: string,
    fileName: string,
    own: string[],
    deps: Set<string>,
    visited: Set<string>,
    seenCss: Set<string>,
  ) {
    if (visited.has(fileName))
      return
    visited.add(fileName)

    const chunk = chunks.get(fileName)
    if (!chunk)
      return

    const owner = chunkOwner(chunk, componentNames)
    if (owner && owner !== componentName) {
      // Someone else's code. Record the dependency and stop: that component's
      // own stylesheet already carries these rules, and its own imports.
      deps.add(owner)
      return
    }

    own.push(...cssOf(chunk, seenCss))
    for (const importedFileName of chunk.imports ?? [])
      walk(componentName, importedFileName, own, deps, visited, seenCss)
  }

  for (const output of outputs) {
    if (output.type !== 'chunk' || !output.isEntry || !output.fileName)
      continue
    if (typeof output.name !== 'string' || output.name.length === 0)
      continue

    const own: string[] = []
    const deps = new Set<string>()
    walk(output.name, output.fileName, own, deps, new Set(), new Set())
    entryCss.set(output.name, { own, deps: [...deps].sort() })
  }

  return entryCss
}

async function writeComponentStyle(componentName: string, parts: ComponentStyleParts) {
  // `@charset` is only read as the very first thing in a file, and each SFC's
  // CSS arrives carrying its own. Concatenating them left one at the top and
  // the rest stranded mid-file; hoisting a single declaration keeps the one
  // that counts and drops the copies.
  const CHARSET_RE = /@charset\s+"[^"]*";\s*/gi
  const ownParts = parts.own.map(part => part.replace(CHARSET_RE, '').trim()).filter(part => part.length > 0)
  const needsCharset = parts.own.some(part => CHARSET_RE.test(part))
  CHARSET_RE.lastIndex = 0

  const body = ownParts.join('\n')

  // Alias packages re-export another component wholesale and add nothing of
  // their own; the dependency graph carries them to the real stylesheet.
  const style = emptyStateStyleAliases.has(componentName)
    ? ''
    : needsCharset && body.length > 0 ? `@charset "UTF-8";\n${body}` : body

  await Promise.all([
    mkdir(resolve(distPath, 'es', componentName), { recursive: true }),
    mkdir(resolve(distPath, 'lib', componentName), { recursive: true }),
  ])

  await Promise.all([
    writeFile(resolve(distPath, 'es', componentName, 'style.css'), style),
    writeFile(resolve(distPath, 'lib', componentName, 'style.css'), style),
  ])
}

export async function buildComponentStyles() {
  const entries = await getComponentEntries()
  await rm(tempOutDir, { recursive: true, force: true })

  const result = await build({
    configFile: false,
    root: componentRoot,
    logLevel: 'warn',
    build: {
      target: 'esnext',
      outDir: tempOutDir,
      emptyOutDir: true,
      minify: false,
      // Same reasoning as the component build: the JS here is thrown away, the
      // CSS is what ships.
      cssMinify: true,
      cssCodeSplit: true,
      write: false,
      rollupOptions: {
        external: externalDeps,
        input: entries,
        output: {
          exports: 'named',
          format: 'es',
          entryFileNames: '[name].js',
        },
      },
    },
    plugins: [vue()],
  })

  const componentNames = new Set(Object.keys(entries))
  const entryCss = collectCssAssets(result, componentNames)

  const styleDeps: Record<string, string[]> = {}
  for (const componentName of Object.keys(entries).sort()) {
    const parts = entryCss.get(componentName) ?? { own: [], deps: [] }
    const deps = emptyStateStyleAliases.has(componentName) ? ['empty-state'] : parts.deps
    if (deps.length > 0)
      styleDeps[componentName] = deps
  }

  await Promise.all([
    ...Object.entries(entries).map(([componentName]) =>
      writeComponentStyle(componentName, entryCss.get(componentName) ?? { own: [], deps: [] }),
    ),
    // Published beside the stylesheets: the on-demand plugin walks this to turn
    // one component import into the full set of stylesheets it needs.
    ...['es', 'lib'].map(dir =>
      writeFile(resolve(distPath, dir, 'style-deps.json'), `${JSON.stringify(styleDeps, null, 2)}\n`),
    ),
  ])

  await rm(tempOutDir, { recursive: true, force: true })
}

export default buildComponentStyles
