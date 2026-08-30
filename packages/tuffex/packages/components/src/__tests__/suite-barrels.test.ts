import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest always runs from the tuffex package root (`pnpm -C packages/tuffex test`);
// import.meta.url is unreliable here (vite rewrites it root-relative).
const SRC_DIR = join(process.cwd(), 'packages/components/src')

// The base/pro/ai category entries must stay an exact partition of
// components.ts: a component added there but missing from its suite barrel
// would silently vanish from the @talex-touch/tuffex/{base,pro,ai} entries.
function exportDirs(relativePath: string): string[] {
  const absolutePath = join(SRC_DIR, relativePath)
  if (!existsSync(absolutePath)) throw new Error(`suite-barrels: missing ${absolutePath} — cwd anchor broken?`)
  const source = readFileSync(absolutePath, 'utf-8')
  return [...source.matchAll(/^export \* from '\.{1,2}\/([a-z0-9-]+)\/index'$/gm)].map(match => match[1]!)
}

describe('suite entry barrels', () => {
  it('parses export lines from every barrel (positive control)', () => {
    expect(exportDirs('components.ts').length).toBeGreaterThan(100)
    for (const barrel of ['base/index.ts', 'pro/index.ts', 'ai/index.ts']) {
      expect(exportDirs(barrel).length, barrel).toBeGreaterThan(10)
    }
  })

  it('base/pro/ai partition components.ts exactly', () => {
    const all = exportDirs('components.ts')
    const union = [
      ...exportDirs('base/index.ts'),
      ...exportDirs('pro/index.ts'),
      ...exportDirs('ai/index.ts'),
    ]

    expect(union.length, 'suite barrels overlap').toBe(new Set(union).size)
    expect([...union].sort(), 'suite barrels drift from components.ts').toEqual([...all].sort())
  })
})
