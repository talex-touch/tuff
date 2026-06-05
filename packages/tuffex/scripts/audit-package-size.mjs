import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const repoRoot = resolve(root, '../..')
const distEs = resolve(root, 'dist/es')
const distLib = resolve(root, 'dist/lib')
const coreRendererRoot = resolve(repoRoot, 'apps/core-app/src/renderer/src')
const rootImportBudgets = [
  {
    label: 'Core App renderer',
    root: coreRendererRoot,
    limit: 0,
  },
  {
    label: 'Nexus app',
    root: resolve(repoRoot, 'apps/nexus/app'),
    limit: 0,
  },
  {
    label: 'Tuff business package',
    root: resolve(repoRoot, 'packages/tuff-business/src'),
    limit: 0,
  },
  {
    label: 'Intelligence UI kit package',
    root: resolve(repoRoot, 'packages/intelligence-uikit/src'),
    limit: 0,
  },
]
const fullStyleImportBudgets = [
  {
    label: 'Core App renderer',
    root: coreRendererRoot,
    limit: 0,
  },
  {
    label: 'Nexus app',
    root: resolve(repoRoot, 'apps/nexus/app'),
    limit: 0,
  },
  {
    label: 'Nexus config',
    root: resolve(repoRoot, 'apps/nexus'),
    limit: 0,
  },
  {
    label: 'Tuff business package',
    root: resolve(repoRoot, 'packages/tuff-business/src'),
    limit: 0,
  },
  {
    label: 'Intelligence UI kit package',
    root: resolve(repoRoot, 'packages/intelligence-uikit/src'),
    limit: 0,
  },
]

