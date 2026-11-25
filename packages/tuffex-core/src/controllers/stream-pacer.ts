import { effectScope, readonly, shallowRef, type Ref } from '@vue/reactivity'
import { watchSignal } from '../reactivity'
import { hasWindow } from '../utils/env'

export type StreamRevealPreset = 'aurora' | 'hue' | 'blur' | 'languid' | 'none'
export type StreamState = 'idle' | 'streaming' | 'paused' | 'draining' | 'done'
export type StreamMark = 'strong' | 'em' | 'del' | 'code'

export interface StreamCitationSource {
  id: string
  title?: string
  url?: string
  [key: string]: unknown
}

export type StreamInline =
  | {
    type: 'text'
    text: string
    marks?: StreamMark[]
    href?: string
  }
  | {
    type: 'citation'
    source: StreamCitationSource
    label?: string
    index?: number
  }
  | {
    type: 'custom'
    name: string
    props?: Record<string, unknown>
  }

export interface WordUnit {
  text: string
  ws: string
}

export interface StreamRun {
  marks: StreamMark[]
  href?: string
}

export type StreamAtom = Exclude<StreamInline, { type: 'text' }>

export interface StreamUnit {
  kind: 'word' | 'atom'
  text: string
  ws: string
  run: number
  atom?: StreamAtom
}

export interface StreamModel {
  runs: StreamRun[]
  units: StreamUnit[]
}

export const STREAM_REVEAL_DURATION_MS: Readonly<Record<StreamRevealPreset, number>> = {
  aurora: 460,
  hue: 180,
  blur: 420,
  languid: 900,
  none: 0,
}

export const STREAM_PACING_DEFAULTS = {
  wordMs: 24,
  maxLagMs: 600,
  drainMs: 320,
  pauseMs: 400,
} as const

export function streamRevealDuration(preset: StreamRevealPreset | undefined): number {
  return STREAM_REVEAL_DURATION_MS[preset ?? 'aurora'] ?? STREAM_REVEAL_DURATION_MS.aurora
}

const SPACE = /^\s+$/u
const OPENING = /^[\p{Ps}\p{Pi}]+$/u
const PUNCTUATION = /^\p{P}+$/u
const FALLBACK = /\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

let cachedSegmenter: { locale: string, segmenter: Intl.Segmenter } | null = null

function segmenterFor(locale: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function')
    return null
  if (cachedSegmenter?.locale !== locale)
    cachedSegmenter = { locale, segmenter: new Intl.Segmenter(locale, { granularity: 'word' }) }
  return cachedSegmenter.segmenter
}

function rawSegments(text: string, locale: string): string[] {
  const segmenter = segmenterFor(locale)
  if (segmenter)
    return Array.from(segmenter.segment(text), part => part.segment)
  return text.match(FALLBACK) ?? []
}

export function segmentWords(text: string, locale = 'zh'): WordUnit[] {
  const units: WordUnit[] = []
  let prefix = ''

  for (const part of rawSegments(text, locale)) {
    const last = units[units.length - 1]
    if (SPACE.test(part)) {
      if (last && !prefix)
        last.ws += part
      else
        prefix += part
      continue
    }
    if (OPENING.test(part)) {
      prefix += part
      continue
    }
    if (PUNCTUATION.test(part) && last && !last.ws && !prefix) {
      last.text += part
      continue
    }
    units.push({ text: prefix + part, ws: '' })
    prefix = ''
  }

  if (prefix)
    units.push({ text: prefix, ws: '' })
  return units
}

