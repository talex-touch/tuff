/**
 * Finds components that hand the user something clickable and no pointer to
 * click it with.
 *
 * A `<button>` defaults to `cursor: default`, and a `<div role="button">` to
 * `auto`, so the affordance only exists if someone declares it. That is easy to
 * forget one component at a time and impossible to notice by reading a diff,
 * which is how `.tx-button` — the base button — went without one.
 *
 * Report-only, deliberately. The signal is genuinely noisy in one direction: a
 * component whose own file never says `cursor` usually inherits one from a
 * wrapper it renders (`TxCardItem :clickable`, `TxButton`) or from the UA
 * (`<a href>`). Those are correct and must not be "fixed". So this locates
 * candidates and REVIEWED below records the verdicts; a new name appearing in
 * the output is the thing worth looking at.
 *
 * Usage:
 *   pnpm -C packages/tuffex audit:cursor
 *   pnpm -C packages/tuffex audit:cursor:self-test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const componentsRoot = join(scriptDir, '..', 'packages', 'components', 'src')

/**
 * Markup that offers a click, a press or a keyboard activation target.
 *
 * `tabindex` is in here even though a focusable element is not necessarily a
 * clickable one — `tabindex="-1"` roving focus and `role="status"` containers
 * both match. Those are false positives on purpose: narrowing the pattern to
 * remove them also removed `<div role="button" tabindex="0">`, which is the
 * exact shape this exists to catch.
 */
const INTERACTIVE = /@click|v-on:click|@mousedown|@pointerdown|role="button"|role="tab"|role="option"|role="menuitem"|<button|<a\s|tabindex/
const CURSOR = /cursor\s*:/

/**
 * Verdicts from the 2026-08-31 sweep. A name here has been looked at; the
 * reason is what a future reader needs, not the fact that it was skipped.
 */
const REVIEWED = {
  'agents': 'renders TxCardItem :clickable — inherits .tx-card-item--clickable',
  'base-anchor': 'reference wrapper only delegates; the clickable element is host slot content',
  'cell-link': '<a> with a required `href` prop — UA supplies the pointer',
  'dialog': 'all four dialogs render TxButton',
  'dropdown-menu': 'items and submenu triggers render TxDropdownItem -> TxCardItem :clickable',
  'empty-state': 'actions render TxButton',
  'inline-citation': '<a> with a required `source.url` — UA supplies the pointer',
  'loading-overlay': 'role="status" / tabindex="-1"; a blocking veil, not a control',
  'search-select': 'options render TxCardItem :clickable',
  'button': 'base .tx-button declares pointer; split-button parts declare their own',
  'chat': 'composer actions render TxButton',
  'context-menu': 'items render TxCardItem :clickable',
  'flat-radio': 'tabindex sits on the radiogroup container; items are TxFlatRadioItem',
  'group-block': 'TxBlockSwitch renders TxBlockSlot, whose content area declares pointer',
  'select': 'TxSelectItem renders TxCardItem :clickable',
  'switch': 'root <button> gets pointer from switch/style/index.scss',
  'tabs': 'matches are a comment and a querySelector string; items are TxTabItem',
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'dist')
        continue
      walk(path, out)
    }
    else if (/\.(?:vue|scss|css)$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/**
 * Over `{ path, source }` records rather than the filesystem, so `--self-test`
 * can hand it sources whose answer is known.
 */
export function findCandidates(files) {
  const byComponent = new Map()
  for (const file of files) {
    const component = file.path.split('/')[0]
    if (!byComponent.has(component))
      byComponent.set(component, [])
    byComponent.get(component).push(file)
  }

  const candidates = []
  for (const [component, group] of [...byComponent].sort()) {
    const interactive = group.filter(file => INTERACTIVE.test(file.source))
    if (interactive.length === 0)
      continue

    const anyCursor = group.some(file => CURSOR.test(file.source))
    // Two tiers. Nothing in the whole directory says `cursor` is the strong
    // signal; a single file missing it while a sibling has one usually means
    // the style just lives next door, so it is reported separately.
    const orphans = interactive.filter(file => !CURSOR.test(file.source))
    if (orphans.length === 0)
      continue

    candidates.push({
      component,
      tier: anyCursor ? 'sibling-has-cursor' : 'none-in-component',
      files: orphans.map(file => file.path),
    })
  }
  return candidates
}

function selfTest() {
  let failures = 0
  const cases = [
    {
      label: 'a div role=button with no cursor is a candidate',
      files: [{ path: 'widget/src/TxWidget.vue', source: '<div role="button" tabindex="0">x</div>' }],
      expect: ['widget'],
    },
    {
      label: 'the same markup with a cursor is not',
      files: [{ path: 'widget/src/TxWidget.vue', source: '<div role="button">x</div>\n.a { cursor: pointer; }' }],
      expect: [],
    },
    {
      label: 'a cursor in a sibling file still reports the orphan file',
      files: [
        { path: 'widget/src/TxWidget.vue', source: '<button>x</button>' },
        { path: 'widget/src/style.scss', source: '.a { cursor: pointer; }' },
      ],
      expect: ['widget'],
    },
    {
      label: 'a component with nothing interactive is never a candidate',
      files: [{ path: 'widget/src/TxWidget.vue', source: '<div>x</div>' }],
      expect: [],
    },
  ]

  for (const testCase of cases) {
    const actual = findCandidates(testCase.files).map(entry => entry.component)
    if (JSON.stringify(actual) !== JSON.stringify(testCase.expect)) {
      failures += 1
      console.error(`  FAIL ${testCase.label}`)
      console.error(`       expected ${JSON.stringify(testCase.expect)}`)
      console.error(`       actual   ${JSON.stringify(actual)}`)
    }
  }

  console.log(
    failures
      ? `\ninteractive-cursor self-test: ${failures} of ${cases.length} cases failed`
      : `interactive-cursor self-test: ${cases.length} cases pass`,
  )
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

const files = walk(componentsRoot).map(path => ({
  path: relative(componentsRoot, path),
  source: readFileSync(path, 'utf8'),
}))

const candidates = findCandidates(files)
const unreviewed = candidates.filter(entry => !(entry.component in REVIEWED))

console.log(`\n=== interactive components with no \`cursor\` of their own (${candidates.length}) ===`)
for (const entry of candidates) {
  const verdict = REVIEWED[entry.component]
  console.log(`  ${entry.component}  [${entry.tier}]`)
  console.log(`      ${entry.files.join('\n      ')}`)
  if (verdict)
    console.log(`      reviewed 2026-08-31: ${verdict}`)
}

console.log(
  unreviewed.length
    ? `\n${unreviewed.length} NOT yet reviewed: ${unreviewed.map(entry => entry.component).join(', ')}`
    + '\nCheck each one by hand before adding it to REVIEWED — inheriting a cursor from a'
    + '\nwrapper component or from `<a href>` is correct and must not be "fixed".'
    : '\nEvery candidate has a recorded verdict.',
)