const LIMITS = {
  baseCssBytes: 16 * 1024,
  fullCssBytes: 330 * 1024,
  componentCssBytes: 64 * 1024,
  componentJsBytes: 48 * 1024,
  emptyStateAliasCssBytes: 128,
}
const emptyStateStyleAliases = [
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
]
const onDemandImportBudgets = [
  {
    subpath: 'base-anchor',
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'glass-surface', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'base-surface',
    allowedComponentDirs: ['base-surface', 'glass-surface'],
  },
  {
    subpath: 'button',
    allowedComponentDirs: ['base-anchor', 'base-surface', 'button', 'card', 'glass-surface', 'popover', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap', 'v-wave'],
  },
  {
    subpath: 'input',
    allowedComponentDirs: ['input'],
  },
  {
    subpath: 'select',
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'card-item', 'glass-surface', 'input', 'popover', 'search-input', 'select', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'code-editor',
    allowedComponentDirs: ['code-editor', 'icon'],
    forbiddenStaticSpecifierPrefixes: ['@codemirror/', '@lezer/', 'yaml'],
  },
  {
    subpath: 'flip-overlay',
    allowedComponentDirs: ['base-surface', 'button', 'flip-overlay', 'glass-surface', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'radio',
    allowedComponentDirs: ['glass-surface', 'radio'],
  },
  {
    subpath: 'scroll',
    allowedComponentDirs: ['scroll'],
  },
]
const tuffexRootImportPatterns = [
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]@talex-touch\/tuffex['"]/,
  /import\(\s*['"]@talex-touch\/tuffex['"]\s*\)/,
]

async function collectFiles(dir, predicate) {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const filePath = resolve(dir, dirent.name)
      if (dirent.isDirectory())
        return collectFiles(filePath, predicate)
      return predicate(filePath) ? [filePath] : []
    }),
  )
  return files.flat()
}

async function sizeOf(filePath) {
  return (await stat(filePath)).size
}

function relativeToRepo(filePath) {
  return filePath.replace(`${repoRoot}/`, '')
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function toSortedEntries(entries) {
  return entries.sort((a, b) => b.bytes - a.bytes)
}

async function getSizedFiles(files) {
  return Promise.all(
    files.map(async file => ({
      file,
      bytes: await sizeOf(file),
    })),
  )
}

function printTop(label, entries, limit = 10) {
  console.log(`[audit-package-size] ${label}`)
  for (const entry of entries.slice(0, limit)) {
    console.log(`- ${formatBytes(entry.bytes)} ${relativeToRepo(entry.file)}`)
  }
}

async function collectDistComponentDirs() {
  const dirents = await readdir(distEs, { withFileTypes: true })
  return new Set(
    dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(name => !['_virtual', 'node_modules', 'packages'].includes(name)),
  )
}

function collectRuntimeSpecifiers(source) {
  const specifiers = []
  const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  for (let match = importPattern.exec(source); match !== null; match = importPattern.exec(source)) {
    specifiers.push(match[1])
  }
  return specifiers.filter(Boolean)
}

function resolveRuntimeSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.'))
    return null
  if (specifier.endsWith('.css'))
    return null

  const resolved = resolve(dirname(fromFile), specifier)
  if (!resolved.startsWith(distEs))
    return null
  if (resolved.includes('/node_modules/'))
    return null
  return resolved
}

async function collectRuntimeImportGraph(entryFile) {
  const pending = [entryFile]
  const visited = new Set()

  while (pending.length > 0) {
    const file = pending.pop()
    if (!file || visited.has(file))
      continue
    visited.add(file)

    const source = await readFile(file, 'utf-8')
    for (const specifier of collectRuntimeSpecifiers(source)) {
      const resolved = resolveRuntimeSpecifier(file, specifier)
      if (resolved && !visited.has(resolved))
        pending.push(resolved)
    }
  }

  return visited
}

async function auditOnDemandImports(errors) {
  const componentDirs = await collectDistComponentDirs()
  const rootEntrypoints = new Set([
    resolve(distEs, 'index.js'),
    resolve(distEs, 'components.js'),
  ])

  for (const budget of onDemandImportBudgets) {
    const entryFile = resolve(distEs, budget.subpath, 'index.js')
    const graph = await collectRuntimeImportGraph(entryFile)
    const visitedRootEntrypoints = [...graph].filter(file => rootEntrypoints.has(file))
    const visitedComponentDirs = new Set()
    const forbiddenSpecifiers = new Set()

    for (const file of graph) {
      const relativePath = file.replace(`${distEs}/`, '')
      const [dir] = relativePath.split('/')
      if (componentDirs.has(dir))
        visitedComponentDirs.add(dir)

      if (budget.forbiddenStaticSpecifierPrefixes?.length) {
        const source = await readFile(file, 'utf-8')
        for (const specifier of collectRuntimeSpecifiers(source)) {
          if (budget.forbiddenStaticSpecifierPrefixes.some(prefix => specifier === prefix || specifier.startsWith(prefix)))
            forbiddenSpecifiers.add(specifier)
        }
      }
    }

    const allowedComponentDirs = new Set(budget.allowedComponentDirs)
    const unexpectedComponentDirs = [...visitedComponentDirs]
      .filter(dir => !allowedComponentDirs.has(dir))
      .sort()

    if (visitedRootEntrypoints.length > 0) {
      errors.push(
        `${budget.subpath} on-demand entry reaches root package entrypoints: ${visitedRootEntrypoints.map(relativeToRepo).join(', ')}`,
      )
    }

    if (unexpectedComponentDirs.length > 0) {
      errors.push(
        `${budget.subpath} on-demand entry reaches unexpected component dirs: ${unexpectedComponentDirs.join(', ')}`,
      )
    }

    if (forbiddenSpecifiers.size > 0) {
      errors.push(
        `${budget.subpath} on-demand entry statically imports forbidden specifiers: ${[...forbiddenSpecifiers].sort().join(', ')}`,
      )
    }

    console.log(
      `[audit-package-size] ${budget.subpath} on-demand component dirs: ${[...visitedComponentDirs].sort().join(', ') || '(none)'}`,
    )
  }
}

async function auditRootImports(errors) {
  for (const budget of rootImportBudgets) {
    const sourceFiles = await collectFiles(budget.root, filePath =>
      ['.ts', '.tsx', '.vue'].includes(extname(filePath)),
    )
    const rootImportFiles = []

    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const source = await readFile(filePath, 'utf-8')
        if (tuffexRootImportPatterns.some(pattern => pattern.test(source)))
          rootImportFiles.push(filePath)
      }),
    )

    if (rootImportFiles.length > budget.limit) {
      errors.push(
        `${budget.label} TuffEx root imports grew to ${rootImportFiles.length}; limit is ${budget.limit}`,
      )
    }

    console.log(`[audit-package-size] ${budget.label} root import files: ${rootImportFiles.length}/${budget.limit}`)
  }
}

