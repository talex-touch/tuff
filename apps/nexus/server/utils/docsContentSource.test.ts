import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('docs content source', () => {
  it('includes release markdown docs used by public update announcements', () => {
    const config = readFileSync(resolve(process.cwd(), 'content.config.ts'), 'utf8')

    expect(config).toContain('docs/**/*.{md,mdc}')
  })
})
