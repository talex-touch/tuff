#!/usr/bin/env node
/**
 * Fails when a plugin returns a permission-family blocked reason that is not the canonical spelling.
 *
 * #1711 asked for the reason strings to be defined in one place and for `plugins/*` to import that
 * definition. The first half is `packages/utils/plugin/blocked-reasons.ts`. The second half is not
 * reachable: plugin Preludes take everything from `globalThis` and not one of the 24 `index.js`
 * files contains an `import` or a `require`, so there is nothing to import into. This script
 * supplies the property the import would have given -- a misspelled reason fails the build rather
 * than sitting there silently.
 *
 * Only the permission family is enforced. 20 of the 34 reasons measured across `plugins/` belong to
 * exactly one plugin and describe that plugin's own domain; a plugin inventing
 * `workspace-script-failed` needs nobody's agreement. A plugin writing `permission_denied` is
 * claiming to speak a shared language and getting it wrong, and both sides fail silently: a reason
 * nobody handles is indistinguishable from a handler for a reason nobody emits.
 *
 * The canonical list is parsed out of the TypeScript source rather than repeated here, because a
 * second copy of the list is the defect this is meant to prevent.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'packages/utils/plugin/blocked-reasons.ts'
const PLUGIN_ROOT = 'plugins'

/** `reason: 'x'`, `reason = 'x'` and `reason('x')`, single or double quoted. */
const REASON_LITERAL = /reason\s*[:=(]\s*['"]([a-z0-9][a-z0-9_-]*)['"]/g

/**
 * A reason that claims membership in the permission family.
 *
 * Deliberately wider than the canonical list: `permission_denied` and `permissions-denied` have to
 * be *caught*, and they are only catchable by matching the family loosely and then checking
 * membership. Matching the canonical list alone would let every typo through as "not a permission
 * reason".
 */
const CLAIMS_PERMISSION_FAMILY = /permission|capabilit/i

/** `KEY: 'value'` pairs out of the `PLUGIN_BLOCKED_REASONS` object literal. */
export function parseReasonMap(source) {
  const start = source.indexOf('export const PLUGIN_BLOCKED_REASONS')
  if (start < 0)
    return new Map()
  const end = source.indexOf('} as const', start)
  if (end < 0)
    return new Map()
  const body = source.slice(start, end)
  const map = new Map()
  for (const match of body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/gm))
    map.set(match[1], match[2])
  return map
}

/** The `PLUGIN_BLOCKED_REASONS.X` references inside `PLUGIN_PERMISSION_BLOCKED_REASONS`, resolved. */
export function parsePermissionFamily(source, reasonMap) {
  const start = source.indexOf('export const PLUGIN_PERMISSION_BLOCKED_REASONS')
  if (start < 0)
    return []
  // From `= [`, not from the declaration: the real one is annotated
  // `: readonly PluginBlockedReason[] =`, whose `[]` comes first and closed the slice on nothing.
  // The empty-allowlist guard in main() is what surfaced that -- an allowlist of zero passes
  // everything, so it has to be an error rather than a quiet success.
  const open = source.indexOf('= [', start)
  if (open < 0)
    return []
  const end = source.indexOf(']', open + 3)
  if (end < 0)
    return []
  const body = source.slice(open, end)
  const resolved = []
  for (const match of body.matchAll(/PLUGIN_BLOCKED_REASONS\.([A-Z][A-Z0-9_]*)/g)) {
    const value = reasonMap.get(match[1])
    if (value)
      resolved.push(value)
  }
  return resolved
}

export function findOffenders(files, readFile, canonical) {
  const allowed = new Set(canonical)
  const offenders = []
  let scanned = 0
  for (const file of files) {
    const contents = readFile(file)
    const lines = contents.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      REASON_LITERAL.lastIndex = 0
      for (const match of line.matchAll(REASON_LITERAL)) {
        scanned += 1
        const reason = match[1]
        if (!CLAIMS_PERMISSION_FAMILY.test(reason))
          continue
        if (!allowed.has(reason))
          offenders.push({ file, line: index + 1, reason })
      }
    }
  }
  return { offenders, scanned }
}

function collectPluginFiles(dir = PLUGIN_ROOT) {
  const absolute = path.join(repoRoot, dir)
  if (!fs.existsSync(absolute))
    return []
  const files = []
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue
    const pluginDir = path.join(absolute, entry.name)
    for (const name of fs.readdirSync(pluginDir)) {
      if (name === 'index.js' || name.endsWith('.test.cjs'))
        files.push(path.posix.join(dir, entry.name, name))
    }
  }
  return files
}

function main() {
  const sourcePath = path.join(repoRoot, SOURCE)
  if (!fs.existsSync(sourcePath)) {
    console.error(`${SOURCE} is missing; the canonical reasons cannot be read.`)
    return 1
  }
  const source = fs.readFileSync(sourcePath, 'utf8')
  const canonical = parsePermissionFamily(source, parseReasonMap(source))
  if (canonical.length === 0) {
    console.error(
      `No permission reasons parsed out of ${SOURCE}. Either the file changed shape or the parser`
      + ' broke -- refusing to report success on an empty allowlist, which would pass everything.',
    )
    return 1
  }

  const files = collectPluginFiles()
  const { offenders, scanned } = findOffenders(
    files,
    file => fs.readFileSync(path.join(repoRoot, file), 'utf8'),
    canonical,
  )
  if (scanned === 0) {
    console.error(
      `Scanned ${files.length} plugin file(s) and found no reason literals at all. That is not a`
      + ' pass; the scan is broken.',
    )
    return 1
  }

  if (offenders.length > 0) {
    console.error('Plugin returns a permission-family reason that is not the canonical spelling:\n')
    for (const entry of offenders)
      console.error(`  ${entry.file}:${entry.line}  ->  ${entry.reason}`)
    console.error(`\nCanonical (${SOURCE}): ${canonical.join(', ')}`)
    console.error(
      '\nA reason nobody handles looks exactly like a handler for a reason nobody emits, which is'
      + ' why this is a build failure rather than a lint warning (#1711).',
    )
    return 1
  }

  console.log(
    `check-plugin-blocked-reasons: ${scanned} reason literal(s) across ${files.length} plugin `
    + `file(s); every permission-family one matches the ${canonical.length} canonical spellings.`,
  )
  return 0
}

