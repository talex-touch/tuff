import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('legacy cli shim', () => {
  it('keeps deprecation message and forwards to tuff-cli', () => {
    const sourcePath = path.join(import.meta.dirname, '..', 'bin', 'tuff.ts')
    const content = fs.readFileSync(sourcePath, 'utf-8')

    expect(content).toContain('[DEPRECATED]')
    expect(content).toContain('@talex-touch/tuff-cli/dist/bin/tuff.js')
  })
})
