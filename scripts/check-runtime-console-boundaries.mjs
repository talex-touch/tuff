#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizeRelativePath, walk } from './lib/file-scan.mjs'
import { DEFAULT_IGNORE_DIRS, TARGET_CODE_EXTENSIONS } from './lib/scan-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const allowlistPath = path.join(workspaceRoot, 'scripts/runtime-console-allowlist.json')
const writeBaseline = process.argv.includes('--write-baseline')
const scanRoots = [
  'apps/core-app/src/main',
  'apps/core-app/src/preload',
  'apps/core-app/src/renderer/src'
]
const runtimeExcludes = [
  /\/views\/test\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.md$/
]
const rawConsoleMatcher = /\bconsole\.(?:log|warn|error|info|debug)\s*\(/g

function shouldSkip(relativePath) {
  return runtimeExcludes.some(pattern => pattern.test(relativePath))
}

function countMatches(content) {
  const regex = new RegExp(rawConsoleMatcher.source, rawConsoleMatcher.flags)
  let count = 0
  while (regex.exec(content)) {
    count += 1
  }
  return count
}

function collectFindings() {
  const findings = new Map()
  for (const relativeRoot of scanRoots) {
    const absoluteRoot = path.join(workspaceRoot, relativeRoot)
    const files = walk(absoluteRoot, {
      ignoreDirs: DEFAULT_IGNORE_DIRS,
      targetExtensions: TARGET_CODE_EXTENSIONS,
      includeDts: false
    })
    for (const filePath of files) {
      const relativePath = normalizeRelativePath(workspaceRoot, filePath)
      if (shouldSkip(relativePath)) {
        continue
      }
      const content = fs.readFileSync(filePath, 'utf8')
      const count = countMatches(content)
      if (count > 0) {
        findings.set(relativePath, count)
      }
    }
  }
  return findings
}

function toEntries(findings) {
  return Array.from(findings.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, maxCount]) => ({ file, maxCount }))
}

function writeBaselineFile(findings) {
  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    scanRoots,
    entries: toEntries(findings)
  }
  fs.writeFileSync(allowlistPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(
    `[runtime-console-guard] Baseline written to ${path.relative(workspaceRoot, allowlistPath)}`
  )
}

function validateAllowlist(allowlist, findings) {
  const violations = []
  const allowMap = new Map()

  for (const entry of allowlist?.entries ?? []) {
    if (!entry || typeof entry.file !== 'string') {
      violations.push({ file: '-', reason: 'Invalid allowlist entry file' })
      continue
    }
    if (!Number.isInteger(entry.maxCount) || entry.maxCount < 1) {
      violations.push({ file: entry.file, reason: `Invalid maxCount: ${entry.maxCount}` })
      continue
    }
    allowMap.set(entry.file, entry.maxCount)
  }

  for (const [file, count] of findings.entries()) {
    const maxCount = allowMap.get(file)
    if (maxCount === undefined) {
      violations.push({ file, reason: `New raw console usage detected (count=${count})` })
      continue
    }
    if (count > maxCount) {
      violations.push({ file, reason: `Raw console count exceeded: ${count} > ${maxCount}` })
    }
  }

  return violations
}

function main() {
  const findings = collectFindings()

  if (writeBaseline) {
    writeBaselineFile(findings)
    return
  }

  if (!fs.existsSync(allowlistPath)) {
    console.error('[runtime-console-guard] Missing allowlist file.')
    console.error('Run: node scripts/check-runtime-console-boundaries.mjs --write-baseline')
    process.exit(1)
  }

  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const violations = validateAllowlist(allowlist, findings)

  console.log(
    `[runtime-console-guard] files=${findings.size}, hits=${Array.from(findings.values()).reduce((sum, value) => sum + value, 0)}`
  )

  if (violations.length > 0) {
    console.error('[runtime-console-guard] Violations found:')
    for (const violation of violations) {
      console.error(` - ${violation.file}: ${violation.reason}`)
    }
    process.exit(1)
  }

  console.log('[runtime-console-guard] OK: no new raw console usage added.')
}

main()
