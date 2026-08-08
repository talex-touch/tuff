import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The CoreBox IPC singleton must stay off the manager's import graph (#524).
 *
 * manager.ts imported `ipcManager` for two lifecycle calls while ipc.ts reaches `coreBoxManager`
 * from fifteen handler bodies, and key-transport.ts extended the loop to a third file. Every use
 * is deferred inside a callback, so evaluation order was masked — but any refactor that read a
 * `coreBoxManager` property at ipc.ts module scope would throw
 * `Cannot access 'coreBoxManager' before initialization` at boot, before a window exists to show
 * it. The wiring now lives in index.ts, which nothing in this directory imports.
 *
 * The detector below is general rather than a check for that one edge, so a newly introduced
 * cycle through ipc.ts fails here too.
 */

const DIR = __dirname

/**
 * Cycles this directory still has, recorded rather than silently tolerated.
 *
 * All four run through window.ts, and all are genuine mutual dependencies — manager.ts uses
 * windowManager in twelve places while window.ts reaches coreBoxManager in nine — so untangling
 * them is a real refactor rather than a moved import, and out of scope for #524, which is about
 * the coreBoxManager/ipcManager pair.
 *
 * Shrinking this list is the point. If a fix makes one disappear, this test fails and the entry
 * comes out; a stale allowlist that quietly permits a *new* cycle is the failure mode being
 * avoided.
 */
const KNOWN_REMAINING = [
  'manager.ts -> window.ts -> manager.ts',
  'manager.ts -> window.ts -> plugin-view-controller.ts -> manager.ts',
  'meta-overlay.ts -> window.ts -> meta-overlay.ts',
  'meta-overlay.ts -> window.ts -> plugin-view-controller.ts -> meta-overlay.ts'
]

function localFiles(): string[] {
  return readdirSync(DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')
  )
}

/** Same-directory value imports only. `import type` is erased before a module graph exists. */
function buildGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  for (const file of localFiles()) {
    const edges: string[] = []
    for (const line of readFileSync(path.join(DIR, file), 'utf8').split('\n')) {
      if (!/^\s*(?:import|export)\b/.test(line)) continue
      if (/^\s*import\s+type\b/.test(line)) continue
      const match = line.match(/from\s+['"]\.\/([\w.-]+)['"]/)
      if (!match) continue
      const target = `${match[1]}.ts`
      if (localFiles().includes(target) && !edges.includes(target)) edges.push(target)
    }
    graph.set(file, edges)
  }

  return graph
}

/** Every elementary cycle, each normalised to start at its alphabetically smallest member so the
 * same loop is not reported once per entry point. */
function findCycles(graph: Map<string, string[]>): string[] {
  const cycles = new Set<string>()

  const visit = (node: string, trail: string[]): void => {
    for (const next of graph.get(node) ?? []) {
      const seen = trail.indexOf(next)
      if (seen !== -1) {
        const loop = trail.slice(seen)
        const pivot = loop.indexOf([...loop].sort()[0]!)
        cycles.add([...loop.slice(pivot), ...loop.slice(0, pivot), loop[pivot]!].join(' -> '))
        continue
      }
      if (trail.length > 12) continue
      visit(next, [...trail, next])
    }
  }

  for (const node of graph.keys()) visit(node, [node])
  return [...cycles].sort()
}

describe('core-box import cycles', () => {
  it('builds a graph of the directory', () => {
    // Positive control. Both assertions below are about what the graph does *not* contain, which
    // an empty graph would satisfy just as well.
    const graph = buildGraph()

    expect(graph.has('manager.ts')).toBe(true)
    expect(graph.has('ipc.ts')).toBe(true)
    expect(graph.get('ipc.ts')).toContain('key-transport.ts')
    expect([...graph.values()].flat().length).toBeGreaterThan(20)
  })

  it('finds the cycle it is known to still have', () => {
    // Second positive control, and the record of what #524 deliberately left alone: a detector
    // that found nothing at all would pass the next test while checking nothing.
    expect(findCycles(buildGraph())).toEqual(KNOWN_REMAINING)
  })

  it('has no cycle through the IPC singleton', () => {
    const through = findCycles(buildGraph()).filter((cycle) => cycle.includes('ipc.ts'))

    expect(through).toEqual([])
  })

  it('keeps manager.ts off ipc.ts entirely', () => {
    // The specific edge #524 was filed for, pinned by name so a reviewer sees what changed.
    expect(buildGraph().get('manager.ts')).not.toContain('ipc.ts')
  })
})
