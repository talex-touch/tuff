// Ported from torph/src/lib/utils/flip.ts (https://github.com/lochie/torph).
// MIT License © lochie. Kept intentionally close to upstream so its fixes stay
// diffable; deviations are limited to tuffex lint style and the `Morph*` prefix.
//
// This is deliberately NOT tuffex's `useFlip` (packages/utils/animation/flip.ts).
// That one records first/last for a SINGLE element and drives it with a CSS
// transition, collected by `transitionend`. The engine needs one pass over every
// child of the root, keyed by segment id, with the live transform subtracted so
// the reading stays subpixel — and it drives WAAPI, because only WAAPI can be
// asked how far a running animation got when the next morph interrupts it.

import { ATTR_EXITING, ATTR_ID, ATTR_SR } from './constants'
import { parseTranslate } from './metrics'

export interface MorphMeasures {
  [key: string]: { x: number, y: number }
}

export function measure(element: HTMLElement): MorphMeasures {
  const children = Array.from(element.children) as HTMLElement[]
  const measures: MorphMeasures = {}
  const rootRect = element.getBoundingClientRect()

  children.forEach((child, index) => {
    if (child.hasAttribute(ATTR_EXITING))
      return
    if (child.hasAttribute(ATTR_SR))
      return
    if (child.tagName === 'BR')
      return
    const key = child.getAttribute(ATTR_ID) || `child-${index}`
    const rect = child.getBoundingClientRect()
    const { tx, ty } = parseTranslate(child)
    measures[key] = {
      // Subtracting the transform keeps this subpixel, where offsets would round.
      x: rect.left - rootRect.left - tx,
      y: rect.top - rootRect.top - ty,
    }
  })

  return measures
}

export function computeDelta(
  prev: MorphMeasures,
  current: MorphMeasures,
  key: string,
): { dx: number, dy: number } {
  const p = prev[key]
  const c = current[key]
  if (!p || !c)
    return { dx: 0, dy: 0 }
  return { dx: p.x - c.x, dy: p.y - c.y }
}

/** Nearest persisting neighbour by ID, searching backward first, then forward. */
export function findNearestAnchor(
  targetIndex: number,
  ids: string[],
  persistentIds: Set<string>,
  direction: 'backward-first' | 'forward-first' = 'backward-first',
): string | null {
  const [firstDir, secondDir] = direction === 'backward-first'
    ? (['backward', 'forward'] as const)
    : (['forward', 'backward'] as const)

  const search = (dir: 'backward' | 'forward'): string | null => {
    if (dir === 'backward') {
      for (let j = targetIndex - 1; j >= 0; j--) {
        if (persistentIds.has(ids[j]!))
          return ids[j]!
      }
    }
    else {
      for (let j = targetIndex + 1; j < ids.length; j++) {
        if (persistentIds.has(ids[j]!))
          return ids[j]!
      }
    }
    return null
  }

  return search(firstDir) ?? search(secondDir)
}

export function resolveExitingAnchors(
  oldChildren: HTMLElement[],
  exiting: Set<HTMLElement>,
  oldIds: string[],
  newIds: Set<string>,
): Map<HTMLElement, string | null> {
  const persistentOldIds = new Set(
    oldIds.filter((id, i) => newIds.has(id) && !exiting.has(oldChildren[i]!)),
  )

  const anchors = new Map<HTMLElement, string | null>()
  for (let i = 0; i < oldChildren.length; i++) {
    const child = oldChildren[i]!
    if (!exiting.has(child))
      continue
    anchors.set(child, findNearestAnchor(i, oldIds, persistentOldIds, 'forward-first'))
  }

  return anchors
}
