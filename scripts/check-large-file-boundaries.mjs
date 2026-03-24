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
import { compareVersionCore, getProjectVersion, parseVersionCore } from './lib/version-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const allowlistPath = path.join(workspaceRoot, 'scripts/large-file-boundary-allowlist.json')
const registryPath = path.join(workspaceRoot, 'docs/plan-prd/docs/compatibility-debt-registry.csv')
const changesPath = path.join(workspaceRoot, 'docs/plan-prd/01-project/CHANGES.md')
const shouldWriteBaseline = process.argv.includes('--write-baseline')
const threshold = 1200
const defaultExpiresVersion = '2.5.0'

const scanRoots = WORKSPACE_SCAN_ROOTS

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  if (content.length === 0) {
    return 0
  }
  return content.split(/\r?\n/).length
}

function collectOversizedFiles() {
  const oversized = new Map()
  for (const relativeRoot of scanRoots) {
    const absoluteRoot = path.join(workspaceRoot, relativeRoot)
    for (const filePath of walk(absoluteRoot, {
      ignoreDirs: DEFAULT_IGNORE_DIRS,
      targetExtensions: TARGET_CODE_EXTENSIONS,
    })) {
      const lineCount = countLines(filePath)
      if (lineCount < threshold) {
        continue
      }
      const relativePath = normalizeRelativePath(workspaceRoot, filePath)
      oversized.set(relativePath, lineCount)
    }
  }
  return oversized
}

function loadExistingAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  } catch {
    return null
  }
}

function normalizeGrowthExceptions(rawExceptions) {
  if (!Array.isArray(rawExceptions)) {
    return []
  }
  return rawExceptions
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      file: String(item.file ?? ''),
      maxLines: Number.parseInt(String(item.maxLines ?? ''), 10),
      reason: String(item.reason ?? ''),
      owner: String(item.owner ?? ''),
      expiresVersion: String(item.expiresVersion ?? ''),
      ticket: String(item.ticket ?? ''),
    }))
}

function buildEntriesWithNoGrowth(oversized, existingAllowlist) {
  const previousEntryMap = new Map()
  if (Array.isArray(existingAllowlist?.entries)) {
    for (const entry of existingAllowlist.entries) {
      if (!entry || typeof entry.file !== 'string') {
        continue
      }
      previousEntryMap.set(entry.file, entry)
    }
  }

  return Array.from(oversized.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, lineCount]) => {
      const previous = previousEntryMap.get(file)
      const previousMax = Number.isInteger(previous?.maxLines) ? previous.maxLines : null
      const maxLines = previousMax === null ? lineCount : Math.min(previousMax, lineCount)
      const expiresVersion =
        typeof previous?.expiresVersion === 'string' && parseVersionCore(previous.expiresVersion)
          ? previous.expiresVersion
          : defaultExpiresVersion
      return {
        file,
        maxLines,
        expiresVersion,
        note: `Reduce below ${threshold} lines before v${defaultExpiresVersion}`,
      }
    })
}

