import type { StreamInline, StreamMark } from './types'
import { segmentWords } from './segment'

/** One styled stretch of text: the marks and link its words share. */
export interface StreamRun {
  marks: StreamMark[]
  href?: string
}

export type StreamAtom = Exclude<StreamInline, { type: 'text' }>

/** One thing a stream releases: a word, or an atom (a citation, a custom inline). */
export interface StreamUnit {
  kind: 'word' | 'atom'
  /** The word, or for an atom a key that is equal whenever the atom is. */
  text: string
  /** Whitespace after it, rendered outside the animated element. */
  ws: string
  /** Index into `runs` for words; -1 for atoms. */
  run: number
  atom?: StreamAtom
}

export interface StreamModel {
  runs: StreamRun[]
  units: StreamUnit[]
}

/**
 * `http(s)`, `mailto`, `tel`, and relative, query and hash URLs. A scheme-relative
 * `//host` (or `/\host`, which browsers read the same way) is not relative: it
 * takes the page's own scheme, and the desktop app's pages are `file:` (on
 * Windows, `file://host/…` is a network share).
 */
const SAFE_HREF = /^(?:https?:|mailto:|tel:|[#?.]|\/(?![/\\]))/i
/** The URL parser drops tabs and newlines anywhere, so `/\t/host` is `//host`. */
const URL_IGNORED = /[\t\n\r]/g
const LEADING_SPACE = /^\s+/

/** Links render only for schemes a page can open safely; anything else stays text. */
export function safeHref(href: string | undefined): string | undefined {
  const value = href?.replace(URL_IGNORED, '').trim()
  return value && SAFE_HREF.test(value) ? value : undefined
}

/** Hosts rebuild their inline arrays on every update, so atoms compare by value. */
export function atomKey(atom: StreamAtom): string {
  return atom.type === 'citation'
    ? `cite:${atom.source.id}:${atom.label ?? ''}:${atom.index ?? ''}`
    : `custom:${atom.name}:${JSON.stringify(atom.props ?? {})}`
}

/**
 * The units a stream of `content` releases, in order. Space that opens a run
 * belongs after the unit before it, so it sits between the two instead of
 * inside the next word's entrance.
 */
export function buildStreamModel(content: string | StreamInline[] | undefined, locale?: string): StreamModel {
  const source: StreamInline[] = typeof content === 'string'
    ? [{ type: 'text', text: content }]
    : content ?? []
  const runs: StreamRun[] = []
  const units: StreamUnit[] = []
  for (const inline of source) {
    if (inline.type !== 'text') {
      units.push({ kind: 'atom', text: atomKey(inline), ws: '', run: -1, atom: inline })
      continue
    }
    let text = inline.text
    const lead = LEADING_SPACE.exec(text)?.[0]
    const previous = units[units.length - 1]
    if (lead && previous) {
      previous.ws += lead
      text = text.slice(lead.length)
    }
    const run = runs.push({ marks: inline.marks ?? [], href: safeHref(inline.href) }) - 1
    for (const word of segmentWords(text, locale))
      units.push({ kind: 'word', text: word.text, ws: word.ws, run })
  }
  return { runs, units }
}

/**
 * The first `count` units of a model as inlines that build back into exactly
 * those units, whitespace included. A parent that paces several streams on one
 * clock hands each of them such a prefix.
 */
export function sliceStreamContent(model: StreamModel, count: number): StreamInline[] {
  const out: StreamInline[] = []
  let current: Extract<StreamInline, { type: 'text' }> | null = null
  let currentRun = -1
  const end = Math.min(Math.max(0, Math.floor(count)), model.units.length)
  for (let index = 0; index < end; index++) {
    const unit = model.units[index]!
    if (unit.kind === 'atom') {
      out.push(unit.atom!)
      current = null
      currentRun = -1
      // Whitespace that followed the atom: as a run of its own it attaches back
      // onto the atom, as it did in the full content.
      if (unit.ws) {
        const next = model.units[index + 1]
        const run = next?.kind === 'word' ? model.runs[next.run] : undefined
        out.push({ type: 'text', text: unit.ws, ...(run?.marks.length ? { marks: run.marks } : {}), ...(run?.href ? { href: run.href } : {}) })
      }
      continue
    }
    if (!current || currentRun !== unit.run) {
      const run = model.runs[unit.run]!
      current = { type: 'text', text: '', ...(run.marks.length ? { marks: run.marks } : {}), ...(run.href ? { href: run.href } : {}) }
      currentRun = unit.run
      out.push(current)
    }
    current.text += unit.text + unit.ws
  }
  return out
}
