#!/usr/bin/env node
/**
 * Guards the permission guard's mapping table against silent gaps.
 *
 * `PermissionGuard.check()` returns `allowed: true` for any API name that matches no entry in
 * `API_PERMISSION_MAPPINGS`, so the model is an opt-in denylist keyed on a hand-maintained string
 * table (#915). Flipping that to default-deny needs an inventory of every name that legitimately
 * reaches the guard, which only production traffic can build — #1182 added the first-sighting warn
 * log for exactly that.
 *
 * This guards the other half, which needs no inventory: **every API name written at a call site
 * today must already be in the table.** It is currently true — all 70 guarded call sites match one
 * of the 50 patterns — so the value is prospective: adding a call site with an unmapped name stops
 * being a silent allow discovered in production logs, and becomes a red PR.
 *
 * The first version of this scan read only literals written directly at `enforcePermission`, and
 * found 19. Most guarded names are not written there: a module declares a local wrapper and passes
 * the literal to *that*, which accounted for the other 51 call sites — so roughly two thirds of
 * the guarded surface sat outside the gate, and an unmapped `enforce(context, 'flow:bus:new')`
 * left it reporting a cheerful all-clear. The wrapper rule below closes that.
 *
 * Deliberately not a vitest file. The `App suites (core-app)` job is `continue-on-error`, so a
 * test there cannot fail a PR; `PR Quality` runs these scripts as gates.
 *
 * Read-only. `--self-test` proves the detector fires, because a scanner that matches nothing looks
 * exactly like a clean repository.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const CORE_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(CORE_APP, 'src', 'main')
const GUARD = path.join('modules', 'permission', 'permission-guard.ts')

/**
 * `enforcePermission(pluginId, 'api:name', sdkapi)` — the second argument is the API name looked
 * up in the table. `withPermission({ permissionId })` is not scanned: it names a permission
 * directly and never consults the table, so it cannot have a mapping gap.
 */
const ENFORCE_CALL = /enforcePermission\s*\(\s*[^,()]+,\s*'([^']+)'/g

/**
 * Most guarded names never appear at `enforcePermission` at all.
 *
 * A module declares a local wrapper that forwards one of its parameters:
 *
 *     const enforce = (context, eventName, sdkapi) => { ... perm.enforcePermission(pluginId, eventName, sdkapi) }
 *     enforce(context, 'flow:bus:dispatch', payload)
 *
 * The literal is at the wrapper's call site, so the rule above cannot see it. That is not a corner
 * case: 51 of the 70 guarded call sites reach the guard this way against 19 written directly, so
 * most of the guarded surface sat outside a gate whose whole point is that nothing sits outside
 * it. Adding `enforce(context, 'flow:bus:new-thing', payload)` with no mapping stayed green and
 * silently allowed.
 *
 * One level of forwarding, within one file, is deliberate. It covers every wrapper in the tree and
 * needs no type information; a general dataflow analysis would be a different tool, and a gate
 * nobody can read is one nobody maintains.
 */
const WRAPPER_DECL = new RegExp(
  [
    // const enforce = (context, eventName, sdkapi) => …
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]+)?=>/.source,
    // function enforceNativePermission(context, apiName): void { … }
    /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.source
  ].join('|'),
  'g'
)

/**
 * Both entry points consult the table, so both can have a gap.
 *
 * `checkPermission` is not a softer case: `toPermissionState` reports `granted`/`denied` to the
 * renderer from it, so an unmapped name there tells the UI a capability is granted that was never
 * declared — the same silent allow, one layer further out.
 */
const FORWARDS_TO_GUARD =
  /(?:enforcePermission|checkPermission)\s*\(\s*[^,()]+,\s*([A-Za-z_$][\w$]*)\s*[,)]/

/**
 * Split on commas that are not inside a generic, call, index or object.
 *
 * `function toPermissionState(context: Pick<HandlerContext, 'plugin'>, apiName: string)` has a
 * comma inside the type argument. A naive split makes `apiName` parameter 2 instead of 1, the
 * call-site argument at that index does not exist, and the whole `native:*` family — 18 names —
 * drops out of the scan reporting a smaller number rather than an error.
 */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if ('<([{'.includes(character)) depth += 1
    else if ('>)]}'.includes(character)) depth -= 1

    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

/** Which parameter of a wrapper is forwarded as the API name, or -1. */
function forwardedParameterIndex(source, declIndex, parameters) {
  const forwarded = FORWARDS_TO_GUARD.exec(source.slice(declIndex, declIndex + 1200))
  if (!forwarded) return -1
  return parameters.findIndex((parameter) => parameter === forwarded[1])
}