function writeBaselineFile(oversized, currentVersion) {
  const existingAllowlist = loadExistingAllowlist()
  const entries = buildEntriesWithNoGrowth(oversized, existingAllowlist)
  const growthExceptions = normalizeGrowthExceptions(existingAllowlist?.growthExceptions)

  const payload = {
    schemaVersion: 2,
    threshold,
    scanScope: scanRoots,
    updatedAt: new Date().toISOString(),
    currentVersion,
    entries,
    growthExceptions,
  }

  fs.writeFileSync(allowlistPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[large-file-boundary] Baseline written to ${path.relative(workspaceRoot, allowlistPath)}`)
}

function validateGrowthExceptionSync(exception, registryContent, changesContent) {
  const violations = []
  if (!registryContent.includes(`"${exception.file}"`)) {
    violations.push(
      `Growth exception file is not synced to compatibility registry: ${exception.file}`,
    )
  }

  if (!changesContent.includes(exception.ticket) || !changesContent.includes(exception.file)) {
    violations.push(
      `Growth exception is not documented in CHANGES with file+ticket: ${exception.file} / ${exception.ticket}`,
    )
  }
  return violations
}

function validateAllowlist(allowlist, oversized, currentVersion) {
  const violations = []
  const warnings = []

  if (!Array.isArray(allowlist.entries)) {
    violations.push({ file: '-', reason: 'Invalid allowlist format: entries must be an array' })
    return { violations, warnings }
  }

  const registryContent = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : ''
  const changesContent = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, 'utf8') : ''
  const growthExceptions = normalizeGrowthExceptions(allowlist.growthExceptions)

  const exceptionMap = new Map()
  for (const exception of growthExceptions) {
    if (!exception.file) {
      violations.push({ file: '-', reason: 'growthExceptions.file is required' })
      continue
    }
    if (!Number.isInteger(exception.maxLines) || exception.maxLines < threshold) {
      violations.push({
        file: exception.file,
        reason: `Invalid growthExceptions.maxLines (${exception.maxLines}), expected integer >= ${threshold}`,
      })
      continue
    }
    if (!exception.reason.trim()) {
      violations.push({ file: exception.file, reason: 'growthExceptions.reason is required' })
      continue
    }
    if (!exception.owner.trim()) {
      violations.push({ file: exception.file, reason: 'growthExceptions.owner is required' })
      continue
    }
    if (!exception.ticket.trim()) {
      violations.push({ file: exception.file, reason: 'growthExceptions.ticket is required' })
      continue
    }
    if (!parseVersionCore(exception.expiresVersion)) {
      violations.push({
        file: exception.file,
        reason: `Invalid growthExceptions.expiresVersion: ${exception.expiresVersion}`,
      })
      continue
    }
    for (const syncViolation of validateGrowthExceptionSync(
      exception,
      registryContent,
      changesContent,
    )) {
      violations.push({ file: exception.file, reason: syncViolation })
    }
    exceptionMap.set(exception.file, exception)
  }

  const allowMap = new Map()
  for (const entry of allowlist.entries) {
    if (!entry || typeof entry.file !== 'string') {
      violations.push({ file: '-', reason: 'Invalid entry: missing file' })
      continue
    }
    if (!Number.isInteger(entry.maxLines) || entry.maxLines < threshold) {
      violations.push({
        file: entry.file,
        reason: `Invalid maxLines (${entry.maxLines}), expected integer >= ${threshold}`,
      })
      continue
    }
    if (typeof entry.expiresVersion !== 'string' || !parseVersionCore(entry.expiresVersion)) {
      violations.push({
        file: entry.file,
        reason: `Invalid expiresVersion: ${entry.expiresVersion}`,
      })
      continue
    }
    allowMap.set(entry.file, entry)
  }

  for (const [file, lineCount] of oversized.entries()) {
    const allowEntry = allowMap.get(file)
    if (!allowEntry) {
      violations.push({
        file,
        reason: `New oversized file detected (${lineCount} lines, threshold ${threshold})`,
      })
      continue
    }

    if (lineCount > allowEntry.maxLines) {
      const exception = exceptionMap.get(file)
      if (!exception) {
        violations.push({
          file,
          reason: `Line count exceeded baseline: ${lineCount} > ${allowEntry.maxLines}`,
        })
      } else if (lineCount > exception.maxLines) {
        violations.push({
          file,
          reason: `Line count exceeded exception cap: ${lineCount} > ${exception.maxLines}`,
        })
      } else {
        const exceptionCmp = compareVersionCore(currentVersion, exception.expiresVersion)
        if (exceptionCmp !== null && exceptionCmp >= 0) {
          violations.push({
            file,
            reason: `Growth exception expired at ${exception.expiresVersion} (current ${currentVersion})`,
          })
        }
      }
    }

    const cmp = compareVersionCore(currentVersion, allowEntry.expiresVersion)
    if (cmp !== null && cmp >= 0) {
      violations.push({
        file,
        reason: `Oversized file debt expired at ${allowEntry.expiresVersion} (current ${currentVersion})`,
      })
    } else if (cmp === null) {
      warnings.push(`${file}: skip version compare (${currentVersion} vs ${allowEntry.expiresVersion})`)
    }
  }

  for (const [file] of allowMap.entries()) {
    if (!oversized.has(file)) {
      warnings.push(`${file}: allowlist entry has been reduced below threshold (cleanup candidate)`)
    }
  }

  for (const [file] of exceptionMap.entries()) {
    if (!oversized.has(file)) {
      warnings.push(`${file}: growth exception exists but file is not oversized now (cleanup candidate)`)
    }
  }

  return { violations, warnings }
}

function printSummary(oversized) {
  let maxLineCount = 0
  let maxLineFile = ''
  for (const [file, lineCount] of oversized.entries()) {
    if (lineCount > maxLineCount) {
      maxLineCount = lineCount
      maxLineFile = file
    }
  }

  console.log(`[large-file-boundary] scanScope=${scanRoots.join(', ')}`)
  console.log(`[large-file-boundary] threshold>=${threshold}, files=${oversized.size}`)
  if (maxLineFile) {
    console.log(`[large-file-boundary] max=${maxLineCount} (${maxLineFile})`)
  }
}

function main() {
  const oversized = collectOversizedFiles()
  const currentVersion = getProjectVersion(workspaceRoot)

  if (shouldWriteBaseline) {
    writeBaselineFile(oversized, currentVersion)
    printSummary(oversized)
    return
  }

  if (!fs.existsSync(allowlistPath)) {
    console.error('[large-file-boundary] Missing allowlist file.')
    console.error('Run: node scripts/check-large-file-boundaries.mjs --write-baseline')
    process.exit(1)
  }

  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const { violations, warnings } = validateAllowlist(allowlist, oversized, currentVersion)
  printSummary(oversized)

  for (const warning of warnings) {
    console.warn(`[large-file-boundary] WARN: ${warning}`)
  }

  if (violations.length > 0) {
    console.error('[large-file-boundary] Violations found:')
    for (const violation of violations) {
      console.error(` - ${violation.file}: ${violation.reason}`)
    }
    process.exit(1)
  }

  console.log('[large-file-boundary] OK: no new oversized-file debt added.')
}

main()
