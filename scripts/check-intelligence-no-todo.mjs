import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const TARGETS = [
  'apps/core-app/src/main/modules/ai',
  'packages/tuff-intelligence/src'
]

const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'])
const BANNED_PATTERNS = [
  { name: 'TODO', regex: /\bTODO\b/i },
  { name: 'FIXME', regex: /\bFIXME\b/i },
  { name: 'placeholder', regex: /\bplaceholder\b/i },
  { name: 'not implemented', regex: /\bnot implemented\b/i }
]
const COMMENT_PENDING_PATTERN = /\bpending\b/i

function isCodeFile(filePath) {
  return FILE_EXTENSIONS.has(path.extname(filePath))
}

async function listFiles(entryPath) {
  const absolutePath = path.join(ROOT, entryPath)
  const info = await stat(absolutePath)

  if (info.isFile()) {
    return [entryPath]
  }

  const entries = await readdir(absolutePath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const relativePath = path.join(entryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(relativePath)))
      continue
    }
    if (entry.isFile() && isCodeFile(relativePath)) {
      files.push(relativePath)
    }
  }
  return files
}

function isCommentLine(line) {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('//')
    || trimmed.startsWith('/*')
    || trimmed.startsWith('*')
    || trimmed.endsWith('*/')
  )
}

async function main() {
  const allFiles = []
  for (const target of TARGETS) {
    try {
      const files = await listFiles(target)
      allFiles.push(...files)
    } catch (error) {
      console.warn(`[intelligence:check] Skip missing target: ${target}`, error)
    }
  }

  const violations = []

  for (const relativePath of allFiles) {
    const absolutePath = path.join(ROOT, relativePath)
    const content = await readFile(absolutePath, 'utf8')
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.regex.test(line)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            reason: pattern.name,
            content: line.trim()
          })
        }
      }

      if (isCommentLine(line) && COMMENT_PENDING_PATTERN.test(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          reason: 'pending(comment)',
          content: line.trim()
        })
      }
    })
  }

  if (violations.length === 0) {
    console.log('[intelligence:check] Passed: no blocked markers found.')
    return
  }

  console.error('[intelligence:check] Blocked markers detected:')
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} [${violation.reason}] ${violation.content}`
    )
  }
  process.exit(1)
}

await main()
