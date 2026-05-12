#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
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
const args = process.argv.slice(2)
const shouldWriteBaseline = process.argv.includes('--write-baseline')
const isStrictMode = args.includes('--strict')
const isReportMode = args.includes('--report')
const isChangedMode = args.includes('--changed')
const threshold = 1200
const defaultExpiresVersion = '2.4.11'

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

function runGitChangedFiles() {
  const explicitFiles = args
    .slice(args.indexOf('--changed') + 1)
    .filter(arg => arg && !arg.startsWith('--'))

  if (explicitFiles.length > 0) {
    return explicitFiles
  }

  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD'],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    console.error('[large-file-boundary] Failed to collect git changed files.')
    if (result.stderr) {
      console.error(result.stderr.trim())
    }
    process.exit(1)
  }

  return result.stdout.split(/\r?\n/).filter(Boolean)
}

function isInScanScope(relativePath) {
  return scanRoots.some(root => relativePath === root || relativePath.startsWith(`${root}/`))
}

function normalizeInputPath(input) {
  const absolutePath = path.isAbsolute(input) ? input : path.join(workspaceRoot, input)
  return normalizeRelativePath(workspaceRoot, absolutePath)
}

function collectChangedOversizedFiles() {
  const oversized = new Map()
  for (const input of runGitChangedFiles()) {
    const relativePath = normalizeInputPath(input)
    if (!isInScanScope(relativePath)) {
      continue
    }

    const absolutePath = path.join(workspaceRoot, relativePath)
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
      continue
    }
    if (!TARGET_CODE_EXTENSIONS.has(path.extname(relativePath))) {
      continue
    }

    const lineCount = countLines(absolutePath)
    if (lineCount >= threshold) {
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

function parseCsvLine(line) {
  const columns = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      columns.push(current)
      current = ''
      continue
    }

    current += char
  }

  columns.push(current)
  return columns
}

function collectRegistryFiles(registryContent) {
  const files = new Set()
  for (const line of registryContent.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    const columns = parseCsvLine(line)
    if (columns[1]) {
      files.add(columns[1])
    }
  }
  return files
}

