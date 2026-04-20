#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { normalizeRelativePath, walk } from './lib/file-scan.mjs'
import {
  DEFAULT_IGNORE_DIRS,
  LEGACY_SCAN_ROOTS,
  SCOPE_GUARD_EXEMPT_FILES,
  SCOPE_GUARD_ROOTS,
  TARGET_CODE_EXTENSIONS,
} from './lib/scan-config.mjs'
import { compareVersionCore, getProjectVersion, parseVersionCore } from './lib/version-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const registryPath = path.join(workspaceRoot, 'docs/plan-prd/docs/compatibility-debt-registry.csv')
const writeBaseline = process.argv.includes('--write-baseline')
const defaultExpiresVersion = '2.5.0'

const requiredColumns = [
  'domain',
  'symbol_or_path',
  'reason',
  'compatibility_contract',
  'expires_version',
  'removal_condition',
  'test_case_id',
  'owner',
]
const registryOnlyDomains = new Set([
  'size-growth-exception',
  'core-app-migration-exception',
])

const scanRoots = LEGACY_SCAN_ROOTS
const scopeRoots = SCOPE_GUARD_ROOTS
const scopeExemptFiles = SCOPE_GUARD_EXEMPT_FILES

const domainRules = [
  {
    id: 'compat-file',
    description: 'Filename contains compatibility markers',
    collect(content, relativePath) {
      void content
      return /(?:legacy|compat|migration|shim|polyfill|adapter)/i.test(path.basename(relativePath))
    },
    defaultContract: 'Compatibility shell only; no new capability growth',
    defaultReason: 'Historical compatibility filename retained for migration path',
    defaultTestCaseId: 'COMPAT-REGISTRY-NAMING',
  },
  {
    id: 'legacy-keyword',
    description: 'Contains legacy keyword',
    matcher: /\blegacy\b/gi,
    defaultContract: 'Legacy branch is warn-and-forward only',
    defaultReason: 'Legacy branch retained for backward compatibility window',
    defaultTestCaseId: 'LEGACY-GUARD-KEYWORD',
  },
  {
    id: 'raw-channel-send',
    description: "Uses channel.send('x:y') raw event",
    matcher: /\bchannel\.send\(\s*(['"`])[a-zA-Z0-9_.-]+:[^'"`]+\1/g,
    defaultContract: 'Raw event path can only forward existing behavior',
    defaultReason: 'Raw event path pending typed transport migration',
    defaultTestCaseId: 'LEGACY-GUARD-RAW-EVENT',
  },
  {
    id: 'legacy-transport-import',
    description: 'Imports transport legacy API',
    matcher:
      /\b(?:import|export)\s+(?:type\s+)?[\w*{}\s,]+?\sfrom\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\1|\bimport\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\2|\brequire\(\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\3\s*\)/g,
    defaultContract: 'Legacy transport export is deprecated and read-only',
    defaultReason: 'Legacy transport typing still referenced by existing modules',
    defaultTestCaseId: 'LEGACY-GUARD-TRANSPORT',
  },
  {
    id: 'legacy-permission-import',
    description: 'Imports permission legacy API',
    matcher:
      /\b(?:import|export)\s+(?:type\s+)?[\w*{}\s,]+?\sfrom\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\1|\bimport\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\2|\brequire\(\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\3\s*\)/g,
    defaultContract: 'Legacy permission export is deprecated and read-only',
    defaultReason: 'Legacy permission typing still referenced by existing modules',
    defaultTestCaseId: 'LEGACY-GUARD-PERMISSION',
  },
]

function countMatches(content, matcher) {
  const regex = new RegExp(matcher.source, matcher.flags)
  let count = 0
  while (regex.exec(content)) {
    count += 1
  }
  return count
}

function getScanScopeSummary() {
  return scanRoots.join(', ')
}

function isUnderAllowedScope(relativePath) {
  return scanRoots.some(root => relativePath === root || relativePath.startsWith(`${root}/`))
}

function collectScopeLeaks() {
  const leaks = []
  for (const relativeRoot of scopeRoots) {
    const absoluteRoot = path.join(workspaceRoot, relativeRoot)
    const files = walk(absoluteRoot, {
      ignoreDirs: DEFAULT_IGNORE_DIRS,
      targetExtensions: TARGET_CODE_EXTENSIONS,
      includeDts: true,
    })
    for (const filePath of files) {
      const relativePath = normalizeRelativePath(workspaceRoot, filePath)
      if (scopeExemptFiles.has(relativePath)) {
        continue
      }
      if (!isUnderAllowedScope(relativePath)) {
        leaks.push(relativePath)
      }
    }
  }
  return leaks.sort((a, b) => a.localeCompare(b))
}

function collectFindings() {
  const findings = Object.fromEntries(domainRules.map(rule => [rule.id, new Map()]))

  for (const relativeRoot of scanRoots) {
    const absoluteRoot = path.join(workspaceRoot, relativeRoot)
    const files = walk(absoluteRoot, {
      ignoreDirs: DEFAULT_IGNORE_DIRS,
      targetExtensions: TARGET_CODE_EXTENSIONS,
      includeDts: true,
    })
    for (const filePath of files) {
      const relativePath = normalizeRelativePath(workspaceRoot, filePath)
      const content = fs.readFileSync(filePath, 'utf8')

      for (const rule of domainRules) {
        if (typeof rule.collect === 'function') {
          if (rule.collect(content, relativePath)) {
            findings[rule.id].set(relativePath, 1)
          }
          continue
        }
        const count = countMatches(content, rule.matcher)
        if (count > 0) {
          findings[rule.id].set(relativePath, count)
        }
      }
    }
  }

  return findings
}

function inferOwner(relativePath) {
  if (relativePath.startsWith('apps/core-app/')) return 'core-app'
  if (relativePath.startsWith('apps/nexus/')) return 'nexus'
  if (relativePath.startsWith('apps/pilot/')) return 'pilot'
  if (relativePath.startsWith('packages/utils/')) return 'packages-utils'
  if (relativePath.startsWith('packages/')) {
    const packageName = relativePath.split('/')[1]
    return `packages-${packageName}`
  }
  if (relativePath.startsWith('plugins/')) {
    const pluginName = relativePath.split('/')[1]
    return `plugin-${pluginName}`
  }
  if (relativePath.startsWith('docs/')) return 'docs'
  return 'tbd-owner'
}

function createRegistryEntry(rule, relativePath) {
  return {
    domain: rule.id,
    symbol_or_path: relativePath,
    reason: rule.defaultReason,
    compatibility_contract: rule.defaultContract,
    expires_version: defaultExpiresVersion,
    removal_condition: `Remove before v${defaultExpiresVersion} hard-cut window closes`,
    test_case_id: rule.defaultTestCaseId,
    owner: inferOwner(relativePath),
  }
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let inQuote = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cell += '"'
        i += 1
        continue
      }
      inQuote = !inQuote
      continue
    }

    if (ch === ',' && !inQuote) {
      cells.push(cell)
      cell = ''
      continue
    }
    cell += ch
  }
  cells.push(cell)
  return cells
}

