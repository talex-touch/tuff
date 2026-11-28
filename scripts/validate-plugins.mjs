#!/usr/bin/env node

/**
 * Build-time plugin validation script.
 * Scans plugins/ directory and validates each plugin's manifest, entry point,
 * permission IDs, and feature commands structure.
 *
 * Exit code 1 on any error-level issue.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
// TUFF_PLUGINS_DIR lets the gate's own tests point it at a fixture tree. Without it the only way
// to prove the checks fire is to break a real plugin, which is how a gate ends up untested.
const pluginsDir = process.env.TUFF_PLUGINS_DIR
  ? path.resolve(process.env.TUFF_PLUGINS_DIR)
  : path.resolve(rootDir, 'plugins')

// Known permission IDs from packages/utils/permission/registry.ts
const KNOWN_PERMISSION_IDS = new Set([
  'fs.read',
  'fs.write',
  'fs.execute',
  'fs.tfile',
  'fs.index',
  'clipboard.read',
  'clipboard.write',
  'network.local',
  'network.internet',
  'network.download',
  'system.applications',
  'system.shell',
  'system.notification',
  'system.tray',
  'intelligence.basic',
  'intelligence.admin',
  'intelligence.agents',
  'intelligence.context',
  'voice.dictation',
  'storage.plugin',
  'storage.shared',
  'search.root-results',
  'window.create',
  'window.capture',
  // Added when the drift below was measured: the registry had 27 ids, this set had 22.
  'storage.sqlite',
  'media.read',
  'i18n.read',
  'lexicon.read',
  'lexicon.register',
  'account.read',
])

const NPM_DISCOVERY_KEYWORDS = new Set(['tuff-plugin', 'talex-touch-plugin'])

function resolveSearchProviderPermissionIds(scopes = []) {
  const permissionIds = scopes.flatMap((scope) => {
    switch (scope) {
      case 'root-results':
        return ['search.root-results']
      case 'file-system':
        return ['fs.index']
      case 'browser-data':
        return ['fs.read']
      case 'network':
        return ['network.internet']
      case 'account':
        return ['account.read']
      case 'external-tool':
      case 'system-index':
      case 'none':
      default:
        return []
    }
  })

  return Array.from(new Set(permissionIds))
}

let hasErrors = false
let totalPlugins = 0
let passedPlugins = 0
let pushPluginCount = 0
let explicitSearchProviderPluginCount = 0
const searchProviderMigrationWarnings = []

function logError(pluginName, message) {
  console.error(`  \x1B[31m✗\x1B[0m [${pluginName}] ${message}`)
  hasErrors = true
}

function logWarn(pluginName, message) {
  console.warn(`  \x1B[33m!\x1B[0m [${pluginName}] ${message}`)
}

function logOk(pluginName, message) {
  console.log(`  \x1B[32m✓\x1B[0m [${pluginName}] ${message}`)
}

// Discover plugin directories
if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
const pluginDirs = entries
  .filter(e => e.isDirectory())
  .map(e => e.name)

console.log(`\nValidating ${pluginDirs.length} plugins in plugins/\n`)

// Discovery returning nothing is not a pass. Every rule below -- dev leakage, the manifest
// feature.platform shape, search-provider migration -- applies per plugin, so an empty list
// makes the run assert nothing while still printing success and exiting 0. A moved directory,
// a bad path after a refactor, or a partial checkout all land here (#1586).
if (discoveryFoundNothing(pluginDirs)) {
  console.error('\x1B[31mNo plugin directories found in plugins/ — validation would pass without checking anything.\x1B[0m\n')
  process.exit(1)
}

/**
 * Fails a plugin that ships with its development loader switched on.
 *
 * `dev.enable: true` makes the runtime fetch the Surface from `dev.address` — a localhost port —
 * instead of the packaged files, so a committed one is a plugin that silently does nothing on a
 * user's machine. AGENTS.md cites `pnpm plugins:validate` as the manifest gate, and it did not
 * look at the dev block at all: three manifests shipped `dev.enable: true` while it reported
 * 24/24 passed (#812).
 *
 * Both sources are checked. The block lives in `manifest.json` for most plugins and in
 * `package.json` under `talex-touch.plugin.dev` for package-backed ones — and the second is where
 * it was actually still hiding, in a directory the manifest check skips entirely.
 *
 * @returns true when the plugin should fail.
 */
