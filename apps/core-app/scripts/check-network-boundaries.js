#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(projectRoot, 'src')
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])

const FORBIDDEN_RULES = [
  {
    name: 'axios import',
    pattern: /import\s+axios\s+from\s+['"]axios['"]/
  },
  {
    name: 'axios require',
    pattern: /require\(\s*['"]axios['"]\s*\)/
  },
  {
    name: 'direct fetch call',
    pattern: /(?<![\w$.])fetch\s*\(/
  }
]

function walk(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(absolute, result)
      continue
    }
    if (!TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      continue
    }
    result.push(absolute)
  }
  return result
}

const violations = []

for (const filePath of walk(sourceRoot)) {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/')
  const content = fs.readFileSync(filePath, 'utf-8')

  for (const rule of FORBIDDEN_RULES) {
    if (rule.pattern.test(content)) {
      violations.push({ file: relativePath, rule: rule.name })
      break
    }
  }
}

if (violations.length > 0) {
  console.error('[network-boundary] Found direct network usage in core-app:')
  for (const violation of violations) {
    console.error(` - ${violation.file} (${violation.rule})`)
  }
  process.exit(1)
}

console.log('[network-boundary] OK: core-app has no direct fetch/axios usage.')
