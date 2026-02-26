import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const TARGET = 'apps/nexus/server'
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.mts', '.cts'])
const IGNORE_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist'])
const BLOCKED_PATTERN = /\bvalue_json\b/

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath))
}

async function collectFiles(relativePath) {
  const absolutePath = path.join(ROOT, relativePath)
  const info = await stat(absolutePath)

  if (info.isFile()) {
    return isCodeFile(relativePath) ? [relativePath] : []
  }

  const entries = await readdir(absolutePath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) {
      continue
    }
    const nextRelativePath = path.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(nextRelativePath)))
      continue
    }
    if (entry.isFile() && isCodeFile(nextRelativePath)) {
      files.push(nextRelativePath)
    }
  }
  return files
}

async function main() {
  const files = await collectFiles(TARGET)
  const violations = []

  for (const relativePath of files) {
    const absolutePath = path.join(ROOT, relativePath)
    const content = await readFile(absolutePath, 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (!BLOCKED_PATTERN.test(line)) {
        continue
      }
      violations.push({
        file: relativePath,
        line: i + 1,
        content: line.trim()
      })
    }
  }

  if (violations.length === 0) {
    console.log('[sync:guard] Passed: no legacy value_json usage found in apps/nexus/server.')
    return
  }

  console.error('[sync:guard] Blocked: detected legacy value_json usage in apps/nexus/server:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.content}`)
  }
  process.exit(1)
}

await main()
