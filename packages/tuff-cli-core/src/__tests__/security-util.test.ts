import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { generateFilesSha256 } from '../security-util'

vi.mock('node:fs', () => ({
  readFileSync: (filePath: string) => Buffer.from(filePath),
}))

vi.mock('node:path', () => ({
  relative: (_baseDir: string, filePath: string) => filePath,
}))

describe('security util', () => {
  it('normalizes manifest file keys to POSIX paths', () => {
    const hashes = generateFilesSha256(['assets\\logo.svg', 'index.js'], 'build')

    expect(Object.keys(hashes)).toEqual(['assets/logo.svg', 'index.js'])
  })
})
