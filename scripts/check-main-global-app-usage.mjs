import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const mainRoot = path.join(repoRoot, 'apps/core-app/src/main')
const allowlistPath = path.join(repoRoot, 'scripts/main-global-app-allowlist.json')
const WRITE_BASELINE = process.argv.includes('--write-baseline')

const INCLUDE_EXT = new Set(['.ts', '.tsx'])
const IGNORE_SUFFIX = ['.test.ts', '.test.tsx', '.d.ts']
const PATTERN = /globalThis\.\$app\b|(?:^|[^\w$])\$app\b/gm

function walkFiles(dirPath) {
  /** @type {string[]} */
  const output = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      output.push(...walkFiles(absPath))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const ext = path.extname(entry.name)
    if (!INCLUDE_EXT.has(ext)) {
      continue
    }
    if (IGNORE_SUFFIX.some((suffix) => entry.name.endsWith(suffix))) {
      continue
    }
    output.push(absPath)
  }
  return output
}

/**
 * @param {string} text
 * @returns {number}
 */
function countMatches(text) {
  const matched = text.match(PATTERN)
  return matched ? matched.length : 0
}

/**
 * @returns {Record<string, number>}
 */
function collectUsage() {
  /** @type {Record<string, number>} */
  const usage = {}
  const files = walkFiles(mainRoot)
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8')
    const count = countMatches(content)
    if (count <= 0) {
      continue
    }
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/')
    usage[relativePath] = count
  }
  return usage
}

const usage = collectUsage()

if (WRITE_BASELINE) {
  const sortedEntries = Object.entries(usage).sort((a, b) => a[0].localeCompare(b[0]))
  const baseline = Object.fromEntries(sortedEntries)
  fs.writeFileSync(allowlistPath, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`[global-app-guard] baseline updated: ${allowlistPath}`)
  process.exit(0)
}

if (!fs.existsSync(allowlistPath)) {
  console.error(`[global-app-guard] allowlist missing: ${allowlistPath}`)
  console.error('[global-app-guard] run with --write-baseline to create it.')
  process.exit(1)
}

/** @type {Record<string, number>} */
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))

/** @type {string[]} */
const violations = []
for (const [filePath, count] of Object.entries(usage)) {
  const allowed = allowlist[filePath] ?? 0
  if (!(filePath in allowlist)) {
    violations.push(`${filePath}: current=${count}, allowed=0 (new direct $app usage)`)
    continue
  }
  if (count > allowed) {
    violations.push(`${filePath}: current=${count}, allowed=${allowed}`)
  }
}

if (violations.length > 0) {
  console.error('[global-app-guard] detected direct $app/globalThis.$app growth:')
  for (const item of violations) {
    console.error(` - ${item}`)
  }
  process.exit(1)
}

console.log('[global-app-guard] passed')
