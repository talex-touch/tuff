// Guards the three-way agreement between demo-registry.ts, the demo .vue
// files, and the content pages that reference them inside apps/tuffex-docs,
// and ensures 1-hop direct `./demos/<Name>.vue` imports (no trampoline layer).
//
// Self-test: `node scripts/checks/check-demo-registry.mjs --self-test`

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const registryPath = join(appRoot, 'app', 'components', 'content', 'demo-registry.ts')
const demosRoot = join(appRoot, 'app', 'components', 'content', 'demos')
const contentRoot = join(appRoot, 'content', 'docs')

/** key -> imported file stem, from `Key: () => import('./demos/File.vue'),` lines. */
function collectRegistry() {
  const entries = new Map()
  const source = readFileSync(registryPath, 'utf8')
  for (const match of source.matchAll(/^\s*([A-Za-z0-9_]+): \(\) => import\('\.\/demos\/([A-Za-z0-9_]+)\.vue'\)/gm))
    entries.set(match[1], match[2])
  return { entries, source }
}

/** Stems of every .vue file under demos/. */
function collectDemoFiles() {
  return readdirSync(demosRoot)
    .filter(entry => entry.endsWith('.vue'))
    .map(entry => entry.replace(/\.vue$/, ''))
}

/** Stems imported by other demo files (`from './X.vue'` or `from './X.client.vue'`) — helper components. */
function collectHelperImports() {
  const helpers = new Set()
  for (const entry of readdirSync(demosRoot)) {
    if (!entry.endsWith('.vue'))
      continue
    const source = readFileSync(join(demosRoot, entry), 'utf8')
    for (const match of source.matchAll(/from\s+['"]\.\/([A-Za-z0-9_.-]+)\.vue['"]/g))
      helpers.add(match[1])
  }
  return helpers
}

/** key -> first `file:line` referencing it, from TuffDemoWrapper blocks in content/docs/. */
function collectContentRefs() {
  const refs = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(?:mdc|md)$/.test(entry))
        continue
      const lines = readFileSync(full, 'utf8').split('\n')
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/TuffDemoWrapper\{[^}]*?\bdemo="([A-Za-z0-9_]+)"/g)) {
          if (!refs.has(match[1]))
            refs.set(match[1], `${relative(appRoot, full)}:${index + 1}`)
        }
      })
    }
  }
  walk(contentRoot)
  return refs
}

/** Pure so the self-test can feed synthetic fixtures. */
function analyze({ registry, registrySource = '', demoFiles, helperImports, contentRefs }) {
  const problems = []
  const fileSet = new Set(demoFiles)
  const registeredFiles = new Set(registry.values())

  if (/import\s*\(\s*['"]\.\/demo-loaders\//.test(registrySource))
    problems.push('demo-registry.ts references legacy 2-hop demo-loaders/ trampoline')

  for (const [key, file] of registry) {
    if (!fileSet.has(file))
      problems.push(`registry entry '${key}' imports demos/${file}.vue, which does not exist`)
  }
  for (const file of demoFiles) {
    if (!registeredFiles.has(file) && !helperImports.has(file))
      problems.push(`demos/${file}.vue is neither registered nor imported by another demo`)
  }
  for (const key of registry.keys()) {
    if (!contentRefs.has(key))
      problems.push(`registry entry '${key}' is referenced by no content page`)
  }
  for (const [key, at] of contentRefs) {
    if (!registry.has(key))
      problems.push(`${at} references demo '${key}', which demo-registry.ts does not define`)
  }
  return problems
}

function selfTest() {
  const failures = []
  const assert = (condition, label) => {
    if (!condition)
      failures.push(label)
  }

  const { entries: registry } = collectRegistry()
  assert(registry.size >= 200, `registry parser found ${registry.size} entries, expected >= 200`)
  assert(collectDemoFiles().length >= 200, `demo dir listing found ${collectDemoFiles().length} files, expected >= 200`)
  assert(collectContentRefs().size >= 200, `content scan found ${collectContentRefs().size} referenced keys, expected >= 200`)
  assert(collectHelperImports().size >= 1, 'helper-import scan found nothing; known helpers exist')

  const problems = analyze({
    registry: new Map([['GhostDemo', 'GhostDemo'], ['DeadDemo', 'DeadDemo']]),
    registrySource: "import('./demo-loaders/fake/GhostDemo.js')",
    demoFiles: ['DeadDemo', 'OrphanDemo', 'HelperCard'],
    helperImports: new Set(['HelperCard']),
    contentRefs: new Map([['DeadDemo', 'content/docs/x.zh.mdc:1'], ['MissingDemo', 'content/docs/y.zh.mdc:9']]),
  })
  assert(problems.some(p => p.includes('demo-loaders/')), 'trampoline class undetected')
  assert(problems.some(p => p.includes('GhostDemo') && p.includes('does not exist')), 'missing-file class undetected')
  assert(problems.some(p => p.includes('OrphanDemo') && p.includes('neither registered')), 'orphan-file class undetected')
  assert(!problems.some(p => p.includes('HelperCard')), 'helper exclusion regressed')
  assert(problems.some(p => p.includes('GhostDemo') && p.includes('no content page')), 'dead-entry class undetected')
  assert(problems.some(p => p.includes('MissingDemo') && p.includes('does not define')), 'unregistered-ref class undetected')

  if (failures.length) {
    console.error('[tuffex-demo-registry] self-test FAILED:')
    for (const failure of failures)
      console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log('[tuffex-demo-registry] self-test ok')
}

if (process.argv.includes('--self-test')) {
  selfTest()
}
else {
  const { entries: registry, source: registrySource } = collectRegistry()
  const demoFiles = collectDemoFiles()
  const helperImports = collectHelperImports()
  const contentRefs = collectContentRefs()

  const problems = analyze({
    registry,
    registrySource,
    demoFiles,
    helperImports,
    contentRefs,
  })
  if (problems.length) {
    console.error('[tuffex-demo-registry] demo registry, files, and content have diverged:')
    for (const problem of problems)
      console.error(`  ${problem}`)
    process.exit(1)
  }
  console.log(
    `[tuffex-demo-registry] ok — ${registry.size} registered 1-hop demos, ${demoFiles.length} .vue files (${helperImports.size} helpers), ${contentRefs.size} content refs agree`,
  )
}