function checkDevLeakage(pluginName, dev, source) {
  if (!dev || dev.enable !== true)
    return false
  const address = typeof dev.address === 'string' ? ` (${dev.address})` : ''
  logError(pluginName, `${source} ships dev.enable: true${address} — the runtime would load the Surface from a dev server instead of the packaged files`)
  return true
}

/**
 * A manifest feature's `platform` must be `{ win32, darwin, linux }` booleans (#820).
 *
 * There are two platform shapes in this codebase and they are easy to confuse:
 *
 * - **manifest** — `{ win32: boolean, darwin: boolean, linux: boolean }`. All 20 manifests use
 *   it, so it is the de-facto convention, and this is the one enforced here.
 * - **runtime registration** — `{ win|darwin|linux: { enable, arch, os } }`, the `IPlatform` type,
 *   which the host validates with `exactRecord` when a Prelude calls `features.addFeature`.
 *
 * `touch-browser-open` uses both — the manifest shape in `manifest.json` and the runtime shape in
 * `index.js` — which is how you can hold them side by side and still write the wrong one.
 *
 * This pins the shape only. Nothing in the main process reads a manifest feature's `platform`, so
 * the declarations are inert; whether they should gate registration is on #820.
 *
 * @returns true when the plugin should fail.
 */
function checkFeaturePlatformShape(pluginName, features) {
  const MANIFEST_KEYS = ['win32', 'darwin', 'linux']
  let failed = false

  for (const feature of Array.isArray(features) ? features : []) {
    const platform = feature?.platform
    if (platform === undefined)
      continue

    const id = feature.id || feature.name || '<unnamed>'
    if (platform === null || typeof platform !== 'object' || Array.isArray(platform)) {
      logError(pluginName, `feature "${id}" has a non-object "platform"`)
      failed = true
      continue
    }

    const keys = Object.keys(platform).sort()
    if (keys.join(',') !== [...MANIFEST_KEYS].sort().join(',')) {
      const runtimeShaped = keys.includes('win') || keys.some(key => typeof platform[key] === 'object')
      const hint = runtimeShaped ? ' — that is the runtime addFeature shape, which a manifest is not read as' : ''
      logError(
        pluginName,
        `feature "${id}" declares platform keys [${keys.join(', ')}]; a manifest needs exactly [${MANIFEST_KEYS.join(', ')}]${hint}`,
      )
      failed = true
      continue
    }

    for (const key of MANIFEST_KEYS) {
      if (typeof platform[key] !== 'boolean') {
        logError(pluginName, `feature "${id}" platform.${key} must be a boolean (received ${JSON.stringify(platform[key])})`)
        failed = true
      }
    }
  }

  return failed
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Enforce official monorepo npm package naming (`@talex-touch/<dir>-plugin`).
 *
 * @returns true when the plugin should fail.
 */
export function checkPackageNaming(pluginName, packageManifest) {
  if (!packageManifest)
    return false
  const expectedPackageName = `@talex-touch/${pluginName}-plugin`
  if (packageManifest.name !== expectedPackageName) {
    logError(
      pluginName,
      `package.json name must be "${expectedPackageName}" (received "${packageManifest.name || '<missing>'}")`,
    )
    return true
  }
  return false
}

/**
 * Validate `package.json` <-> `manifest.json` parity for package-backed plugins:
 * - exact version parity (`package.json.version === manifest.json.version`)
 * - discovery `keywords` (`tuff-plugin` / legacy `talex-touch-plugin`)
 * - canonical `tuff` metadata block parity (`schemaVersion`, `id`, `name`, `sdkapi`, `category`)
 *
 * Manifest-only plugins (including retired tombstones without `package.json`) pass cleanly.
 *
 * @returns true when the plugin should fail.
 */
export function checkPackageManifestParity(pluginName, packageManifest, manifest) {
  if (!packageManifest || !manifest)
    return false

  let failed = false
  const isPublishable = packageManifest.private !== true

  // 1. Version parity (strict for every package-backed plugin with a manifest)
  const pkgVersion = typeof packageManifest.version === 'string' ? packageManifest.version.trim() : ''
  const manifestVersion = typeof manifest.version === 'string' ? manifest.version.trim() : ''
  if (!pkgVersion) {
    logError(pluginName, 'package.json is missing required field "version"')
    failed = true
  }
  else if (manifestVersion && pkgVersion !== manifestVersion) {
    logError(
      pluginName,
      `package.json version "${pkgVersion}" does not match manifest.json version "${manifestVersion}"`,
    )
    failed = true
  }

  // 2. Discovery keywords (`tuff-plugin`)
  if (packageManifest.keywords !== undefined) {
    if (
      !Array.isArray(packageManifest.keywords)
      || packageManifest.keywords.some(kw => typeof kw !== 'string' || !kw.trim())
    ) {
      logError(pluginName, 'package.json "keywords" must be an array of non-empty strings')
      failed = true
    }
    else {
      const hasDiscoveryKeyword = packageManifest.keywords.some(kw =>
        NPM_DISCOVERY_KEYWORDS.has(kw.trim().toLowerCase()),
      )
      if (!hasDiscoveryKeyword) {
        logError(pluginName, 'package.json "keywords" must include "tuff-plugin"')
        failed = true
      }
    }
  }
  else if (isPublishable) {
    logError(pluginName, 'publishable package.json must declare "keywords" including "tuff-plugin"')
    failed = true
  }

  // 3. Canonical `tuff` block parity (with legacy `tuffPlugin` fallback warning)
  const hasTuff = packageManifest.tuff !== undefined
  const hasLegacyTuffPlugin = packageManifest.tuffPlugin !== undefined

  if (hasLegacyTuffPlugin && !hasTuff) {
    logWarn(pluginName, 'package.json uses legacy "tuffPlugin" block — migrate to canonical "tuff"')
  }

  const rawTuff = hasTuff ? packageManifest.tuff : packageManifest.tuffPlugin
  const blockName = hasTuff ? 'tuff' : 'tuffPlugin'

  if (rawTuff !== undefined) {
    if (!isPlainObject(rawTuff)) {
      logError(pluginName, `package.json "${blockName}" must be a plain object`)
      failed = true
    }
    else {
      if (rawTuff.schemaVersion !== undefined && rawTuff.schemaVersion !== 1) {
        logError(
          pluginName,
          `package.json ${blockName}.schemaVersion must be 1 (received ${JSON.stringify(rawTuff.schemaVersion)})`,
        )
        failed = true
      }
      if (rawTuff.id !== undefined && manifest.id && rawTuff.id !== manifest.id) {
        logError(
          pluginName,
          `package.json ${blockName}.id "${rawTuff.id}" does not match manifest.json id "${manifest.id}"`,
        )
        failed = true
      }
      if (rawTuff.name !== undefined && manifest.name && rawTuff.name !== manifest.name) {
        logError(
          pluginName,
          `package.json ${blockName}.name "${rawTuff.name}" does not match manifest.json name "${manifest.name}"`,
        )
        failed = true
      }
      if (
        rawTuff.sdkapi !== undefined
        && manifest.sdkapi !== undefined
        && Number(rawTuff.sdkapi) !== Number(manifest.sdkapi)
      ) {
        logError(
          pluginName,
          `package.json ${blockName}.sdkapi (${rawTuff.sdkapi}) does not match manifest.json sdkapi (${manifest.sdkapi})`,
        )
        failed = true
      }
      if (rawTuff.category !== undefined && manifest.category && rawTuff.category !== manifest.category) {
        logError(
          pluginName,
          `package.json ${blockName}.category "${rawTuff.category}" does not match manifest.json category "${manifest.category}"`,
        )
        failed = true
      }
    }
  }
  else if (isPublishable) {
    logError(pluginName, 'publishable package.json must declare a canonical "tuff" metadata block')
    failed = true
  }

  return failed
}

/**
 * Resolve a manifest entry point and verify it stays strictly within `pluginPath`
 * (blocking `../` traversal, absolute paths, and symlink escapes).
 *
 * @returns {string | null} Resolved absolute path inside `pluginPath`, or `null` if escaped/invalid.
 */
export function resolveContainedEntryPath(pluginPath, entryFile) {
  if (typeof entryFile !== 'string' || !entryFile.trim() || entryFile.includes('\0'))
    return null
  const resolvedRoot = path.resolve(pluginPath)
  const resolvedEntry = path.resolve(resolvedRoot, entryFile)
  const rel = path.relative(resolvedRoot, resolvedEntry)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
    return null
  if (fs.existsSync(resolvedEntry)) {
    try {
      const realRoot = fs.realpathSync(resolvedRoot)
      const realEntry = fs.realpathSync(resolvedEntry)
      const realRel = path.relative(realRoot, realEntry)
      if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel))
        return null
    }
    catch {
      return null
    }
  }
  return resolvedEntry
}

