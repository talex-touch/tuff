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
  'storage.plugin',
  'storage.shared',
  'search.root-results',
  'window.create',
  'window.capture',
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
  const entryFile = manifest.main || 'index.js'
  const entryPath = path.join(pluginPath, entryFile)
  if (!fs.existsSync(entryPath)) {
    logWarn(pluginName, `Entry file "${entryFile}" not found (plugin may be UI-only)`)
  }
  else {
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
      logWarn(pluginName, `Unknown permission IDs: ${unknownIds.join(', ')}`)
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
