import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('common channel registration guards', () => {
  it('registers dialogOpenFileEvent exactly once', () => {
    const currentFile = fileURLToPath(import.meta.url)
    const sourcePath = path.resolve(path.dirname(currentFile), 'common.ts')
    const source = fs.readFileSync(sourcePath, 'utf8')
    const matches = source.match(/transport\.on\(\s*dialogOpenFileEvent\b/g) ?? []

    expect(matches).toHaveLength(1)
  })
})