function selfTest() {
  const source = [
    'export const PLUGIN_BLOCKED_REASONS = {',
    '  PERMISSION_DENIED: \'permission-denied\',',
    '  CAPABILITY_UNAVAILABLE: \'capability-unavailable\',',
    '  TIMEOUT: \'timeout\',',
    '} as const',
    'export const PLUGIN_PERMISSION_BLOCKED_REASONS = [',
    '  PLUGIN_BLOCKED_REASONS.PERMISSION_DENIED,',
    '  PLUGIN_BLOCKED_REASONS.CAPABILITY_UNAVAILABLE,',
    ']',
  ].join('\n')
  const reasonMap = parseReasonMap(source)
  const canonical = parsePermissionFamily(source, reasonMap)
  const check = contents =>
    findOffenders(['p/index.js'], () => contents, canonical)

  const cases = [
    { name: 'the object literal is parsed', actual: reasonMap.get('PERMISSION_DENIED'), expected: 'permission-denied' },
    { name: 'a non-permission entry is parsed too', actual: reasonMap.get('TIMEOUT'), expected: 'timeout' },
    { name: 'the family resolves through the references', actual: canonical.join(','), expected: 'permission-denied,capability-unavailable' },
    { name: 'the family excludes what it does not list', actual: canonical.includes('timeout'), expected: false },
    { name: 'a canonical reason passes', actual: check('reason: \'permission-denied\'').offenders.length, expected: 0 },
    { name: 'an underscore typo is caught', actual: check('reason: \'permission_denied\'').offenders[0]?.reason, expected: 'permission_denied' },
    { name: 'a pluralised typo is caught', actual: check('reason: \'permissions-denied\'').offenders[0]?.reason, expected: 'permissions-denied' },
    { name: 'an invented permission reason is caught', actual: check('reason: \'permission-expired\'').offenders[0]?.reason, expected: 'permission-expired' },
    { name: 'a capability typo is caught', actual: check('reason: \'capability_unavailable\'').offenders[0]?.reason, expected: 'capability_unavailable' },
    // The open half. 20 of 34 reasons belong to one plugin; enforcing them would be wrong.
    { name: 'a plugin-private reason is left alone', actual: check('reason: \'workspace-script-failed\'').offenders.length, expected: 0 },
    { name: 'an unrelated shared reason is left alone', actual: check('reason: \'clipboard-unavailable\'').offenders.length, expected: 0 },
    { name: 'reason = form is scanned', actual: check('const reason = \'permission_denied\'').offenders.length, expected: 1 },
    { name: 'reason( form is scanned', actual: check('blocked(reason(\'permission_denied\'))').offenders.length, expected: 1 },
    { name: 'double quotes are scanned', actual: check('reason: "permission_denied"').offenders.length, expected: 1 },
    { name: 'the line number is reported', actual: check('x\nreason: \'permission_denied\'').offenders[0]?.line, expected: 2 },
    { name: 'two offenders on one line are both caught', actual: check('reason: \'permission_denied\', reason: \'capability_x\'').offenders.length, expected: 2 },
    { name: 'scanned counts every literal, not just offenders', actual: check('reason: \'timeout\'').scanned, expected: 1 },
    { name: 'a file with no reasons scans nothing', actual: check('const x = 1').scanned, expected: 0 },
    { name: 'a missing object literal yields an empty map', actual: parseReasonMap('nothing here').size, expected: 0 },
    { name: 'a missing family yields an empty list', actual: parsePermissionFamily('nothing here', reasonMap).length, expected: 0 },
    { name: 'a reference to an unknown key is dropped', actual: parsePermissionFamily('export const PLUGIN_PERMISSION_BLOCKED_REASONS = [PLUGIN_BLOCKED_REASONS.NOPE]', reasonMap).length, expected: 0 },
    // The shape the real file actually has. The first version of this self-test used the
    // unannotated form, passed 21 of 21, and the parser still returned nothing against the source
    // it was written for -- the `[]` in `readonly PluginBlockedReason[]` closed the slice early.
    {
      name: 'a type-annotated declaration is parsed',
      actual: parsePermissionFamily(
        'export const PLUGIN_PERMISSION_BLOCKED_REASONS: readonly PluginBlockedReason[] = [\n  PLUGIN_BLOCKED_REASONS.PERMISSION_DENIED,\n]',
        reasonMap,
      ).join(','),
      expected: 'permission-denied',
    },
  ]

  let failed = 0
  for (const testCase of cases) {
    if (!Object.is(testCase.actual, testCase.expected)) {
      failed += 1
      console.error(`  x ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `check-plugin-blocked-reasons --self-test: ${cases.length} cases passed`
      : `check-plugin-blocked-reasons --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)
else process.exit(main())
