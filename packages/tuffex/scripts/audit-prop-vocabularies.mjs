/**
 * Inventories the string vocabularies behind the `size` and `status` props.
 *
 * "The sizes are inconsistent" has been true and unactionable for a long time,
 * because nobody could say how inconsistent. This prints the answer: which
 * spellings exist, and which components use each. Reading it takes seconds;
 * deriving it by hand takes an afternoon, which is why it never got derived.
 *
 * Report-only, deliberately. A guard that failed on a new vocabulary would be
 * wrong here: many `status` unions are domain vocabularies that only share a
 * prop name — avatar's away/busy/offline/online, status-badge's
 * denied/granted/notDetermined/unsupported — and flagging those as drift would
 * bury the one split that is real. Deciding which vocabulary wins is a
 * breaking change to a published package, so this reports and stops.
 *
 * Usage:
 *   pnpm -C packages/tuffex audit:vocab
 *   pnpm -C packages/tuffex audit:vocab:self-test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const componentsRoot = join(scriptDir, '..', 'packages', 'components', 'src')

/**
 * Every string union bound to `prop`, as a sorted, de-duplicated tuple.
 *
 * Over text rather than the filesystem so `--self-test` can hand it sources
 * whose answer is known. Two shapes carry these unions: a named exported type
 * (`export type EmptyStateSize = 'small' | ...`) and an inline prop annotation
 * (`size?: 'sm' | 'md'`), and components use both interchangeably.
 */
export function extractVocabularies(source, prop) {
  const values = union => [...new Set([...union.matchAll(/'([^']*)'/g)].map(m => m[1]))]
    // The empty string is a real member of several unions ('' meaning "no
    // status"), but it carries no spelling, so it never distinguishes one
    // vocabulary from another.
    .filter(Boolean)
    .sort()

  // Named unions declared in this file, so an annotation pointing at one
  // resolves. Name-matching the type instead does not work in either direction:
  // `\w*Size\w*` also catches AutoSizerWatchKey because the component is called
  // AutoSizer, and requiring the suffix drops StatusTone, where the prop name is
  // the prefix. What makes a union a vocabulary is being bound to the prop.
  const aliases = new Map()
  for (const match of source.matchAll(/type\s+(\w+)\s*=\s*((?:[^\n;]|\n\s*\|)+)/g))
    aliases.set(match[1], match[2])

  // One alias often points at another — `AvatarSize = AvatarPresetSize | number`,
  // `TxIconStatus` likewise — so a single lookup finds a body with no literals in
  // it and gives up on a vocabulary that is really there. Depth is capped rather
  // than cycle-tracked because these chains are two links at most.
  const resolve = (name, depth = 0) => {
    if (depth > 3 || !aliases.has(name)) return []
    const body = aliases.get(name)
    const direct = values(body)
    if (direct.length > 1) return direct
    for (const [, referenced] of body.matchAll(/\b([A-Z]\w+)\b/g)) {
      const chased = resolve(referenced, depth + 1)
      if (chased.length > 1) return chased
    }
    return []
  }

  const found = []
  for (const match of source.matchAll(new RegExp(`\\b${prop}\\??\\s*:\\s*((?:[^\\n,;}]|\\n\\s*\\|)+)`, 'g'))) {
    const annotation = match[1].trim()
    // `DrawerProps['size'] | DrawerProps['width']` is an indexed access on a
    // function parameter, not a union of literals — its quotes are key names.
    if (annotation.includes("['") || annotation.includes('["')) continue
    const inline = values(annotation)
    if (inline.length > 1) {
      found.push(inline)
      continue
    }
    const alias = /^(\w+)/.exec(annotation)?.[1]
    if (alias) {
      const chased = resolve(alias)
      if (chased.length > 1) found.push(chased)
    }
  }
  return found
}

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      found.push(...walk(full))
    else if ((full.endsWith('.ts') || full.endsWith('.vue')) && !full.endsWith('.d.ts'))
      found.push(full)
  }
  return found
}

