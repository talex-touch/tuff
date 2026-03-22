#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = process.cwd()
const allowlistPath = path.join(workspaceRoot, 'scripts/legacy-boundary-allowlist.json')
const writeBaseline = process.argv.includes('--write-baseline')

const scanRoots = [
  'apps/core-app/src',
  'apps/nexus/server',
  'apps/nexus/app',
  'apps/pilot/server',
  'apps/pilot/app',
  'apps/pilot/shared',
  'packages',
  'plugins',
]

const scopeRoots = [
  'apps/core-app',
  'apps/nexus',
  'apps/pilot',
  'packages',
  'plugins',
]

const scopeExemptFiles = new Set([
  'apps/core-app/drizzle.config.ts',
  'apps/core-app/electron.vite.config.ts',
  'apps/core-app/eslint.config.mjs',
  'apps/core-app/generator-information.ts',
  'apps/core-app/scripts/build-target.js',
  'apps/core-app/scripts/check-network-boundaries.js',
  'apps/core-app/scripts/ensure-platform-modules.js',
  'apps/core-app/uno.config.ts',
  'apps/nexus/sentry.server.config.ts',
  'apps/nexus/content.config.ts',
  'apps/nexus/eslint.config.js',
  'apps/nexus/i18n/locales/en.ts',
  'apps/nexus/i18n/locales/zh.ts',
  'apps/nexus/i18n.config.ts',
  'apps/nexus/nuxt.config.ts',
  'apps/nexus/sentry.client.config.ts',
  'apps/nexus/shared/watermark/config.ts',
  'apps/nexus/test/mocks/nuxt-imports.ts',
  'apps/nexus/types/cloudflare-env.d.ts',
  'apps/nexus/types/qrcode.d.ts',
  'apps/nexus/types/sidebase-auth.d.ts',
  'apps/nexus/types/sync-api.d.ts',
  'apps/nexus/uno.config.ts',
  'apps/nexus/vitest.config.ts',
  'apps/pilot/eslint.config.js',
  'apps/pilot/nuxt.config.ts',
  'apps/pilot/scripts/dev.mjs',
  'apps/pilot/scripts/merge-ends-channels.mjs',
  'apps/pilot/scripts/report-dist-size.mjs',
  'apps/pilot/shared/pilot-env-loader.ts',
  'apps/pilot/shims-compat.d.ts',
  'apps/pilot/uno.config.ts',
  'apps/pilot/vitest.config.ts',
])

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
  '.workflow',
  '.spec-workflow',
  '.serena',
  '.cursor',
  '.cache',
])

const targetExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs'])
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

function shouldIgnoreDir(dirName) {
  return ignoreDirs.has(dirName)
}

function isTargetFile(fileName) {
  return targetExtensions.has(path.extname(fileName)) || fileName.endsWith('.d.ts')
}

function walk(rootDir, result = []) {
  if (!fs.existsSync(rootDir)) {
    return result
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) {
        continue
      }
      walk(absolutePath, result)
      continue
    }

    if (!isTargetFile(entry.name)) {
      continue
    }
    result.push(absolutePath)
  }

  return result
}

function getProjectVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function parseVersionCore(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim())
  if (!match) {
    return null
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  }
}

function compareVersionCore(left, right) {
  const l = parseVersionCore(left)
  const r = parseVersionCore(right)
  if (!l || !r) {
    return null
  }
  if (l.major !== r.major) return l.major > r.major ? 1 : -1
  if (l.minor !== r.minor) return l.minor > r.minor ? 1 : -1
  if (l.patch !== r.patch) return l.patch > r.patch ? 1 : -1
  return 0
}

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
    const files = walk(absoluteRoot)
    for (const filePath of files) {
      const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
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
    const files = walk(absoluteRoot)
    for (const filePath of files) {
      const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
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
  const currentVersion = getProjectVersion()
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