function readRegistry() {
  const content = fs.readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0 && !line.trimStart().startsWith('#'))

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvLine(lines[0]).map(cell => cell.trim())
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']))
  })

  return { headers, rows }
}

function writeRegistry(findings) {
  const entries = []
  for (const rule of domainRules) {
    const files = Array.from(findings[rule.id].keys()).sort((a, b) => a.localeCompare(b))
    for (const file of files) {
      entries.push(createRegistryEntry(rule, file))
    }
  }

  const headerLine = requiredColumns.join(',')
  const contentLines = [headerLine]
  for (const entry of entries) {
    const row = requiredColumns.map(column => escapeCsvCell(entry[column])).join(',')
    contentLines.push(row)
  }

  fs.writeFileSync(registryPath, `${contentLines.join('\n')}\n`, 'utf8')
  console.log(`[compat-registry] Baseline written to ${path.relative(workspaceRoot, registryPath)}`)
}

function summarizeFindings(findings) {
  console.log(`[compat-registry] scanScope=${getScanScopeSummary()}`)
  for (const rule of domainRules) {
    const fileCount = findings[rule.id].size
    let hitCount = 0
    for (const count of findings[rule.id].values()) {
      hitCount += count
    }
    console.log(`[compat-registry] ${rule.id}: files=${fileCount}, hits=${hitCount}`)
  }
}