function inventory(prop) {
  const byVocabulary = new Map()
  // A component is read as one unit: the union lives in types.ts and the prop it
  // annotates lives in the .vue, so per-file extraction resolves neither.
  const byComponent = new Map()
  for (const file of walk(componentsRoot).sort()) {
    const component = relative(componentsRoot, file).split('/')[0]
    byComponent.set(component, (byComponent.get(component) ?? '') + '\n' + readFileSync(file, 'utf8'))
  }
  for (const [component, source] of byComponent) {
    for (const values of extractVocabularies(source, prop)) {
      const key = values.join(' | ')
      if (!byVocabulary.has(key)) byVocabulary.set(key, new Set())
      byVocabulary.get(key).add(component)
    }
  }
  return [...byVocabulary.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
}

function selfTest() {
  let failures = 0
  const cases = [
    {
      label: 'named exported union bound to the prop',
      source: `export type EmptyStateSize = 'small' | 'medium' | 'large'\ninterface P { size?: EmptyStateSize }`,
      prop: 'size',
      expect: [['large', 'medium', 'small']],
    },
    {
      label: 'inline prop annotation',
      source: `interface P { size?: 'sm' | 'md' | 'lg' }`,
      prop: 'size',
      expect: [['lg', 'md', 'sm']],
    },
    {
      label: "empty-string member is not a spelling",
      source: `status?: 'success' | 'error' | ''`,
      prop: 'status',
      expect: [['error', 'success']],
    },
    {
      // AutoSizer is a component name, not a size scale. Nothing binds this
      // union to a `size` prop, so it is not one.
      label: 'an unbound union named after the component is not a vocabulary',
      source: `export type AutoSizerWatchKey = 'rect' | 'box' | 'scroll'`,
      prop: 'size',
      expect: [],
    },
    {
      // StatusTone puts the prop name at the front, so any suffix rule loses it.
      label: 'an annotation pointing at a named union resolves',
      source: `export type StatusTone = 'success' | 'danger'\ninterface P { status?: StatusTone }`,
      prop: 'status',
      expect: [['danger', 'success']],
    },
    {
      label: 'an alias chain resolves to the union at its end',
      source: `type AvatarPresetSize = 'small' | 'large'\ntype AvatarSize = AvatarPresetSize | number\ninterface P { size?: AvatarSize }`,
      prop: 'size',
      expect: [['large', 'small']],
    },
    {
      label: 'an indexed access is not a union of literals',
      source: `function f(size: DrawerProps['size'] | DrawerProps['width']) {}`,
      prop: 'size',
      expect: [],
    },
    {
      label: 'single-value union is not a vocabulary',
      source: `size?: 'full'`,
      prop: 'size',
      expect: [],
    },
    {
      label: 'a prop that merely mentions the word is not a union',
      source: `const iconSize = computed(() => props.size ?? 16)`,
      prop: 'size',
      expect: [],
    },
  ]
  for (const testCase of cases) {
    const actual = extractVocabularies(testCase.source, testCase.prop)
    const same = JSON.stringify(actual) === JSON.stringify(testCase.expect)
    if (!same) {
      failures += 1
      console.error(`  FAIL ${testCase.label}`)
      console.error(`       expected ${JSON.stringify(testCase.expect)}`)
      console.error(`       actual   ${JSON.stringify(actual)}`)
    }
  }
  console.log(
    failures
      ? `\nprop-vocabulary self-test: ${failures} of ${cases.length} cases failed`
      : `prop-vocabulary self-test: ${cases.length} cases pass`,
  )
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

for (const prop of ['size', 'status']) {
  const rows = inventory(prop)
  console.log(`\n=== \`${prop}\` vocabularies (${rows.length} distinct) ===`)
  for (const [vocabulary, components] of rows)
    console.log(`  ${vocabulary}\n      ${[...components].sort().join(', ')}`)
}
console.log(
  '\nMany `status` unions are separate domain vocabularies that only share a prop name.'
  + '\nThe split worth deciding is severity: `error` and `danger` name the same state.',
)
