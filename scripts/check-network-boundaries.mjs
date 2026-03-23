#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizeRelativePath, walk } from './lib/file-scan.mjs'
import {
  DEFAULT_IGNORE_DIRS,
  TARGET_CODE_EXTENSIONS,
  WORKSPACE_SCAN_ROOTS,
} from './lib/scan-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const scanRoots = resolveScopeRoots(process.argv.slice(2))

const allowedFiles = new Set([
  // Network suite internals.
  'packages/utils/network/request.ts',
  // Uses `networkClient`, but exposes connector methods named `fetch`.
  'apps/pilot/server/utils/pilot-websearch-connector.ts',
])

const forbiddenRules = [
  {
    name: 'axios import',
    pattern: /import\s+axios\s+from\s+['"]axios['"]/,
  },
  {
    name: 'axios require',
    pattern: /require\(\s*['"]axios['"]\s*\)/,
  },
  {
    name: 'direct fetch call',
    pattern: /(?<![\w$.])fetch\s*\(/,
  },
]

function resolveScopeRoots(argv) {
  const scopes = []
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--scope') {
      const value = argv[i + 1] ?? ''
      i += 1
      scopes.push(...value.split(',').map(item => item.trim()).filter(Boolean))
      continue
    }
    if (token.startsWith('--scope=')) {
      const value = token.slice('--scope='.length)
      scopes.push(...value.split(',').map(item => item.trim()).filter(Boolean))
    }
  }
  return scopes.length > 0 ? scopes : WORKSPACE_SCAN_ROOTS
}

const violations = []

for (const relativeRoot of scanRoots) {
  const absoluteRoot = path.join(workspaceRoot, relativeRoot)
  for (const filePath of walk(absoluteRoot, {
    ignoreDirs: DEFAULT_IGNORE_DIRS,
    targetExtensions: TARGET_CODE_EXTENSIONS,
  })) {
    const relativePath = normalizeRelativePath(workspaceRoot, filePath)
    const content = fs.readFileSync(filePath, 'utf-8')

    let matchedRule = null
    for (const rule of forbiddenRules) {
      if (rule.pattern.test(content)) {
        matchedRule = rule.name
        break
      }
    }
    if (!matchedRule) {
      continue
    }

    if (!allowedFiles.has(relativePath)) {
      violations.push({ file: relativePath, rule: matchedRule })
    }
  }
}

if (violations.length > 0) {
  console.error(`[network-boundary] Found forbidden direct fetch/axios usage (scope: ${scanRoots.join(', ')})`)
  for (const violation of violations) {
    console.error(` - ${violation.file} (${violation.rule})`)
  }
  process.exit(1)
}

console.log(`[network-boundary] OK: network boundaries are clean (scope: ${scanRoots.join(', ')}).`)