/** Literal API names passed to a local wrapper that forwards them to enforcePermission. */
function collectWrappedNames(source, file) {
  const found = []
  for (const declaration of source.matchAll(WRAPPER_DECL)) {
    // The alternation puts the arrow form in groups 1-2 and the function form in 3-4.
    const name = declaration[1] ?? declaration[3]
    const rawParameters = declaration[2] ?? declaration[4]
    if (!name || rawParameters === undefined) continue
    const parameters = splitTopLevel(rawParameters)
      .map((parameter) => parameter.trim().split(/[:=]/)[0].trim())
      .filter((parameter) => parameter.length > 0)

    const index = forwardedParameterIndex(source, declaration.index, parameters)
    if (index < 0) continue

    // `name(a, b, c)` — take the argument in the forwarded position, literal only.
    const callSite = new RegExp(`(?<![\\w$.])${name}\\s*\\(([^)]*)\\)`, 'g')
    for (const call of source.matchAll(callSite)) {
      const argument = splitTopLevel(call[1])[index]?.trim()
      const literal = argument && /^'([^']+)'$/.exec(argument)
      if (!literal) continue
      found.push({
        file,
        line: source.slice(0, call.index).split('\n').length,
        apiName: literal[1]
      })
    }
  }
  return found
}

/** Patterns as written in API_PERMISSION_MAPPINGS. `*` matches any remaining characters. */
function readPatterns(source) {
  return [...source.matchAll(/pattern:\s*'([^']+)'/g)].map((match) => match[1])
}

function matchesPattern(apiName, pattern) {
  if (!pattern.includes('*')) return apiName === pattern
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(apiName)
}

