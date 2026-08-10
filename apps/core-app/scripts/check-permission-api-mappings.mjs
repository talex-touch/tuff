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
 * today must already be in the table.** It is currently true — all 12 literals reaching
 * `enforcePermission` match a pattern — so the value is prospective: adding a call site with an
 * unmapped name stops being a silent allow discovered in production logs, and becomes a red PR.
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

/** Patterns as written in API_PERMISSION_MAPPINGS. `*` matches any remaining characters. */
function readPatterns(source) {
  return [...source.matchAll(/pattern:\s*'([^']+)'/g)].map(match => match[1])
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
    .map(line => line.trim().replace(/^src\/main\//, ''))
    .filter(file => file.length > 0 && !file.includes('.test.'))
}

function readFromDisk(file) {
  try {
    return readFileSync(path.join(SRC, file), 'utf8')
  } catch {
    return null
  }
}

/** Every literal API name passed to enforcePermission, with where it was written. */
function collectGuardedNames(read, files) {
  const found = []
  for (const file of files) {
    const source = read(file)
    if (!source) continue
    for (const match of source.matchAll(ENFORCE_CALL)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push({ file, line, apiName: match[1] })
    }
  }
  return found
}

function findUnmapped(read, files, patterns) {
  return collectGuardedNames(read, files).filter(
    entry => !patterns.some(pattern => matchesPattern(entry.apiName, pattern))
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
