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
 * and over. A dependency is emitted as an `@import` of that component's own
 * stylesheet instead, which a bundler resolves once no matter how many
 * components ask for it.
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

  function cssOf(chunk: ComponentStyleOutput): string[] {
    return Array.from(chunk.viteMetadata?.importedCss ?? [])
      .filter((fileName): fileName is string => typeof fileName === 'string')
      .map(fileName => cssAssets.get(fileName))
      .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
  }

  function walk(componentName: string, fileName: string, own: string[], deps: Set<string>, visited: Set<string>) {
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

    own.push(...cssOf(chunk))
    for (const importedFileName of chunk.imports ?? [])
      walk(componentName, importedFileName, own, deps, visited)
  }

  for (const output of outputs) {
    if (output.type !== 'chunk' || !output.isEntry || !output.fileName)
      continue
    if (typeof output.name !== 'string' || output.name.length === 0)
      continue

    const own: string[] = []
    const deps = new Set<string>()
    walk(output.name, output.fileName, own, deps, new Set())
    entryCss.set(output.name, { own, deps: [...deps].sort() })
  }

  return entryCss
}

async function writeComponentStyle(componentName: string, parts: ComponentStyleParts) {
  // `@import` is only honoured before any rule, so the dependencies lead the
  // file. That also puts them lower in the cascade than the component's own
  // rules, which is the order a component would want anyway.
  const imports = parts.deps.map(dep => `@import "../${dep}/style.css";`).join('\n')

  // `@charset` is only read as the very first thing in a file, and each SFC's
  // CSS arrives carrying its own. Concatenating them left one at the top and
  // the rest stranded mid-file; hoisting a single declaration keeps the one
  // that counts and drops the copies.
  const CHARSET_RE = /@charset\s+"[^"]*";\s*/gi
  const ownParts = parts.own.map(part => part.replace(CHARSET_RE, '').trim()).filter(part => part.length > 0)
  const needsCharset = parts.own.some(part => CHARSET_RE.test(part))
  CHARSET_RE.lastIndex = 0

  const body = [imports, ownParts.join('\n')].filter(part => part.trim().length > 0).join('\n\n')

  const style = emptyStateStyleAliases.has(componentName)
    ? '@import "../empty-state/style.css";\n'
    : needsCharset ? `@charset "UTF-8";\n${body}` : body

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
  await Promise.all(
    Object.entries(entries).map(([componentName]) =>
      writeComponentStyle(componentName, entryCss.get(componentName) ?? { own: [], deps: [] }),
    ),
  )

  await rm(tempOutDir, { recursive: true, force: true })
}

export default buildComponentStyles
