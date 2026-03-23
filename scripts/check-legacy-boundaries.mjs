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
const allowlistPath = path.join(workspaceRoot, 'scripts/legacy-boundary-allowlist.json')
const writeBaseline = process.argv.includes('--write-baseline')
const scanRoots = LEGACY_SCAN_ROOTS
const scopeRoots = SCOPE_GUARD_ROOTS
const scopeExemptFiles = SCOPE_GUARD_EXEMPT_FILES
const defaultExpiresVersion = '2.5.0'

const ruleDefs = [
  {
    id: 'legacy-keyword',
    description:
      'Freeze legacy-branch debt: new legacy keyword matches must be allowlisted with an expiry version.',
    matcher: /\blegacy\b/gi,
  },
  {
    id: 'raw-channel-send',
    description:
      "Freeze raw event strings: block new channel.send('x:y') calls unless allowlisted.",
    matcher: /\bchannel\.send\(\s*(['"`])[a-zA-Z0-9_.-]+:[^'"`]+\1/g,
  },
  {
    id: 'legacy-transport-import',
    description:
      'Freeze transport legacy API spread: block new imports from transport/legacy unless allowlisted.',
    matcher:
      /\b(?:import|export)\s+(?:type\s+)?[\w*{}\s,]+?\sfrom\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\1|\bimport\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\2|\brequire\(\s*(['"`])[^'"`]*(?:\/transport\/legacy|@talex-touch\/utils\/transport\/legacy)\3\s*\)/g,
  },
  {
    id: 'legacy-permission-import',
    description:
      'Freeze permission legacy API spread: block new imports from permission/legacy unless allowlisted.',
    matcher:
      /\b(?:import|export)\s+(?:type\s+)?[\w*{}\s,]+?\sfrom\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\1|\bimport\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\2|\brequire\(\s*(['"`])[^'"`]*(?:\/permission\/legacy|@talex-touch\/utils\/permission\/legacy)\3\s*\)/g,
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
  const findings = Object.fromEntries(ruleDefs.map(rule => [rule.id, new Map()]))

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
      for (const rule of ruleDefs) {
        const count = countMatches(content, rule.matcher)
        if (count > 0) {
          findings[rule.id].set(relativePath, count)
        }
      }
    }
  }

  return findings
}

function mapToEntries(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, count]) => ({
      file,
      maxCount: count,
      expiresVersion: defaultExpiresVersion,
    }))
}

function writeBaselineFile(findings, currentVersion) {
  const payload = {
    schemaVersion: 1,
    scanScope: scanRoots,
    updatedAt: new Date().toISOString(),
    currentVersion,
    rules: Object.fromEntries(
      ruleDefs.map(rule => [
        rule.id,
        {
          description: rule.description,
          defaultExpiresVersion,
          entries: mapToEntries(findings[rule.id]),
        },
      ]),
    ),
  }

  fs.writeFileSync(allowlistPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[legacy-boundary] Baseline written to ${path.relative(workspaceRoot, allowlistPath)}`)
}

function validateAllowlist(allowlist, findings, currentVersion) {
  const violations = []
  const warnings = []

  for (const rule of ruleDefs) {
    const allowRule = allowlist?.rules?.[rule.id]
    if (!allowRule || !Array.isArray(allowRule.entries)) {
      violations.push({
        rule: rule.id,
        file: '-',
        reason: 'Missing allowlist rule or entries',
      })
      continue
    }

    const allowMap = new Map()
    for (const entry of allowRule.entries) {
      if (!entry || typeof entry.file !== 'string') {
        violations.push({ rule: rule.id, file: '-', reason: 'Invalid allowlist entry file' })
        continue
      }
      if (!Number.isInteger(entry.maxCount) || entry.maxCount < 1) {
        violations.push({
          rule: rule.id,
          file: entry.file,
          reason: `Invalid maxCount: ${entry.maxCount}`,
        })
        continue
      }
      if (typeof entry.expiresVersion !== 'string' || !parseVersionCore(entry.expiresVersion)) {
        violations.push({
          rule: rule.id,
          file: entry.file,
          reason: `Invalid expiresVersion: ${entry.expiresVersion}`,
        })
        continue
      }

      const cmp = compareVersionCore(currentVersion, entry.expiresVersion)
      if (cmp !== null && cmp >= 0) {
        const currentCount = findings[rule.id].get(entry.file) ?? 0
        if (currentCount > 0) {
          violations.push({
            rule: rule.id,
            file: entry.file,
            reason: `Debt expired at ${entry.expiresVersion} (current ${currentVersion})`,
          })
        }
      } else if (cmp === null) {
        warnings.push(
          `${rule.id}:${entry.file} skip version compare (${currentVersion} vs ${entry.expiresVersion})`,
        )
      }

      allowMap.set(entry.file, entry)
    }

    for (const [file, count] of findings[rule.id].entries()) {
      const allowEntry = allowMap.get(file)
      if (!allowEntry) {
        violations.push({
          rule: rule.id,
          file,
          reason: `New match detected (count=${count})`,
        })
        continue
      }
      if (count > allowEntry.maxCount) {
        violations.push({
          rule: rule.id,
          file,
          reason: `Count exceeded: ${count} > ${allowEntry.maxCount}`,
        })
      }
    }
  }

  return { violations, warnings }
}

function printFindingsSummary(findings) {
  console.log(`[legacy-boundary] scanScope=${getScanScopeSummary()}`)
  for (const rule of ruleDefs) {
    const fileCount = findings[rule.id].size
    let hitCount = 0
    for (const count of findings[rule.id].values()) {
      hitCount += count
    }
    console.log(`[legacy-boundary] ${rule.id}: files=${fileCount}, hits=${hitCount}`)
  }
}

function printScopeLeakViolations(scopeLeaks) {
  if (scopeLeaks.length === 0) {
    return
  }
  console.error('[legacy-boundary] Scope leak detected: code files outside explicit scan scope.')
  for (const file of scopeLeaks) {
    console.error(` - ${file}`)
  }
}

function main() {
  const currentVersion = getProjectVersion(workspaceRoot)
  const scopeLeaks = collectScopeLeaks()
  const findings = collectFindings()

  if (scopeLeaks.length > 0) {
    printFindingsSummary(findings)
    printScopeLeakViolations(scopeLeaks)
    process.exit(1)
  }

  if (writeBaseline) {
    writeBaselineFile(findings, currentVersion)
    printFindingsSummary(findings)
    return
  }

  if (!fs.existsSync(allowlistPath)) {
    console.error('[legacy-boundary] Missing allowlist file.')
    console.error('Run: node scripts/check-legacy-boundaries.mjs --write-baseline')
    process.exit(1)
  }

  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const { violations, warnings } = validateAllowlist(allowlist, findings, currentVersion)

  printFindingsSummary(findings)
  for (const warning of warnings) {
    console.warn(`[legacy-boundary] WARN: ${warning}`)
  }

  if (violations.length > 0) {
    console.error('[legacy-boundary] Violations found:')
    for (const violation of violations) {
      console.error(` - [${violation.rule}] ${violation.file}: ${violation.reason}`)
    }
    process.exit(1)
  }

  console.log('[legacy-boundary] OK: no new legacy/raw-channel debt added.')
}

main()