function validateGrowthExceptionSync(exception, registryFiles, changesContent) {
  const violations = []
  if (!registryFiles.has(exception.file)) {
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

function createResultBucket() {
  return {
    newOversizedFiles: [],
    grownOversizedFiles: [],
    expiredDebt: [],
    cleanupCandidates: [],
    invalidConfig: [],
    warnings: [],
  }
}

function addFinding(bucket, key, file, reason, lineCount) {
  bucket[key].push({
    file,
    reason,
    ...(Number.isInteger(lineCount) ? { lineCount } : {}),
  })
}

function validateAllowlist(allowlist, oversized, currentVersion, options = {}) {
  const includeCleanupCandidates = options.includeCleanupCandidates ?? true
  const result = createResultBucket()
  const warnings = []

  if (!Array.isArray(allowlist.entries)) {
    addFinding(result, 'invalidConfig', '-', 'Invalid allowlist format: entries must be an array')
    return result
  }

  const registryContent = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : ''
  const registryFiles = collectRegistryFiles(registryContent)
  const changesContent = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, 'utf8') : ''
  const growthExceptions = normalizeGrowthExceptions(allowlist.growthExceptions)

  const exceptionMap = new Map()
  for (const exception of growthExceptions) {
    if (!exception.file) {
      addFinding(result, 'invalidConfig', '-', 'growthExceptions.file is required')
      continue
    }
    if (!Number.isInteger(exception.maxLines) || exception.maxLines < threshold) {
      addFinding(
        result,
        'invalidConfig',
        exception.file,
        `Invalid growthExceptions.maxLines (${exception.maxLines}), expected integer >= ${threshold}`,
      )
      continue
    }
    if (!exception.reason.trim()) {
      addFinding(result, 'invalidConfig', exception.file, 'growthExceptions.reason is required')
      continue
    }
    if (!exception.owner.trim()) {
      addFinding(result, 'invalidConfig', exception.file, 'growthExceptions.owner is required')
      continue
    }
    if (!exception.ticket.trim()) {
      addFinding(result, 'invalidConfig', exception.file, 'growthExceptions.ticket is required')
      continue
    }
    if (!parseVersionCore(exception.expiresVersion)) {
      addFinding(
        result,
        'invalidConfig',
        exception.file,
        `Invalid growthExceptions.expiresVersion: ${exception.expiresVersion}`,
      )
      continue
    }
    for (const syncViolation of validateGrowthExceptionSync(
      exception,
      registryFiles,
      changesContent,
    )) {
      addFinding(result, 'invalidConfig', exception.file, syncViolation)
    }
    exceptionMap.set(exception.file, exception)
  }

  const allowMap = new Map()
  for (const entry of allowlist.entries) {
    if (!entry || typeof entry.file !== 'string') {
      addFinding(result, 'invalidConfig', '-', 'Invalid entry: missing file')
      continue
    }
    if (!Number.isInteger(entry.maxLines) || entry.maxLines < threshold) {
      addFinding(
        result,
        'invalidConfig',
        entry.file,
        `Invalid maxLines (${entry.maxLines}), expected integer >= ${threshold}`,
      )
      continue
    }
    if (typeof entry.expiresVersion !== 'string' || !parseVersionCore(entry.expiresVersion)) {
      addFinding(
        result,
        'invalidConfig',
        entry.file,
        `Invalid expiresVersion: ${entry.expiresVersion}`,
      )
      continue
    }
    allowMap.set(entry.file, entry)
  }

  for (const [file, lineCount] of oversized.entries()) {
    const allowEntry = allowMap.get(file)
    if (!allowEntry) {
      addFinding(result, 'newOversizedFiles', file, `New oversized file detected (${lineCount} lines, threshold ${threshold})`, lineCount)
      continue
    }

    if (lineCount > allowEntry.maxLines) {
      const exception = exceptionMap.get(file)
      if (!exception) {
        addFinding(
          result,
          'grownOversizedFiles',
          file,
          `Line count exceeded baseline: ${lineCount} > ${allowEntry.maxLines}`,
          lineCount,
        )
      } else if (lineCount > exception.maxLines) {
        addFinding(
          result,
          'grownOversizedFiles',
          file,
          `Line count exceeded exception cap: ${lineCount} > ${exception.maxLines}`,
          lineCount,
        )
      } else {
        const exceptionCmp = compareVersionCore(currentVersion, exception.expiresVersion)
        if (exceptionCmp !== null && exceptionCmp >= 0) {
          addFinding(
            result,
            'expiredDebt',
            file,
            `Growth exception expired at ${exception.expiresVersion} (current ${currentVersion})`,
            lineCount,
          )
        }
      }
    }

    const cmp = compareVersionCore(currentVersion, allowEntry.expiresVersion)
    if (cmp !== null && cmp >= 0) {
      addFinding(
        result,
        'expiredDebt',
        file,
        `Oversized file debt expired at ${allowEntry.expiresVersion} (current ${currentVersion})`,
        lineCount,
      )
    } else if (cmp === null) {
      warnings.push(`${file}: skip version compare (${currentVersion} vs ${allowEntry.expiresVersion})`)
    }
  }

  if (includeCleanupCandidates) {
    for (const [file] of allowMap.entries()) {
      if (!oversized.has(file)) {
        addFinding(
          result,
          'cleanupCandidates',
          file,
          'allowlist entry has been reduced below threshold',
        )
      }
    }

    for (const [file] of exceptionMap.entries()) {
      if (!oversized.has(file)) {
        addFinding(
          result,
          'cleanupCandidates',
          file,
          'growth exception exists but file is not oversized now',
        )
      }
    }
  }

  result.warnings.push(...warnings)
  return result
}

function printSummary(oversized, mode) {
  let maxLineCount = 0
  let maxLineFile = ''
  for (const [file, lineCount] of oversized.entries()) {
    if (lineCount > maxLineCount) {
      maxLineCount = lineCount
      maxLineFile = file
    }
  }

  console.log(`[large-file-boundary] mode=${mode}`)
  console.log(`[large-file-boundary] scanScope=${scanRoots.join(', ')}`)
  console.log(`[large-file-boundary] threshold>=${threshold}, files=${oversized.size}`)
  console.log(`[large-file-boundary] oversizedFiles=${oversized.size}`)
  if (maxLineFile) {
    console.log(`[large-file-boundary] max=${maxLineCount} (${maxLineFile})`)
  }
}

function getMode() {
  if (isReportMode) return 'report'
  if (isStrictMode) return 'strict'
  if (isChangedMode) return 'changed'
  return 'default'
}

function getBlockingViolations(result, mode) {
  const configViolations = result.invalidConfig
  if (mode === 'report') {
    return []
  }

  if (mode === 'strict') {
    return [
      ...configViolations,
      ...result.newOversizedFiles,
      ...result.grownOversizedFiles,
      ...result.expiredDebt,
    ]
  }

  return [
    ...configViolations,
    ...result.newOversizedFiles,
    ...result.grownOversizedFiles,
  ]
}

function printFindingGroup(label, findings, log = console.log) {
  console.log(`[large-file-boundary] ${label}=${findings.length}`)
  for (const finding of findings) {
    log(` - ${finding.file}: ${finding.reason}`)
  }
}

function printResult(result) {
  printFindingGroup('newOversizedFiles', result.newOversizedFiles)
  printFindingGroup('grownOversizedFiles', result.grownOversizedFiles)
  printFindingGroup('expiredDebt', result.expiredDebt)
  printFindingGroup('cleanupCandidates', result.cleanupCandidates)
  printFindingGroup('invalidConfig', result.invalidConfig)
}

function main() {
  const mode = getMode()
  const oversized = isChangedMode ? collectChangedOversizedFiles() : collectOversizedFiles()
  const currentVersion = getProjectVersion(workspaceRoot)

  if (shouldWriteBaseline) {
    writeBaselineFile(oversized, currentVersion)
    printSummary(oversized, mode)
    return
  }

  if (!fs.existsSync(allowlistPath)) {
    console.error('[large-file-boundary] Missing allowlist file.')
    console.error('Run: node scripts/check-large-file-boundaries.mjs --write-baseline')
    process.exit(1)
  }

  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const result = validateAllowlist(allowlist, oversized, currentVersion, {
    includeCleanupCandidates: !isChangedMode,
  })
  const blockingViolations = getBlockingViolations(result, mode)
  printSummary(oversized, mode)
  printResult(result)

  for (const warning of result.warnings) {
    console.warn(`[large-file-boundary] WARN: ${warning}`)
  }

  if (blockingViolations.length > 0) {
    console.error(`[large-file-boundary] Violations found: ${blockingViolations.length}`)
    for (const violation of blockingViolations) {
      console.error(` - ${violation.file}: ${violation.reason}`)
    }
    process.exit(1)
  }

  if (mode === 'report') {
    console.log('[large-file-boundary] OK: report generated without blocking.')
    return
  }

  if (mode === 'default') {
    console.log('[large-file-boundary] OK: no new or grown oversized-file debt; historical size debt reported only.')
    return
  }

  console.log('[large-file-boundary] OK: no new or grown oversized-file debt added.')
}

main()
