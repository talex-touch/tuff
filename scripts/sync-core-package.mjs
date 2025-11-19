#!/usr/bin/env node

/**
 * Sync selected fields from the workspace root package.json
 * into apps/core-app/package.json so the Electron app always
 * inherits the canonical version/metadata.
 *
 * This avoids forgetting to bump the inner package manually.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.join(__dirname, '..')
const rootPkgPath = path.join(workspaceRoot, 'package.json')
const corePkgPath = path.join(workspaceRoot, 'apps', 'core-app', 'package.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function syncCorePackage() {
  if (!fs.existsSync(rootPkgPath) || !fs.existsSync(corePkgPath)) {
    console.warn('[sync-core-package] package.json paths not found, skipping')
    return
  }

  const rootPkg = readJson(rootPkgPath)
  const corePkg = readJson(corePkgPath)

  const fieldsToSync = ['version', 'description', 'author', 'homepage', 'license']
  const updatedFields = []

  for (const field of fieldsToSync) {
    if (typeof rootPkg[field] === 'undefined')
      continue
    if (corePkg[field] !== rootPkg[field]) {
      corePkg[field] = rootPkg[field]
      updatedFields.push(field)
    }
  }

  if (updatedFields.length > 0) {
    writeJson(corePkgPath, corePkg)
    console.log(
      `[sync-core-package] Updated apps/core-app/package.json fields: ${updatedFields.join(', ')}`,
    )
  }
  else {
    console.log('[sync-core-package] apps/core-app/package.json already in sync')
  }
}

try {
  syncCorePackage()
}
catch (error) {
  console.error('[sync-core-package] Failed to sync metadata:', error)
  process.exitCode = 1
}
