import type { StreamModel } from '../../stream-text/src/model'
import type { StreamInline } from '../../stream-text/src/types'
import type { StreamPart } from './types'
import { codeWordEnds } from '../../code-stream/src/units'
import { buildStreamModel } from '../../stream-text/src/model'

type TextPart = Extract<StreamPart, { type: 'heading' | 'paragraph' }>

interface PlanBase {
  /** Position path plus type: a part keeps its element while it keeps its place and type. */
  key: string
  /** Index of its first unit on the element's clock. */
  start: number
  units: number
}

export type PlanNode =
  | PlanBase & { kind: 'text', part: TextPart, model: StreamModel, full: StreamInline[] }
  | PlanBase & { kind: 'code', part: Extract<StreamPart, { type: 'code' }>, ends: number[] }
  | PlanBase & { kind: 'markdown', part: Extract<StreamPart, { type: 'markdown' }>, ends: number[] }
  | PlanBase & { kind: 'atom', part: Extract<StreamPart, { type: 'rule' | 'custom' }> }
  | PlanBase & { kind: 'list', part: Extract<StreamPart, { type: 'list' }>, items: PlanItem[] }
  | PlanBase & { kind: 'quote', part: Extract<StreamPart, { type: 'quote' }>, children: PlanNode[] }

export interface PlanItem extends PlanBase {
  checked?: boolean
  children: PlanNode[]
}

/** Text models by content, so an unchanged part keeps its model and its content's identity across parses. */
export type PlanCache = Map<string, { model: StreamModel, full: StreamInline[] }>

export interface StreamPlan {
  nodes: PlanNode[]
  /** Units on the clock, all parts together. */
  total: number
  cache: PlanCache
}

/** Where each line of `raw` ends: a delegated block reveals line by line. */
export function lineEnds(raw: string): number[] {
  const ends: number[] = []
  let from = 0
  for (let at = raw.indexOf('\n'); at >= 0; at = raw.indexOf('\n', from)) {
    ends.push(at + 1)
    from = at + 1
  }
  if (from < raw.length)
    ends.push(raw.length)
  return ends
}

/**
 * Lays the parts out on one clock, in document order: text by words (the same
 * units `TxStreamText` releases), code by words (`TxCodeStream`'s), delegated
 * Markdown by lines, and a rule or a custom part as one unit each.
 */
export function planParts(parts: readonly StreamPart[], locale?: string, previous?: PlanCache): StreamPlan {
  const cache: PlanCache = new Map()
  let cursor = 0

  const text = (part: TextPart, key: string): PlanNode => {
    const id = JSON.stringify(part.inlines)
    const known = cache.get(id) ?? previous?.get(id)
    const entry = known ?? { model: buildStreamModel(part.inlines, locale), full: part.inlines }
    cache.set(id, entry)
    const node: PlanNode = { kind: 'text', key, start: cursor, units: entry.model.units.length, part, model: entry.model, full: entry.full }
    cursor += node.units
    return node
  }

  const nodes = (list: readonly StreamPart[], path: string): PlanNode[] => list.map((part, index) => {
    const key = `${path}${index}:${part.type}`
    switch (part.type) {
      case 'heading':
      case 'paragraph':
        return text(part, key)
      case 'code': {
        const ends = codeWordEnds(part.code)
        const node: PlanNode = { kind: 'code', key, start: cursor, units: ends.length, part, ends }
        cursor += node.units
        return node
      }
      case 'markdown': {
        const ends = lineEnds(part.raw)
        const node: PlanNode = { kind: 'markdown', key, start: cursor, units: ends.length, part, ends }
        cursor += node.units
        return node
      }
      case 'list': {
        const start = cursor
        const items = part.items.map((item, itemIndex): PlanItem => {
          const itemStart = cursor
          const children = nodes(item.parts, `${key}/${itemIndex}/`)
          return { key: `${key}/${itemIndex}`, start: itemStart, units: cursor - itemStart, ...(item.checked !== undefined ? { checked: item.checked } : {}), children }
        })
        return { kind: 'list', key, start, units: cursor - start, part, items }
      }
      case 'quote': {
        const start = cursor
        const children = nodes(part.parts, `${key}/`)
        return { kind: 'quote', key, start, units: cursor - start, part, children }
      }
      default: {
        const node: PlanNode = { kind: 'atom', key, start: cursor, units: 1, part }
        cursor += 1
        return node
      }
    }
  })

  const planned = nodes(parts, '')
  return { nodes: planned, total: cursor, cache }
}
