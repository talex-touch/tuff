import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
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
    // The plugin sandbox hands whole modules to untrusted plugin code, so it has to hold
    // the namespace: resolveTalexTouchModule serves '@talex-touch/tuffex' and every
    // '@talex-touch/tuffex/*' request from it. There is nothing to tree-shake in a
    // registry whose keys are decided at runtime, and raising the limit to 1 instead
    // would let the next accidental root import in unnoticed.
    allow: ['modules/plugin/widget-registry.ts'],
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

// Ratchets, not targets. The 16/330 pair was set on 2026-06-05 against 107 components; there are
// now 126, and nothing re-measured them since. They were also never enforced -- no workflow ran
// this script at all -- so they protected nothing while drifting out of date.
//
// These are today's sizes plus a little headroom, which is the smallest change that makes the gate
// mean something: growth from here fails, and lowering them later is a one-line edit. It is not an
// endorsement of the current figures. Whether the CSS itself should shrink is open on #1555, along
// with the measurement behind it: base.css is 14.9 KiB of design tokens (102 `--tx-*` vars) and
// carries only 0.2 KiB of component styles, so it is not leaking -- it simply outgrew a two-month
// -old number.
const LIMITS = {
  // 32 -> 40 on 2026-08-15 for the Beautiful UI port (.trellis/tasks/08-15-beautiful-ui-port):
  // base.css gains the `--tx-bui-*` token layer (33 tokens x 2 themes + shadow/radius/mono
  // entries, ~2.7 KiB) against 2.4 KiB of headroom. Re-measure and trim the slack once the
  // BUI component family lands.
  baseCssBytes: 40 * 1024,
  // 448 -> 488 and 64 -> 96 on 2026-08-13, re-baselined for the app-shell-v2 convergence (#1742):
  // CI measured full CSS at 481.6 KiB and stream-markdown at 92.0 KiB after that branch's
  // conversation/markdown product styles landed. Same contract as the note above -- today's size
  // plus minimal headroom, growth from here fails, and #1555 still owns whether it should shrink.
  // 488 -> 640 on 2026-08-15: the Beautiful UI port adds 24 component directories. Measured
  // 623.8 KiB after the full family landed (the BUI styles run well above the old 2.8 KiB
  // median — pixel-matched surfaces are style-heavy), so this is actuals plus minimal
  // headroom, same contract as the notes above: growth from here fails.
  fullCssBytes: 640 * 1024,
  componentCssBytes: 96 * 1024,
  componentJsBytes: 48 * 1024,
  // Per-file exceptions to `componentJsBytes`, keyed by the path under `dist/es`.
  // A global raise was the wrong lever here: border-beam is a lone outlier at
  // 76.7 KiB while the next largest component JS is 38.5 KiB, so lifting the
  // shared limit would hand ~10 KiB of new slack to all 492 files to
  // accommodate one. Each entry is a measurement plus the reason it is not
  // simply bloat, and it still fails when it grows past the number recorded.
  componentJsOverrides: {
    // 76.7 KiB measured 2026-08-20. `border-beam/src/styles.ts` is a 2,163-line
    // MIT port kept deliberately close to upstream so upstream fixes stay
    // diffable (see the header of that file); trimming it to fit is a call for
    // whoever owns that contract, not for this gate. It arrived in c5e6660d9 on
    // 2026-08-18 and has failed tuffex CI on every commit since — which cost
    // every tuffex change its build signal, this file's own audits included.
    'border-beam/src/styles.js': 80 * 1024,
  },
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
    // `tooltip` rides in behind `popover`: TxPopover is now a TxTooltip
    // specialisation, so anything reaching the popover reaches the tooltip too.
    // `icon` rides in behind TxIconButton, which renders its glyph via TxIcon.
    allowedComponentDirs: ['base-anchor', 'base-surface', 'button', 'card', 'glass-surface', 'icon', 'popover', 'spinner', 'tooltip'],
    forbiddenStaticSpecifierPrefixes: ['gsap', 'v-wave'],
  },
  {
    subpath: 'input',
    allowedComponentDirs: ['input'],
  },
  {
    subpath: 'select',
    // `tooltip` rides in behind `popover` — see the button entry above.
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'card-item', 'glass-surface', 'input', 'popover', 'search-input', 'select', 'spinner', 'tooltip'],
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
      // 'utils' is shared code, not a component -- audit-package-exports.mjs excludes it
      // from its own component enumeration for the same reason. Counting it here made
      // every on-demand entry report "reaches unexpected component dirs: utils", which
      // is true of all of them by design and told nobody anything.
      .filter(name => !['_virtual', 'node_modules', 'packages', 'utils'].includes(name)),
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
        if (!tuffexRootImportPatterns.some(pattern => pattern.test(source))) return
        const relativePath = relative(budget.root, filePath)
        if ((budget.allow ?? []).some(allowed => relativePath === allowed)) return
        rootImportFiles.push(filePath)
      }),
    )

    if (rootImportFiles.length > budget.limit) {
      errors.push(
        `${budget.label} TuffEx root imports grew to ${rootImportFiles.length}; limit is ${budget.limit}`
        + ` (${rootImportFiles.map(filePath => relative(budget.root, filePath)).join(', ')})`,
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
  // Category entry barrels (base/pro/ai, added in 98e5d5327) aggregate every member
  // component's CSS by construction, so the per-component budget can never hold
  // them; each is a subset of the full bundle, so hold it to the full-bundle limit
  // instead. Member components stay under the per-component budget individually.
  const suiteAggregateCss = new Set(['ai', 'base', 'pro'].map(dir => resolve(distEs, dir, 'style.css')))
  const cssLimitFor = file => (suiteAggregateCss.has(file) ? LIMITS.fullCssBytes : LIMITS.componentCssBytes)
  const oversizedCss = componentCssSizes.filter(entry => entry.bytes > cssLimitFor(entry.file))
  for (const entry of oversizedCss) {
    errors.push(
      `Component CSS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(cssLimitFor(entry.file))}`,
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
  const componentJsLimitFor = (file) => {
    const key = Object.keys(LIMITS.componentJsOverrides).find(name => file.endsWith(`/${name}`))
    return key ? LIMITS.componentJsOverrides[key] : LIMITS.componentJsBytes
  }
  const oversizedJs = componentJsSizes.filter(entry => entry.bytes > componentJsLimitFor(entry.file))
  for (const entry of oversizedJs) {
    errors.push(
      `Component JS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(componentJsLimitFor(entry.file))}`,
    )
  }

  console.log(`[audit-package-size] Base CSS: ${formatBytes(baseCssBytes)}/${formatBytes(LIMITS.baseCssBytes)}`)
  console.log(`[audit-package-size] Full CSS: ${formatBytes(fullCssBytes)}/${formatBytes(LIMITS.fullCssBytes)}`)
  printTop('Largest component CSS files:', componentCssSizes)
  printTop('Largest component JS files:', componentJsSizes)
}

const errors = []

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

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

/**
 * Proves the two functions the on-demand budget rests on still discriminate.
 *
 * `collectRuntimeSpecifiers` is a regex over emitted JS: if a change in output shape stops it
 * matching, every on-demand entry reports an empty import graph and the budget passes over
 * nothing. `resolveRuntimeSpecifier` decides what counts as an in-package runtime edge, so an
 * over-eager filter has the same effect. Neither failure is visible from a green run (#1589).
 */
function selfTest() {
  const inDist = file => `${distEs}/${file}`
  const cases = [
    {
      name: 'a default import is collected',
      run: () => collectRuntimeSpecifiers("import a from './a'"),
      expect: './a',
    },
    {
      name: 'a side-effect import is collected',
      run: () => collectRuntimeSpecifiers("import './a.css'"),
      expect: './a.css',
    },
    {
      name: 'a re-export is collected',
      run: () => collectRuntimeSpecifiers("export * from './b/index'"),
      expect: './b/index',
    },
    {
      name: 'a named re-export is collected',
      run: () => collectRuntimeSpecifiers("export { x } from './c'"),
      expect: './c',
    },
    {
      name: 'several specifiers are all collected',
      run: () => collectRuntimeSpecifiers("import a from './a'\nexport * from './b'\n"),
      expect: './a,./b',
    },
    {
      name: 'source with no imports collects nothing',
      run: () => collectRuntimeSpecifiers('const x = 1'),
      expect: '',
    },
    {
      name: 'a relative sibling resolves to an in-package edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './style') ?? 'null'],
      expect: `${distEs}/button/style`,
    },
    {
      name: 'a bare specifier is not an in-package edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), 'vue') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'a css specifier is not a runtime edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './style.css') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'an edge leaving dist/es is not followed',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), '../../../outside') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'a node_modules edge is not followed',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './node_modules/x') ?? 'null'],
      expect: 'null',
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const actual = testCase.run().join(',')
    if (actual === testCase.expect) {
      console.log(`  \u001B[32m\u2713\u001B[0m ${testCase.name}`)
    }
    else {
      console.error(`  \u001B[31m\u2717\u001B[0m ${testCase.name}: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`)
      failures += 1
    }
  }
  console.log(failures === 0
    ? '\naudit-package-size self-test passed.\n'
    : `\naudit-package-size self-test failed: ${failures} case(s).\n`)
  return failures
}
