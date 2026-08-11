#!/usr/bin/env node

/**
 * Build-time plugin validation script.
 * Scans plugins/ directory and validates each plugin's manifest, entry point,
 * permission IDs, and feature commands structure.
 *
 * Exit code 1 on any error-level issue.
 */

import { execSync } from 'node:child_process'
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
  'system.shell',
  'system.notification',
  'system.tray',
  'intelligence.basic',
  'intelligence.admin',
  'intelligence.agents',
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
])

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
        return ['storage.shared']
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
const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
const pluginDirs = entries
  .filter(e => e.isDirectory())
  .map(e => e.name)

console.log(`\nValidating ${pluginDirs.length} plugins in plugins/\n`)

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

for (const pluginName of pluginDirs) {
  totalPlugins++
  const pluginPath = path.join(pluginsDir, pluginName)
  const packageJsonPath = path.join(pluginPath, 'package.json')
  const manifestPath = path.join(pluginPath, 'manifest.json')
  const hasPackageJson = fs.existsSync(packageJsonPath)
  let pluginHasError = false

  // 1. Package-backed plugins use the scoped runtime-id package convention.
  if (hasPackageJson) {
    try {
      const packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const expectedPackageName = `@talex-touch/${pluginName}-plugin`
      if (packageManifest.name !== expectedPackageName) {
        logError(pluginName, `package.json name must be "${expectedPackageName}" (received "${packageManifest.name || '<missing>'}")`)
        pluginHasError = true
      }
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
  const entryPath = path.join(pluginPath, entryFile)
  if (!fs.existsSync(entryPath)) {
    logWarn(pluginName, `Entry file "${entryFile}" not found (plugin may be UI-only)`)
  }
  else if (/\.[cm]?js$/i.test(entryFile)) {
    try {
      execSync(`node -c "${entryPath}"`, { stdio: 'pipe' })
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