function listSourceFiles() {
  const output = execFileSync('git', ['ls-files', 'src/main/**/*.ts'], {
    cwd: CORE_APP,
    encoding: 'utf8'
  })
  return output
    .split('\n')
    .map((line) => line.trim().replace(/^src\/main\//, ''))
    .filter((file) => file.length > 0 && !file.includes('.test.'))
}

function readFromDisk(file) {
  try {
    return readFileSync(path.join(SRC, file), 'utf8')
  } catch {
    return null
  }
}

/**
 * Every literal API name that reaches enforcePermission, with where it was written — both the
 * ones passed to it directly and the ones passed to a local wrapper that forwards them.
 */
function collectGuardedNames(read, files) {
  const found = []
  for (const file of files) {
    const source = read(file)
    if (!source) continue
    for (const match of source.matchAll(ENFORCE_CALL)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push({ file, line, apiName: match[1] })
    }
    found.push(...collectWrappedNames(source, file))
  }
  return found
}

function findUnmapped(read, files, patterns) {
  return collectGuardedNames(read, files).filter(
    (entry) => !patterns.some((pattern) => matchesPattern(entry.apiName, pattern))
  )
}

function selfTest() {
  const patterns = ['clipboard:read', 'native:screenshot:*']
  const cases = [
    {
      name: 'a call site with an unmapped name is caught',
      files: ['modules/some/new-handler.ts'],
      read: () => "perm.enforcePermission(pluginId, 'brand:new:capability', sdkapi)\n",
      expectUnmapped: 1
    },
    {
      name: 'an exact match is allowed',
      files: ['modules/some/new-handler.ts'],
      read: () => "perm.enforcePermission(pluginId, 'clipboard:read', sdkapi)\n",
      expectUnmapped: 0
    },
    {
      name: 'a wildcard pattern covers its children',
      files: ['modules/some/new-handler.ts'],
      read: () => "perm.enforcePermission(pluginId, 'native:screenshot:capture', sdkapi)\n",
      expectUnmapped: 0
    },
    {
      name: 'a wildcard does not leak across the namespace boundary it is written at',
      files: ['modules/some/new-handler.ts'],
      read: () => "perm.enforcePermission(pluginId, 'native:file:read', sdkapi)\n",
      expectUnmapped: 1
    },
    {
      name: 'withPermission is not policed: it names a permission, not an API',
      files: ['modules/some/new-handler.ts'],
      read: () => "withPermission({ permissionId: 'system.shell' }, handler)\n",
      expectUnmapped: 0
    },
    {
      name: 'an arrow wrapper forwarding its parameter is followed',
      files: ['modules/some/new-handler.ts'],
      read: () =>
        [
          'const enforce = (context, apiName, sdkapi) => {',
          '  perm.enforcePermission(pluginId, apiName, sdkapi)',
          '}',
          "enforce(context, 'brand:new:capability', payload)"
        ].join('\n'),
      expectUnmapped: 1
    },
    {
      name: 'a function-declaration wrapper is followed too',
      files: ['modules/some/new-handler.ts'],
      read: () =>
        [
          'function enforceNativePermission(context, apiName) {',
          '  permissionModule.enforcePermission(plugin.name, apiName, plugin.sdkapi)',
          '}',
          "enforceNativePermission(context, 'brand:new:capability')"
        ].join('\n'),
      expectUnmapped: 1
    },
    {
      name: 'a comma inside a generic does not shift the forwarded position',
      // The failure this pins is silent: a shifted index finds no argument, so the whole family
      // drops out of the scan and the gate reports a smaller number instead of an error.
      files: ['modules/some/new-handler.ts'],
      read: () =>
        [
          "function toPermissionState(context: Pick<HandlerContext, 'plugin'>, apiName: string) {",
          '  return permissionModule.checkPermission(plugin.name, apiName, plugin.sdkapi).allowed',
          '}',
          "toPermissionState(context, 'brand:new:capability')"
        ].join('\n'),
      expectUnmapped: 1
    },
    {
      name: 'a wrapper forwarding a mapped name is allowed',
      // Positive control for the two above: they are also satisfied by a wrapper rule that flags
      // everything it sees.
      files: ['modules/some/new-handler.ts'],
      read: () =>
        [
          'const enforce = (context, apiName, sdkapi) => {',
          '  perm.enforcePermission(pluginId, apiName, sdkapi)',
          '}',
          "enforce(context, 'clipboard:read', payload)"
        ].join('\n'),
      expectUnmapped: 0
    },
    {
      name: 'a wrapper that does not reach the guard is left alone',
      files: ['modules/some/new-handler.ts'],
      read: () =>
        [
          'const label = (context, apiName) => {',
          '  return `${context.id}:${apiName}`',
          '}',
          "label(context, 'brand:new:capability')"
        ].join('\n'),
      expectUnmapped: 0
    }
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = findUnmapped(testCase.read, testCase.files, patterns)
    const ok = found.length === testCase.expectUnmapped
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${testCase.expectUnmapped}, got ${found.length}`)
    }
  }

  // The scan must actually reach the real call sites; "zero unmapped" over zero names is vacuous.
  const realPatterns = readPatterns(readFromDisk(GUARD) ?? '')
  const realNames = collectGuardedNames(readFromDisk, listSourceFiles())
  const reaches = realPatterns.length > 0 && realNames.length > 0
  console.log(`${reaches ? 'ok  ' : 'FAIL'} the scan sees the real table and the real call sites`)
  if (!reaches) {
    failures += 1
    console.log(`     ${realPatterns.length} pattern(s), ${realNames.length} guarded name(s)`)
  }

  // A floor, not an equality: new guarded call sites are expected, silent shrinkage is not.
  // The wrapper rule is the fragile part — a parameter-position mistake makes a whole family
  // vanish from the scan and the gate still prints a cheerful all-clear, which is how the
  // direct-literals-only version passed for months while missing two thirds of the surface.
  const FLOOR = 60
  const covers = realNames.length >= FLOOR
  console.log(
    `${covers ? 'ok  ' : 'FAIL'} the scan still covers at least ${FLOOR} guarded call sites`
  )
  if (!covers) {
    failures += 1
    console.log(
      `     found ${realNames.length}; a drop means the detector stopped seeing a family, not that the code shrank`
    )
  }
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const guardSource = readFromDisk(GUARD)
if (!guardSource) {
  console.error(`[permission-api-mappings] cannot read ${GUARD}`)
  process.exit(1)
}

const patterns = readPatterns(guardSource)
if (patterns.length === 0) {
  console.error('[permission-api-mappings] API_PERMISSION_MAPPINGS yielded no patterns')
  process.exit(1)
}

const files = listSourceFiles()
const guardedNames = collectGuardedNames(readFromDisk, files)
const unmapped = findUnmapped(readFromDisk, files, patterns)

if (unmapped.length > 0) {
  console.error('[permission-api-mappings] API names with no entry in API_PERMISSION_MAPPINGS:\n')
  for (const entry of unmapped) {
    console.error(`  - ${entry.file}:${entry.line} enforces "${entry.apiName}"`)
  }
  console.error(
    '\nPermissionGuard.check() returns allowed:true for a name it cannot map, so this call site' +
      '\nis currently ungated for every plugin (#915). Add a pattern to API_PERMISSION_MAPPINGS' +
      '\nnaming the permission it requires, or — if it is deliberately public — map it to an' +
      '\nempty permission list so the intent is written down rather than inferred from silence.'
  )
  process.exit(1)
}

console.log(
  `[permission-api-mappings] ${guardedNames.length} guarded API name(s) all match one of ` +
    `${patterns.length} mapping pattern(s)`
)
