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
  'clipboard.read',
  'clipboard.write',
  'network.local',
  'network.internet',
  'network.download',
  'system.shell',
  'system.notification',
  'system.tray',
  'ai.basic',
  'ai.advanced',
  'ai.agents',
  'storage.plugin',
  'storage.shared',
  'window.create',
  'window.capture'
])

let hasErrors = false
let totalPlugins = 0
let passedPlugins = 0

function logError(pluginName, message) {
  console.error(`  \x1b[31m✗\x1b[0m [${pluginName}] ${message}`)
  hasErrors = true
}

function logWarn(pluginName, message) {
  console.warn(`  \x1b[33m!\x1b[0m [${pluginName}] ${message}`)
}

function logOk(pluginName, message) {
  console.log(`  \x1b[32m✓\x1b[0m [${pluginName}] ${message}`)
}

// Discover plugin directories
const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
const pluginDirs = entries
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

console.log(`\nValidating ${pluginDirs.length} plugins in plugins/\n`)

for (const pluginName of pluginDirs) {
  totalPlugins++
  const pluginPath = path.join(pluginsDir, pluginName)
  const manifestPath = path.join(pluginPath, 'manifest.json')
  let pluginHasError = false

  // 1. Check manifest.json exists and is valid JSON
  if (!fs.existsSync(manifestPath)) {
    // Skip directories that are not manifest-based plugins (e.g., Vite-based Surface plugins)
    logWarn(pluginName, 'manifest.json not found — skipping (may be a Surface-only plugin)')
    passedPlugins++
    continue
  }

  let manifest
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    manifest = JSON.parse(raw)
  } catch (e) {
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
  } else {
    try {
      execSync(`node -c "${entryPath}"`, { stdio: 'pipe' })
    } catch (e) {
      logError(pluginName, `Syntax error in ${entryFile}: ${e.stderr?.toString().trim() || e.message}`)
      pluginHasError = true
    }
  }

  // 4. Permission ID validation
  if (manifest.permissions) {
    const rawIds = Array.isArray(manifest.permissions)
      ? manifest.permissions
      : [
          ...(manifest.permissions.required || []),
          ...(manifest.permissions.optional || [])
        ]
    const unknownIds = rawIds.filter((id) => typeof id === 'string' && !KNOWN_PERMISSION_IDS.has(id))
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

  if (!pluginHasError) {
    passedPlugins++
    logOk(pluginName, `OK (v${manifest.version}, ${(manifest.features || []).length} features)`)
  }
}

console.log(`\n${passedPlugins}/${totalPlugins} plugins passed validation.\n`)

if (hasErrors) {
  console.error('\x1b[31mValidation failed with errors.\x1b[0m\n')
  process.exit(1)
} else {
  console.log('\x1b[32mAll plugins validated successfully.\x1b[0m\n')
}