for (const pluginName of pluginDirs) {
  totalPlugins++
  const pluginPath = path.join(pluginsDir, pluginName)
  const packageJsonPath = path.join(pluginPath, 'package.json')
  const manifestPath = path.join(pluginPath, 'manifest.json')
  const hasPackageJson = fs.existsSync(packageJsonPath)
  let packageManifest = null
  let pluginHasError = false

  // 1. Package-backed plugins use the scoped runtime-id package convention.
  if (hasPackageJson) {
    try {
      packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      if (checkPackageNaming(pluginName, packageManifest))
        pluginHasError = true
      if (checkDevLeakage(pluginName, packageManifest?.['talex-touch']?.plugin?.dev, 'package.json'))
        pluginHasError = true
    }
    catch (e) {
      logError(pluginName, `package.json parse error: ${e.message}`)
      pluginHasError = true
    }
  }

  // 2. Check manifest.json exists and is valid JSON
  if (!fs.existsSync(manifestPath)) {
    // Package-backed directories may be Surface-only; manifest-only runtime plugins intentionally have no npm package.
    logWarn(pluginName, hasPackageJson ? 'manifest.json not found — skipping Surface-only plugin' : 'manifest.json not found — skipping')
    if (!pluginHasError)
      passedPlugins++
    continue
  }

  let manifest
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw)
  }
  catch (e) {
    logError(pluginName, `manifest.json parse error: ${e.message}`)
    pluginHasError = true
    continue
  }

  if (checkPackageManifestParity(pluginName, packageManifest, manifest))
    pluginHasError = true

  if (checkDevLeakage(pluginName, manifest?.dev, 'manifest.json'))
    pluginHasError = true

  if (checkFeaturePlatformShape(pluginName, manifest?.features))
    pluginHasError = true

  // 2. Required fields: id (or name), name, version
  if (!manifest.name) {
    logError(pluginName, 'Missing required field "name" in manifest.json')
    pluginHasError = true
  }
  if (!manifest.version) {
    logError(pluginName, 'Missing required field "version" in manifest.json')
    pluginHasError = true
  }

  // 3. Entry point exists + syntax check
  const entryFile = manifest.main || manifest.build?.index?.entry || 'index.js'
  const entryPath = resolveContainedEntryPath(pluginPath, entryFile)
  if (!entryPath) {
    logError(pluginName, `Entry file "${entryFile}" resolves outside plugin directory`)
    pluginHasError = true
  }
  else if (!fs.existsSync(entryPath)) {
    logWarn(pluginName, `Entry file "${entryFile}" not found (plugin may be UI-only)`)
  }
  else if (/\.[cm]?js$/i.test(entryFile)) {
    try {
      execFileSync(process.execPath, ['-c', entryPath], { stdio: 'pipe' })
    }
    catch (e) {
      logError(pluginName, `Syntax error in ${entryFile}: ${e.stderr?.toString().trim() || e.message}`)
      pluginHasError = true
    }
  }

  // 4. Permission ID validation
  const declaredPermissionIds = new Set()
  if (manifest.permissions) {
    const rawIds = Array.isArray(manifest.permissions)
      ? manifest.permissions
      : [
          ...(manifest.permissions.required || []),
          ...(manifest.permissions.optional || []),
        ]
    rawIds
      .filter(id => typeof id === 'string')
      .forEach(id => declaredPermissionIds.add(id))
    const unknownIds = rawIds.filter(id => typeof id === 'string' && !KNOWN_PERMISSION_IDS.has(id))
    if (unknownIds.length > 0) {
      // logError, not logWarn: a warning does not affect the exit code, so a manifest
      // asking for a permission the runtime does not define passed CI silently. All 24
      // plugins are clean today, so this fails nothing that currently works (#735).
      logError(pluginName, `Unknown permission IDs: ${unknownIds.join(', ')}`)
      pluginHasError = true
    }
  }

  // 5. Feature commands structure
  if (Array.isArray(manifest.features)) {
    for (const feature of manifest.features) {
      if (!feature.commands || !Array.isArray(feature.commands)) {
        logWarn(pluginName, `Feature "${feature.name || feature.id}" has missing/invalid "commands"`)
      }
    }
  }

  // 6. Search provider migration visibility
  const pushFeatures = Array.isArray(manifest.features)
    ? manifest.features.filter(feature => feature?.push === true)
    : []
  const searchProviders = Array.isArray(manifest.searchProviders)
    ? manifest.searchProviders
    : []
  if (pushFeatures.length > 0) {
    pushPluginCount++
    if (searchProviders.length > 0) {
      explicitSearchProviderPluginCount++
    }
  }
  if (pushFeatures.length > 0 && searchProviders.length === 0) {
    searchProviderMigrationWarnings.push({
      pluginName,
      manifestPath: path.relative(rootDir, manifestPath),
      pushFeatureIds: pushFeatures.map(feature => feature.id || feature.name || '<unknown>'),
    })
    logWarn(
      pluginName,
      `Push features should declare manifest.searchProviders explicitly: ${pushFeatures
        .map(feature => feature.id || feature.name || '<unknown>')
        .join(', ')}`,
    )
  }
  for (const provider of searchProviders) {
    if (!provider || typeof provider.id !== 'string') {
      logError(pluginName, 'Invalid search provider declaration: missing provider id')
      pluginHasError = true
      continue
    }
    if (!Array.isArray(provider.permissionScopes)) {
      logError(pluginName, `Search provider "${provider.id}" has invalid permissionScopes`)
      pluginHasError = true
      continue
    }

    const missingPermissionIds = resolveSearchProviderPermissionIds(provider.permissionScopes)
      .filter(permissionId => !declaredPermissionIds.has(permissionId))
    if (missingPermissionIds.length > 0) {
      logError(
        pluginName,
        `Search provider "${provider.id}" requires manifest permissions: ${missingPermissionIds.join(', ')}`,
      )
      pluginHasError = true
    }
  }

  if (!pluginHasError) {
    passedPlugins++
    logOk(pluginName, `OK (v${manifest.version}, ${(manifest.features || []).length} features)`)
  }
}

