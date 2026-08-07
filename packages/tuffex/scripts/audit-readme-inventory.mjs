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

const problems = []

for (const readme of READMES) {
  const body = readFileSync(readme.path, 'utf8')

  const countMatch = body.match(readme.countPattern)
  if (!countMatch) {
    problems.push(`${readme.label}: could not find the module-count line`)
    continue
  }
  if (Number(countMatch[1]) !== exported.length)
    problems.push(`${readme.label}: claims ${countMatch[1]} modules, components.ts exports ${exported.length}`)

  const startIndex = body.indexOf(readme.start)
  const endIndex = body.indexOf(readme.end, startIndex)
  if (startIndex === -1 || endIndex === -1) {
    problems.push(`${readme.label}: could not locate the inventory block`)
    continue
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
}

if (problems.length) {
  console.error('README component inventory is out of sync with components.ts:\n')
  for (const problem of problems)
    console.error(`  - ${problem}`)
  console.error('\nUpdate the inventory lists and the count line in both READMEs.')
  process.exit(1)
}

console.log(`README component inventory matches components.ts (${exported.length} modules, both languages).`)
