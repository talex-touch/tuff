import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of `apps/nexus`. */
export const nexusRoot = fileURLToPath(new URL('../../../', import.meta.url))

/** A file the guards reason about. `path` is always `apps/nexus`-relative, POSIX separators. */
export interface SourceFile {
  path: string
  content: string
}

/** One rule breach, phrased so the reader can act on it without opening the guard. */
export interface Violation {
  /** `apps/nexus`-relative path. */
  file: string
  /** 1-based. `0` when the breach is about the file as a whole. */
  line: number
  rule: string
  message: string
}

const skipDirectories = new Set(['node_modules', '.nuxt', '.output', '.data', 'dist', '.wrangler'])

function walk(absoluteDir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true })
  }
  catch {
    return
  }
  for (const entry of entries) {
    const absolute = join(absoluteDir, entry.name)
    if (entry.isDirectory()) {
      if (skipDirectories.has(entry.name))
        continue
      walk(absolute, out)
      continue
    }
    if (entry.isFile())
      out.push(absolute)
  }
}

/**
 * Recursively list files under an `apps/nexus`-relative directory.
 * `rg` is not installed on the CI runners, so every guard walks with `node:fs`.
 */
export function listFiles(relativeDir: string, extensions: string[]): string[] {
  const absoluteDir = join(nexusRoot, relativeDir)
  const found: string[] = []
  walk(absoluteDir, found)
  return found
    .filter(absolute => extensions.some(extension => absolute.endsWith(extension)))
    .map(absolute => relative(nexusRoot, absolute).split('\\').join('/'))
    .sort()
}

export function readSource(relativePath: string): SourceFile {
  return {
    path: relativePath,
    content: readFileSync(join(nexusRoot, relativePath), 'utf8'),
  }
}

export function loadSources(relativeDir: string, extensions: string[]): SourceFile[] {
  return listFiles(relativeDir, extensions).map(readSource)
}

export function fileExists(relativePath: string): boolean {
  try {
    return statSync(join(nexusRoot, relativePath)).isFile()
  }
  catch {
    return false
  }
}

/** 1-based line number of a character offset. */
export function lineAt(content: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < content.length; index += 1) {
    if (content[index] === '\n')
      line += 1
  }
  return line
}

/**
 * Vitest truncates long assertion diffs, so violations are rendered as a
 * pre-formatted block and compared against an empty string.
 */
export function formatViolations(violations: Violation[]): string {
  if (violations.length === 0)
    return ''
  const lines = violations.map((violation) => {
    const where = violation.line > 0 ? `${violation.file}:${violation.line}` : violation.file
    return `  - ${where}\n      [${violation.rule}] ${violation.message}`
  })
  return `\n${violations.length} violation(s):\n${lines.join('\n')}\n`
}