console.log(`\n${passedPlugins}/${totalPlugins} plugins passed validation.\n`)

if (pushPluginCount > 0) {
  console.log(
    `Search provider coverage: ${explicitSearchProviderPluginCount}/${pushPluginCount} push plugins declare manifest.searchProviders.\n`,
  )
}

if (searchProviderMigrationWarnings.length > 0) {
  console.warn('\x1B[33mSearch provider migration warnings:\x1B[0m')
  for (const warning of searchProviderMigrationWarnings) {
    console.warn(
      `  - ${warning.pluginName}: ${warning.pushFeatureIds.join(', ')} (${warning.manifestPath})`,
    )
  }
  console.warn(
    '  Add manifest.searchProviders with mode "push" and permissionScopes ["root-results"] to avoid compatibility-derived providers.\n',
  )
}

if (hasErrors) {
  console.error('\x1B[31mValidation failed with errors.\x1B[0m\n')
  process.exit(1)
}
else {
  console.log('\x1B[32mAll plugins validated successfully.\x1B[0m\n')
}

/**
 * Discovery returning nothing is not a pass (#1586). Pulled out of the call site so `--self-test`
 * can reach it: the rule it encodes is exactly the one that cannot be observed from a normal run,
 * because a validator that checked nothing looks identical to one where nothing was wrong.
 */
