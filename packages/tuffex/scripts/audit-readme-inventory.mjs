// The README component inventory is hand-maintained but claims components.ts as
// its source of truth, so it drifts silently every time a module is added — it
// was 24 modules and one whole product family behind when this guard was written.
// Checks both languages: the count line, the per-category subtotals, and that
// every exported module appears exactly once.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const READMES = [
  {
    path: resolve(root, 'README.md'),
    label: 'README.md',
    countPattern: /Current source-of-truth export modules: \*\*(\d+)\*\*\./,
    start: '## Component Inventory',
    end: '\nReference:',
  },
  {
    path: resolve(root, 'README_ZHCN.md'),
    label: 'README_ZHCN.md',
    countPattern: /当前源码导出模块总数：\*\*(\d+)\*\*。/,
    start: '## 组件梳理',
    end: '\n参考来源：',
  },
]

const source = readFileSync(
  resolve(root, 'packages/components/src/components.ts'),
  'utf8',
)
const exported = [...source.matchAll(/^export \* from '\.\/([^/]+)\/index'/gm)].map(m => m[1])
const exportedSet = new Set(exported)

/**
 * The whole rule set, over text rather than the filesystem, so `--self-test` can hand it inputs
 * that must fail. A drift checker that matched nothing would look exactly like one that found no
 * drift, and until now nothing here could tell those apart (#1589).
 */
export function inventoryProblems(readme, body, exported, exportedSet) {
  const problems = []

  const countMatch = body.match(readme.countPattern)
  if (!countMatch) {
    problems.push(`${readme.label}: could not find the module-count line`)
    return problems
  }
  if (Number(countMatch[1]) !== exported.length)
    problems.push(`${readme.label}: claims ${countMatch[1]} modules, components.ts exports ${exported.length}`)

  const startIndex = body.indexOf(readme.start)
  const endIndex = body.indexOf(readme.end, startIndex)
  if (startIndex === -1 || endIndex === -1) {
    problems.push(`${readme.label}: could not locate the inventory block`)
    return problems
  }
  const inventory = body.slice(startIndex, endIndex)

  const seen = []
  for (const line of inventory.split('\n')) {
    const category = line.match(/^- `.+ \((\d+)\)`: (.+)$/)
    if (!category)
      continue
    const items = [...category[2].matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1])
    if (items.length !== Number(category[1]))
      problems.push(`${readme.label}: category "${line.slice(3, line.indexOf('`', 3))}" says ${category[1]} but lists ${items.length}`)
    seen.push(...items)
  }

  const missing = exported.filter(name => !seen.includes(name))
  const unknown = seen.filter(name => !exportedSet.has(name))
  const duplicated = seen.filter((name, index) => seen.indexOf(name) !== index)

  if (missing.length)
    problems.push(`${readme.label}: missing ${missing.length} exported module(s): ${missing.join(', ')}`)
  if (unknown.length)
    problems.push(`${readme.label}: lists ${unknown.length} module(s) that are not exported: ${unknown.join(', ')}`)
  if (duplicated.length)
    problems.push(`${readme.label}: lists module(s) more than once: ${[...new Set(duplicated)].join(', ')}`)

  return problems
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const problems = []
for (const readme of READMES)
  problems.push(...inventoryProblems(readme, readFileSync(readme.path, 'utf8'), exported, exportedSet))

if (problems.length) {
  console.error('README component inventory is out of sync with components.ts:\n')
  for (const problem of problems)
    console.error(`  - ${problem}`)
  console.error('\nUpdate the inventory lists and the count line in both READMEs.')
  process.exit(1)
}

console.log(`README component inventory matches components.ts (${exported.length} modules, both languages).`)

/**
 * Every case is an inventory this audit must reject, plus one it must accept. Mirrors the shape
 * used by check-plugin-lint-coverage.mjs and validate-plugins.mjs.
 */
function selfTest() {
  const readme = {
    label: 'probe',
    countPattern: /modules: \*\*(\d+)\*\*/,
    start: '## Inventory',
    end: '\nReference:',
  }
  const build = (count, categoryCount, items) =>
    `modules: **${count}**\n\n## Inventory\n\n- \`Group (${categoryCount})\`: ${items.map(i => `\`${i}\``).join(', ')}\n\nReference: x\n`
  const exported = ['button', 'input']
  const exportedSet = new Set(exported)

  const cases = [
    { name: 'a matching inventory is accepted', body: build(2, 2, ['button', 'input']), expect: 0 },
    { name: 'a wrong count line is caught', body: build(9, 2, ['button', 'input']), expect: 1 },
    { name: 'a missing module is caught', body: build(2, 1, ['button']), expect: 1 },
    { name: 'a category subtotal that disagrees with its list is caught', body: build(2, 9, ['button', 'input']), expect: 1 },
    { name: 'a module that is not exported is caught', body: build(2, 3, ['button', 'input', 'ghost']), expect: 1 },
    { name: 'a duplicated module is caught', body: build(2, 3, ['button', 'input', 'input']), expect: 1 },
    { name: 'a missing count line is caught', body: '## Inventory\n\nReference: x\n', expect: 1 },
    { name: 'a missing inventory block is caught', body: 'modules: **2**\n', expect: 1 },
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = inventoryProblems(readme, testCase.body, exported, exportedSet).length
    if (found === testCase.expect) {
      console.log(`  \u001B[32m\u2713\u001B[0m ${testCase.name}`)
    }
    else {
      console.error(`  \u001B[31m\u2717\u001B[0m ${testCase.name}: expected ${testCase.expect} problem(s), got ${found}`)
      failures += 1
    }
  }
  console.log(failures === 0
    ? '\naudit-readme-inventory self-test passed.\n'
    : `\naudit-readme-inventory self-test failed: ${failures} case(s).\n`)
  return failures
}