function validateRegistry(findings, currentVersion) {
  if (!fs.existsSync(registryPath)) {
    return {
      violations: [
        {
          key: 'registry-file',
          reason: `Missing registry file: ${path.relative(workspaceRoot, registryPath)}`,
        },
      ],
      warnings: [],
    }
  }

  const { headers, rows } = readRegistry()
  const violations = []
  const warnings = []
  const findingDomains = new Set(domainRules.map(rule => rule.id))

  for (const column of requiredColumns) {
    if (!headers.includes(column)) {
      violations.push({ key: 'header', reason: `Missing required column: ${column}` })
    }
  }

  const entryMap = new Map()
  for (const row of rows) {
    for (const column of requiredColumns) {
      if (!row[column] || row[column].trim() === '') {
        violations.push({
          key: `${row.domain || '<missing-domain>'}:${row.symbol_or_path || '<missing-path>'}`,
          reason: `Missing field "${column}"`,
        })
      }
    }

    if (!parseVersionCore(row.expires_version)) {
      violations.push({
        key: `${row.domain}:${row.symbol_or_path}`,
        reason: `Invalid expires_version: ${row.expires_version}`,
      })
    }

    if (!findingDomains.has(row.domain) && !registryOnlyDomains.has(row.domain)) {
      violations.push({
        key: `${row.domain}:${row.symbol_or_path}`,
        reason: `Unknown registry domain: ${row.domain}`,
      })
    }

    const key = `${row.domain}:${row.symbol_or_path}`
    if (entryMap.has(key)) {
      violations.push({ key, reason: 'Duplicate registry row' })
      continue
    }
    entryMap.set(key, row)
  }

  for (const rule of domainRules) {
    for (const filePath of findings[rule.id].keys()) {
      const key = `${rule.id}:${filePath}`
      const row = entryMap.get(key)
      if (!row) {
        violations.push({
          key,
          reason: 'Finding is not registered in compatibility debt registry',
        })
        continue
      }

      const cmp = compareVersionCore(currentVersion, row.expires_version)
      if (cmp !== null && cmp >= 0) {
        violations.push({
          key,
          reason: `Debt expired at ${row.expires_version} (current ${currentVersion})`,
        })
      }
      if (cmp === null) {
        warnings.push(`${key}: skip version compare (${currentVersion} vs ${row.expires_version})`)
      }
    }
  }

  for (const [key, row] of entryMap) {
    if (registryOnlyDomains.has(row.domain)) {
      continue
    }
    if (!findings[row.domain]?.has(row.symbol_or_path)) {
      warnings.push(`${key}: registry row has no current finding (cleanup candidate)`)
    }
  }

  return { violations, warnings }
}

function printScopeLeakViolations(scopeLeaks) {
  if (scopeLeaks.length === 0) {
    return
  }
  console.error('[compat-registry] Scope leak detected: code files outside explicit scan scope.')
  for (const file of scopeLeaks) {
    console.error(` - ${file}`)
  }
}

function main() {
  const scopeLeaks = collectScopeLeaks()
  const findings = collectFindings()
  const currentVersion = getProjectVersion(workspaceRoot)

  if (scopeLeaks.length > 0) {
    summarizeFindings(findings)
    printScopeLeakViolations(scopeLeaks)
    process.exit(1)
  }

  if (writeBaseline) {
    writeRegistry(findings)
    summarizeFindings(findings)
    return
  }

  const { violations, warnings } = validateRegistry(findings, currentVersion)
  summarizeFindings(findings)

  for (const warning of warnings) {
    console.warn(`[compat-registry] WARN: ${warning}`)
  }

  if (violations.length > 0) {
    console.error('[compat-registry] Violations found:')
    for (const violation of violations) {
      console.error(` - ${violation.key}: ${violation.reason}`)
    }
    process.exit(1)
  }

  console.log('[compat-registry] OK: registry coverage and expiry policy are valid.')
}

main()