async function auditFullStyleImports(errors) {
  for (const budget of fullStyleImportBudgets) {
    const sourceFiles = await collectFiles(budget.root, filePath =>
      ['.ts', '.tsx', '.vue', '.js', '.mjs', '.scss', '.css'].includes(extname(filePath)),
    )
    const fullStyleImportFiles = []

    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const source = await readFile(filePath, 'utf-8')
        if (source.includes('@talex-touch/tuffex/style.css'))
          fullStyleImportFiles.push(filePath)
      }),
    )

    if (fullStyleImportFiles.length > budget.limit) {
      errors.push(
        `${budget.label} TuffEx full style imports grew to ${fullStyleImportFiles.length}; limit is ${budget.limit}: ${fullStyleImportFiles.map(relativeToRepo).join(', ')}`,
      )
    }

    console.log(`[audit-package-size] ${budget.label} full style import files: ${fullStyleImportFiles.length}/${budget.limit}`)
  }
}

async function auditDistSizes(errors) {
  const baseCss = resolve(distEs, 'base.css')
  const baseCssBytes = await sizeOf(baseCss)
  if (baseCssBytes > LIMITS.baseCssBytes) {
    errors.push(
      `Base CSS is ${formatBytes(baseCssBytes)}; limit is ${formatBytes(LIMITS.baseCssBytes)}`,
    )
  }

  const fullCss = resolve(distEs, 'components.css')
  const fullCssBytes = await sizeOf(fullCss)
  if (fullCssBytes > LIMITS.fullCssBytes) {
    errors.push(
      `Full CSS is ${formatBytes(fullCssBytes)}; limit is ${formatBytes(LIMITS.fullCssBytes)}`,
    )
  }

  const componentCssFiles = await collectFiles(distEs, filePath => filePath.endsWith('/style.css'))
  const componentCssSizes = toSortedEntries(await getSizedFiles(componentCssFiles))
  const oversizedCss = componentCssSizes.filter(entry => entry.bytes > LIMITS.componentCssBytes)
  for (const entry of oversizedCss) {
    errors.push(
      `Component CSS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(LIMITS.componentCssBytes)}`,
    )
  }
  for (const distDir of [distEs, distLib]) {
    for (const componentName of emptyStateStyleAliases) {
      const styleFile = resolve(distDir, componentName, 'style.css')
      const bytes = await sizeOf(styleFile)
      const source = await readFile(styleFile, 'utf-8')
      if (bytes > LIMITS.emptyStateAliasCssBytes || !source.includes('../empty-state/style.css')) {
        errors.push(
          `${relativeToRepo(styleFile)} is ${formatBytes(bytes)}; expected a lightweight import of ../empty-state/style.css`,
        )
      }
    }
  }

  const componentJsFiles = await collectFiles(distEs, filePath =>
    filePath.endsWith('.js')
    && !filePath.endsWith('/index.js')
    && !filePath.includes('/node_modules/')
    && !filePath.includes('/packages/tuffex/packages/utils/')
    && !filePath.includes('/packages/utils/'),
  )
  const componentJsSizes = toSortedEntries(await getSizedFiles(componentJsFiles))
  const oversizedJs = componentJsSizes.filter(entry => entry.bytes > LIMITS.componentJsBytes)
  for (const entry of oversizedJs) {
    errors.push(
      `Component JS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(LIMITS.componentJsBytes)}`,
    )
  }

  console.log(`[audit-package-size] Base CSS: ${formatBytes(baseCssBytes)}/${formatBytes(LIMITS.baseCssBytes)}`)
  console.log(`[audit-package-size] Full CSS: ${formatBytes(fullCssBytes)}/${formatBytes(LIMITS.fullCssBytes)}`)
  printTop('Largest component CSS files:', componentCssSizes)
  printTop('Largest component JS files:', componentJsSizes)
}

const errors = []

await auditDistSizes(errors)
await auditOnDemandImports(errors)
await auditRootImports(errors)
await auditFullStyleImports(errors)

if (errors.length > 0) {
  console.error('[audit-package-size] Size audit failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[audit-package-size] package size and Core App root import budgets are within limits')