export function discoveryFoundNothing(pluginDirs) {
  return !Array.isArray(pluginDirs) || pluginDirs.length === 0
}

/**
 * Proves the detectors fire. Every case here is a manifest this script must reject; if a refactor
 * makes one of them pass, CI says so instead of reporting a clean sweep over inputs it stopped
 * reading. Mirrors the shape used by check-plugin-lint-coverage.mjs and check-action-pins.mjs.
 */
function selfTest() {
  const cases = [
    {
      name: 'discovery finding nothing fails rather than reporting success',
      run: () => discoveryFoundNothing([]),
      expect: true,
    },
    {
      name: 'discovery finding plugins does not fail',
      run: () => discoveryFoundNothing(['touch-snipaste']),
      expect: false,
    },
    {
      name: 'a committed dev.enable is caught',
      run: () => checkDevLeakage('probe', { enable: true, address: 'http://localhost:3333/' }, 'manifest.json'),
      expect: true,
    },
    {
      name: 'dev.enable false is allowed',
      run: () => checkDevLeakage('probe', { enable: false }, 'manifest.json'),
      expect: false,
    },
    {
      name: 'the runtime addFeature platform shape is rejected in a manifest',
      run: () => checkFeaturePlatformShape('probe', [{ id: 'f', platform: { win: { enable: true, arch: [], os: [] } } }]),
      expect: true,
    },
    {
      name: 'a non-boolean manifest platform value is rejected',
      run: () => checkFeaturePlatformShape('probe', [{ id: 'f', platform: { win32: 'yes', darwin: false, linux: false } }]),
      expect: true,
    },
    {
      name: 'the manifest platform shape is accepted',
      run: () => checkFeaturePlatformShape('probe', [{ id: 'f', platform: { win32: true, darwin: false, linux: false } }]),
      expect: false,
    },
    {
      name: 'official package naming mismatch is rejected',
      run: () => checkPackageNaming('touch-demo', { name: 'touch-demo' }),
      expect: true,
    },
    {
      name: 'official @talex-touch/<dir>-plugin package naming is accepted',
      run: () => checkPackageNaming('touch-demo', { name: '@talex-touch/touch-demo-plugin' }),
      expect: false,
    },
    {
      name: 'package.json and manifest.json version mismatch is rejected',
      run: () => checkPackageManifestParity(
        'touch-demo',
        { name: '@talex-touch/touch-demo-plugin', version: '1.0.0', private: true },
        { id: 'com.tuffex.demo', name: 'touch-demo', version: '1.0.1', sdkapi: 261011, category: 'utilities' },
      ),
      expect: true,
    },
    {
      name: 'declared keywords without tuff-plugin are rejected',
      run: () => checkPackageManifestParity(
        'touch-demo',
        { name: '@talex-touch/touch-demo-plugin', version: '1.0.0', private: true, keywords: ['utilities'] },
        { id: 'com.tuffex.demo', name: 'touch-demo', version: '1.0.0', sdkapi: 261011, category: 'utilities' },
      ),
      expect: true,
    },
    {
      name: 'publishable package missing keywords and tuff block is rejected',
      run: () => checkPackageManifestParity(
        'touch-demo',
        { name: '@talex-touch/touch-demo-plugin', version: '1.0.0', private: false },
        { id: 'com.tuffex.demo', name: 'touch-demo', version: '1.0.0', sdkapi: 261011, category: 'utilities' },
      ),
      expect: true,
    },
    {
      name: 'tuff metadata block id/sdkapi mismatch is rejected',
      run: () => checkPackageManifestParity(
        'touch-demo',
        {
          name: '@talex-touch/touch-demo-plugin',
          version: '1.0.0',
          keywords: ['tuff-plugin'],
          tuff: { schemaVersion: 1, id: 'com.tuffex.other', name: 'touch-demo', sdkapi: 260428, category: 'utilities' },
        },
        { id: 'com.tuffex.demo', name: 'touch-demo', version: '1.0.0', sdkapi: 261011, category: 'utilities' },
      ),
      expect: true,
    },
    {
      name: 'matching publishable package.json with tuff block and tuff-plugin keyword is accepted',
      run: () => checkPackageManifestParity(
        'touch-demo',
        {
          name: '@talex-touch/touch-demo-plugin',
          version: '1.0.0',
          keywords: ['tuff-plugin', 'utilities'],
          tuff: { schemaVersion: 1, id: 'com.tuffex.demo', name: 'touch-demo', sdkapi: 261011, category: 'utilities' },
        },
        { id: 'com.tuffex.demo', name: 'touch-demo', version: '1.0.0', sdkapi: 261011, category: 'utilities' },
      ),
      expect: false,
    },
    {
      name: 'manifest-only tombstone without package.json passes parity check',
      run: () => checkPackageManifestParity(
        'touch-code-snippets',
        null,
        { id: 'com.tuffex.code-snippets', name: 'touch-code-snippets', version: '1.0.1', sdkapi: 261011, category: 'utilities' },
      ),
      expect: false,
    },
    {
      name: 'entry path escaping plugin directory is rejected',
      run: () => resolveContainedEntryPath('/tmp/plugin-root', '../outside.js') === null,
      expect: true,
    },
    {
      name: 'absolute entry path outside plugin directory is rejected',
      run: () => resolveContainedEntryPath('/tmp/plugin-root', '/etc/passwd') === null,
      expect: true,
    },
    {
      name: 'contained relative entry path is accepted',
      run: () => resolveContainedEntryPath('/tmp/plugin-root', 'dist/index.mjs') === path.resolve('/tmp/plugin-root', 'dist/index.mjs'),
      expect: true,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const actual = testCase.run()
    if (actual === testCase.expect) {
      console.log(`  \x1B[32m✓\x1B[0m ${testCase.name}`)
    }
    else {
      console.error(`  \x1B[31m✗\x1B[0m ${testCase.name}: expected ${testCase.expect}, got ${actual}`)
      failures += 1
    }
  }
  console.log(failures === 0
    ? '\n\x1B[32mvalidate-plugins self-test passed.\x1B[0m\n'
    : `\n\x1B[31mvalidate-plugins self-test failed: ${failures} case(s).\x1B[0m\n`)
  return failures
}
