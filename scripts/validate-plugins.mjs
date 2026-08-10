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
const pluginsDir = path.resolve(rootDir, 'plugins')

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

/**
 * A committed `dev.enable: true` points the loader at a developer's local server, so a shipped
 * plugin either fails to load or loads whatever is answering on that port.
 *
 * AGENTS.md prescribes `pnpm plugins:validate` as the manifest gate, but neither validator
 * inspected the dev block at all — the prescribed gate could not catch the exact class of defect
 * it is cited for (#812).
 *
 * Only `enable` is policed. A `dev.address` alongside `enable: false` is the normal way to keep a
 * local server configured without turning it on, and every manifest in the tree uses it that way.
 *
 * @returns true when an error was logged.
 */
function reportDevLeakage(pluginName, dev, source) {
  if (!dev || typeof dev !== 'object' || dev.enable !== true)
    return false

  const address = typeof dev.address === 'string' ? ` (address: ${dev.address})` : ''
  logError(
    pluginName,
    `${source} declares dev.enable: true${address} — a released plugin must not point at a local dev server`,
  )
  return true
}

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
/**
 * `--self-test` proves the dev-leakage detector fires, because "no plugin declares dev.enable"
 * looks exactly the same whether the check works or does nothing — which is the state this script
 * was in before (#812).
 *
 * Placed before the scan so it can answer without validating the tree, and after logError so the
 * counters it flips are already declared.
 */
if (process.argv.includes('--self-test')) {
  const cases = [
    { name: 'enable true is rejected', dev: { enable: true, address: 'http://127.0.0.1:6001' }, expected: true },
    { name: 'enable true without an address is still rejected', dev: { enable: true }, expected: true },
    { name: 'enable false with an address is allowed', dev: { enable: false, address: 'http://127.0.0.1:3488' }, expected: false },
    { name: 'no dev block is allowed', dev: undefined, expected: false },
    { name: 'a non-object dev block is ignored rather than crashing', dev: 'yes', expected: false },
  ]

  let failures = 0
  for (const testCase of cases) {
    const actual = reportDevLeakage('self-test', testCase.dev, 'fixture')
    const ok = actual === testCase.expected
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok)
      failures += 1
  }
  process.exit(failures > 0 ? 1 : 0)
}

const pluginDirs = entries
  .filter(e => e.isDirectory())
  .map(e => e.name)

console.log(`\nValidating ${pluginDirs.length} plugins in plugins/\n`)

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
      // The build copies this block into dist/manifest.json, so dev leakage reaches a shipped
      // plugin through package.json just as readily as through a tracked manifest.
      if (reportDevLeakage(pluginName, packageManifest['talex-touch']?.plugin?.dev, 'package.json'))
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

  if (reportDevLeakage(pluginName, manifest.dev, 'manifest.json'))
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
