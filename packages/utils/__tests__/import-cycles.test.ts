import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * packages/utils must have no cycle that survives compilation (#531).
 *
 * #531 reported 22 cycles, all running through `transport/events/types/app.ts` importing the
 * analytics barrel. That count includes `import type` / `export type` edges, which TypeScript
 * erases before a module graph exists — and the app.ts line is already `export type { … } from
 * '../../../analytics'`. Counting value edges only, there are none.
 *
 * The edge is still worth pinning, because the failure the issue describes becomes real the moment
 * someone drops `type` from that re-export: analytics/client.ts imports the transport SDK, which
 * imports back into the 2671-line event table, and the evaluation order of that table would start
 * depending on which file an importer touched first.
 */

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__'])

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...sourceFiles(path.join(dir, entry.name)))
      continue
    }
    if (/\.ts$/.test(entry.name) && !/\.(?:test|d)\.ts$/.test(entry.name))
      found.push(path.join(dir, entry.name))
  }
  return found
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    }
    catch {
      // not this one
    }
  }
  return null
}

/**
 * Value-level edges only: `import type` / `export type` are erased before runtime.
 *
 * Three things this has to get right, each of which I got wrong first and which between them
 * decide whether the answer is "22 cycles" or "none":
 *
 * 1. Statements wrap. `export type {\n  …\n} from '../../../analytics'` puts the specifier on a
 *    line starting with `}`, so a line-based scan drops the edge entirely.
 * 2. A single regex spanning the statement over-matches: with newlines and braces allowed in the
 *    body it runs from an earlier `export interface` into a later `from '…'`, inventing edges.
 * 3. Comments contain imports. base-storage.ts has `* import { … } from './bootstrap'` inside a
 *    JSDoc block, which produced a confident, entirely fictional cycle.
 *
 * So: strip comments, then attribute each `from` to the nearest preceding statement opener.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')
}

function buildGraph(files: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  for (const file of files) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
    const edges = new Set<string>()

    lines.forEach((line, index) => {
      const from = /from\s*['"]([^'"]+)['"]/.exec(line)
      if (!from) return

      let owner = index
      while (owner >= 0 && !/^\s*(?:import|export)\b/.test(lines[owner]!)) owner--
      if (owner < 0) return
      if (/^\s*(?:import|export)\s+type\b/.test(lines[owner]!)) return

      const resolved = resolveRelative(file, from[1]!)
      if (resolved) edges.add(resolved)
    })

    graph.set(file, [...edges])
  }

  return graph
}

function findCycles(graph: Map<string, string[]>): string[] {
  const cycles = new Set<string>()

  const visit = (node: string, trail: string[]): void => {
    for (const next of graph.get(node) ?? []) {
      const seen = trail.indexOf(next)
      if (seen !== -1) {
        const loop = trail.slice(seen).map((entry) => path.relative(ROOT, entry))
        const pivot = loop.indexOf([...loop].sort()[0]!)
        cycles.add([...loop.slice(pivot), ...loop.slice(0, pivot), loop[pivot]!].join(' -> '))
        continue
      }
      if (trail.length > 14) continue
      visit(next, [...trail, next])
    }
  }

  for (const node of graph.keys()) visit(node, [node])
  return [...cycles].sort()
}

describe('packages/utils import cycles', () => {
  it('detects a cycle when one exists', () => {
    // Positive control on the algorithm rather than on the tree: "no cycles found" is exactly what
    // a broken detector reports, so it is checked against a graph whose answer is known.
    const a = path.join(ROOT, 'a.ts')
    const b = path.join(ROOT, 'b.ts')
    const synthetic = new Map([
      [a, [b]],
      [b, [a]]
    ])

    expect(findCycles(synthetic)).toEqual(['a.ts -> b.ts -> a.ts'])
  })

  it('scans the whole package', () => {
    // Second control: on the tree. An empty file list would also produce zero cycles.
    const files = sourceFiles(ROOT)

    expect(files.length).toBeGreaterThan(100)
    expect(files.some((file) => file.endsWith('transport/events/types/app.ts'))).toBe(true)
  })

  it('has no cycle among value imports', () => {
    expect(findCycles(buildGraph(sourceFiles(ROOT)))).toEqual([])
  })

  it('keeps the analytics re-export type-only', () => {
    // The specific edge #531 is about. As `export type` it is erased; as a value export it would
    // put analytics/client.ts — and through it the transport SDK — into the event table's own
    // evaluation graph.
    const source = readFileSync(path.join(ROOT, 'transport/events/types/app.ts'), 'utf8')

    expect(source).toMatch(/export type \{[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/analytics'/)
    expect(source).not.toMatch(/^\s*export \{[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/analytics'/m)
    expect(source).not.toMatch(/^\s*import \{[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/analytics'/m)
  })
})
