import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const componentsSrcRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_FILE_PATTERN = /\.(?:vue|ts|tsx)$/
const INSTANCE_UID_PATTERN = /getCurrentInstance\(\)\s*(?:\?\.|!\.|\.)uid\b/g

function walkComponentSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules')
      continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory())
      walkComponentSources(fullPath, out)
    else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name))
      out.push(fullPath)
  }
  return out
}

describe('tuffex SSR useId() guard', () => {
  it('forbids getCurrentInstance()?.uid in component source files to prevent SSR hydration mismatches', () => {
    const files = walkComponentSources(componentsSrcRoot)
    expect(files.length).toBeGreaterThan(50)

    const violations: string[] = []
    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8')
      const matches = source.match(INSTANCE_UID_PATTERN)
      if (matches?.length) {
        violations.push(`${relative(componentsSrcRoot, filePath)} (${matches.join(', ')})`)
      }
    }

    expect(violations).toEqual([])
  })
})
