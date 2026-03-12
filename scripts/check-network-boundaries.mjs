#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const scanRoots = [
  'apps/core-app',
  'apps/nexus',
  'apps/pilot',
  'packages',
  'plugins',
]
const ignoreDirs = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.nuxt',
  '.wrangler',
  '.output',
  '.vitepress',
  '--port',
  'coverage',
  'tuff',
])
const targetExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs'])
const allowedFiles = new Set([
  // Network suite internals.
  'packages/utils/network/request.ts',
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

function shouldIgnoreDir(dirName) {
  return ignoreDirs.has(dirName)
}

function walk(rootDir, result = []) {
  if (!fs.existsSync(rootDir)) {
    return result
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) {
        continue
      }
      walk(absolute, result)
      continue
    }

    if (!targetExtensions.has(path.extname(entry.name))) {
      continue
    }
    result.push(absolute)
  }
  return result
}

const violations = []

for (const relativeRoot of scanRoots) {
  const absoluteRoot = path.join(workspaceRoot, relativeRoot)
  for (const filePath of walk(absoluteRoot)) {
    const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
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
  console.error('[network-boundary] Found forbidden direct fetch/axios usage:')
  for (const violation of violations) {
    console.error(` - ${violation.file} (${violation.rule})`)
  }
  process.exit(1)
}

console.log('[network-boundary] OK: workspace network boundaries are clean.')
