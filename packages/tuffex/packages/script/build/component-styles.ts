import { readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
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
    entries[dirent.name] = resolve(componentSrcRoot, dirent.name, 'index.ts')
  }

  return entries
}

function collectCssAssets(result: Awaited<ReturnType<typeof build>>) {
  const buildResult = result as ComponentStyleBuildResult | ComponentStyleBuildResult[]
  const outputs = Array.isArray(buildResult) ? buildResult.flatMap(item => item.output) : buildResult.output
  const cssAssets = new Map<string, string>()
  const chunks = new Map<string, ComponentStyleOutput>()
  const entryCss = new Map<string, string[]>()

  for (const output of outputs) {
    if (output.type === 'asset' && output.fileName?.endsWith('.css')) {
      cssAssets.set(output.fileName, String(output.source))
    }
    if (output.type === 'chunk' && output.fileName) {
      chunks.set(output.fileName, output)
    }
  }

  function collectChunkCss(fileName: string, visited = new Set<string>()): string[] {
    if (visited.has(fileName))
      return []
    visited.add(fileName)

    const chunk = chunks.get(fileName)
    if (!chunk)
      return []

    const ownCss = Array.from(chunk.viteMetadata?.importedCss ?? [])
      .filter((fileName): fileName is string => typeof fileName === 'string')
      .map(fileName => cssAssets.get(fileName))
      .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)

    const importedCss = (chunk.imports ?? []).flatMap(importedFileName => collectChunkCss(importedFileName, visited))
    return [...ownCss, ...importedCss]
  }

  for (const output of outputs) {
    if (output.type !== 'chunk' || !output.isEntry || !output.fileName)
      continue
    if (typeof output.name !== 'string' || output.name.length === 0)
      continue

    entryCss.set(output.name, collectChunkCss(output.fileName))
  }

  return entryCss
}

async function writeComponentStyle(componentName: string, cssParts: string[]) {
  const style = emptyStateStyleAliases.has(componentName)
    ? '@import "../empty-state/style.css";\n'
    : cssParts.join('\n')

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

  const entryCss = collectCssAssets(result)
  await Promise.all(
    Object.entries(entries).map(([componentName]) =>
      writeComponentStyle(componentName, entryCss.get(componentName) ?? []),
    ),
  )

  await rm(tempOutDir, { recursive: true, force: true })
}

export default buildComponentStyles