const SAFE_HREF = /^(?:https?:|mailto:|tel:|[#?.]|\/(?![/\\]))/i
const URL_IGNORED = /[\t\n\r]/g
const LEADING_SPACE = /^\s+/

export function safeHref(href: string | undefined): string | undefined {
  const value = href?.replace(URL_IGNORED, '').trim()
  return value && SAFE_HREF.test(value) ? value : undefined
}

export function atomKey(atom: StreamAtom): string {
  return atom.type === 'citation'
    ? `cite:${atom.source.id}:${atom.label ?? ''}:${atom.index ?? ''}`
    : `custom:${atom.name}:${JSON.stringify(atom.props ?? {})}`
}

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

export interface StreamPacerOptions {
  total: () => number
  streaming: () => boolean
  wordMs?: () => number | undefined
  maxLagMs?: () => number | undefined
  drainMs?: () => number | undefined
  pauseMs?: () => number | undefined
  settleMs?: () => number
  appear?: boolean
  paced?: () => boolean
  onState?: (state: StreamState, previous: StreamState) => void
  now?: () => number
  requestFrame?: ((callback: (time: number) => void) => number) | null
  cancelFrame?: (id: number) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export interface StreamPacer {
  revealed: Readonly<Ref<number>>
  settled: Readonly<Ref<number>>
  state: Readonly<Ref<StreamState>>
  replay: () => void
  skip: () => void
  rewind: (index: number) => void
  sync: () => void
  stop: () => void
}

const MAX_FRAME_MS = 250

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Framework-agnostic stream pacer powered purely by `@vue/reactivity`.
 * Drives steady word-by-word reveal with lag catch-up, drain pacing, pause detection, and settle tracking.
 */
export function createStreamPacer(options: StreamPacerOptions): StreamPacer {
  const scope = effectScope()
  const now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()))
  const requestFrame = options.requestFrame !== undefined
    ? options.requestFrame
    : hasWindow() && typeof requestAnimationFrame === 'function'
      ? (callback: (time: number) => void) => requestAnimationFrame(callback)
      : null
  const cancelFrame = options.cancelFrame ?? ((id: number) => cancelAnimationFrame(id))
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))

  const wordMs = () => positive(options.wordMs?.(), STREAM_PACING_DEFAULTS.wordMs)
  const maxLagMs = () => positive(options.maxLagMs?.(), STREAM_PACING_DEFAULTS.maxLagMs)
  const drainMs = () => positive(options.drainMs?.(), STREAM_PACING_DEFAULTS.drainMs)
  const pauseMs = () => positive(options.pauseMs?.(), STREAM_PACING_DEFAULTS.pauseMs)
  const settleMs = () => Math.max(0, options.settleMs?.() ?? 0)
  const total = () => Math.max(0, Math.floor(options.total()))
  const paced = () => (options.paced?.() ?? true) && requestFrame !== null

  const initial = options.appear ? 0 : total()
  const revealed = shallowRef(initial)
  const settled = shallowRef(initial)
  const state = shallowRef<StreamState>(options.streaming() ? 'streaming' : initial > 0 ? 'done' : 'idle')

  let releasedAt: number[] = []
  const arrivedAt: number[] = Array.from({ length: initial }, () => now())
  let carry = 0
  let lastFrame: number | null = null
  let frame: number | null = null
  let pauseTimer: unknown = null
  let replaying = false
  let drainRate = 0
  let lastRelease = now()
  let lastEmit = Number.NEGATIVE_INFINITY
  let wasStreaming = options.streaming()
  let stopped = false

  const sourceActive = () => options.streaming() || replaying

  function setState(next: StreamState): void {
    const previous = state.value
    if (next === previous)
      return
    state.value = next
    options.onState?.(next, previous)
  }

  function refreshState(at = now()): void {
    const available = total()
    if (revealed.value < available) {
      setState(sourceActive() ? 'streaming' : 'draining')
      return
    }
    replaying = false
    if (options.streaming()) {
      setState(at - lastRelease >= pauseMs() ? 'paused' : 'streaming')
      return
    }
    drainRate = 0
    setState(available > 0 ? 'done' : 'idle')
  }

  function schedulePauseCheck(at = now()): void {
    if (pauseTimer !== null) {
      clearTimer(pauseTimer)
      pauseTimer = null
    }
    if (stopped || !requestFrame || !sourceActive() || revealed.value < total() || state.value === 'paused')
      return
    const wait = Math.max(0, pauseMs() - (at - lastRelease))
    pauseTimer = setTimer(() => {
      pauseTimer = null
      refreshState()
    }, wait)
  }

  function settle(at: number): void {
    const hold = settleMs()
    let next = settled.value
    if (hold === 0 || !requestFrame) {
      next = revealed.value
    }
    else {
      while (next < revealed.value && (releasedAt[next] ?? 0) + hold <= at)
        next++
    }
    if (next !== settled.value)
      settled.value = next
  }

  function release(count: number, at: number): void {
    const from = revealed.value
    const to = Math.min(total(), from + count)
    if (to <= from)
      return
    for (let index = from; index < to; index++)
      releasedAt[index] = at
    revealed.value = to
    lastRelease = at
    lastEmit = at
    if (settleMs() === 0 || !requestFrame)
      settle(at)
  }

  function busy(): boolean {
    return revealed.value < total() || settled.value < revealed.value
  }

  function step(time: number): void {
    frame = null
    if (stopped)
      return
    const at = now()
    const elapsed = lastFrame === null ? 16 : Math.min(MAX_FRAME_MS, Math.max(0, time - lastFrame))
    lastFrame = time

    const backlog = total() - revealed.value
    if (backlog > 0) {
      let rate: number
      if (!paced()) {
        rate = Number.POSITIVE_INFINITY
      }
      else if (replaying) {
        rate = 1 / wordMs()
      }
      else if (options.streaming()) {
        const oldest = arrivedAt[revealed.value] ?? at
        const remaining = Math.max(16, oldest + maxLagMs() - at)
        rate = Math.max(1 / wordMs(), backlog / remaining)
      }
      else {
        if (drainRate === 0)
          drainRate = Math.max(1 / wordMs(), backlog / drainMs())
        rate = drainRate
      }
      carry += rate * elapsed
      const count = Math.min(backlog, Math.floor(carry))
      if (count > 0) {
        carry = rate === Number.POSITIVE_INFINITY ? 0 : carry - count
        release(count, at)
      }
    }
    settle(at)
    refreshState(at)
    schedulePauseCheck(at)
    if (busy())
      loop()
    else
      lastFrame = null
  }

  function loop(): void {
    if (stopped || frame !== null || !requestFrame)
      return
    frame = requestFrame(step)
  }

  function noteArrivals(available: number, at: number): void {
    for (let index = arrivedAt.length; index < available; index++)
      arrivedAt[index] = at
    if (arrivedAt.length > available)
      arrivedAt.length = available
  }

  function sync(): void {
    if (stopped)
      return
    const available = total()
    const at = now()
    const streaming = options.streaming()
    if (streaming !== wasStreaming) {
      wasStreaming = streaming
      if (streaming)
        lastRelease = at
      else
        drainRate = 0
    }
    noteArrivals(available, at)
    if (available < revealed.value) {
      revealed.value = available
      releasedAt.length = available
    }
    if (settled.value > revealed.value)
      settled.value = revealed.value

    if (!requestFrame) {
      release(available - revealed.value, at)
      settled.value = revealed.value
    }
    else if (available > revealed.value) {
      if (lastEmit + wordMs() <= at)
        carry = Math.max(carry, 1)
      if (!paced())
        release(available - revealed.value, at)
      loop()
    }
    else if (settled.value < revealed.value) {
      loop()
    }
    refreshState(at)
    schedulePauseCheck(at)
  }

  function replay(): void {
    if (stopped)
      return
    releasedAt = []
    revealed.value = 0
    settled.value = 0
    carry = 1
    drainRate = 0
    replaying = true
    lastRelease = now()
    lastFrame = null
    if (!requestFrame) {
      sync()
      return
    }
    setState('streaming')
    loop()
  }

  function skip(): void {
    if (stopped)
      return
    const available = total()
    releasedAt = []
    revealed.value = available
    settled.value = available
    replaying = false
    carry = 0
    drainRate = 0
    lastRelease = now()
    refreshState()
    schedulePauseCheck()
  }

  function rewind(index: number): void {
    const to = Math.max(0, Math.floor(index))
    if (to >= revealed.value)
      return
    revealed.value = to
    releasedAt.length = to
    arrivedAt.length = to
    if (settled.value > to)
      settled.value = to
    sync()
  }

  function stop(): void {
    stopped = true
    if (frame !== null)
      cancelFrame(frame)
    frame = null
    if (pauseTimer !== null)
      clearTimer(pauseTimer)
    pauseTimer = null
    scope.stop()
  }

  scope.run(() => {
    watchSignal(
      () => [total(), options.streaming(), paced(), settleMs()] as const,
      sync,
      {
        equals: (a, b) => {
          if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false
          return a.every((item, idx) => Object.is(item, b[idx]))
        },
      },
    )
  })

  if (state.value !== 'done' && state.value !== 'idle')
    schedulePauseCheck()
  if (options.appear && total() > 0)
    sync()

  return {
    revealed: readonly(revealed),
    settled: readonly(settled),
    state: readonly(state),
    replay,
    skip,
    rewind,
    sync,
    stop,
  }
}
