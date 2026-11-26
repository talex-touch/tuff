import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import type {
  StreamAtom,
  StreamModel,
  StreamRun,
  TxStreamInline,
  TxStreamRevealPreset,
  TxStreamSourceItem,
  TxStreamState,
} from './stream-pacer'
import { hasWindow } from '@talex-touch/tuffex-core'
import { forwardRef, Fragment, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useSignal } from '../hooks/useReactivity'
import { cn } from '../utils/cn'
import {
  buildStreamModel,
  createReactiveStreamPacer,
  streamRevealDuration,
} from './stream-pacer'

export type {
  TxStreamInline,
  TxStreamMark,
  TxStreamRevealPreset,
  TxStreamSourceItem,
  TxStreamState,
} from './stream-pacer'

export interface TxStreamCaretProps {
  state?: TxStreamState
  className?: string
}

export function TxStreamCaret({ state, className }: TxStreamCaretProps) {
  const uid = useId()
  const orbitGradient = `tx-stream-caret-orbit-${uid}`
  const coreGradient = `tx-stream-caret-core-${uid}`

  return (
    <span className={cn('tx-stream-caret', className)} data-state={state} aria-hidden="true">
      <svg className="tx-stream-caret__orbit" viewBox="0 0 100 100" focusable="false">
        <defs>
          <linearGradient id={orbitGradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="tx-stream-caret__stop is-start" stopOpacity="0" />
            <stop offset="1" className="tx-stream-caret__stop is-end" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={`url(#${orbitGradient})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="190 400"
        />
      </svg>
      <svg className="tx-stream-caret__core" viewBox="22 22 56 56" focusable="false">
        <defs>
          <linearGradient id={coreGradient} gradientTransform="rotate(45)">
            <stop offset="0" className="tx-stream-caret__stop is-start" />
            <stop offset="1" className="tx-stream-caret__stop is-end" />
          </linearGradient>
        </defs>
        <path
          d="M30,70 C35,65 45,65 50,70 Q55,75 60,70 L70,60 C75,55 75,45 70,40 L60,30 Q55,25 50,30 Q45,35 40,30 L30,40 C25,45 25,55 30,60 Z"
          fill={`url(#${coreGradient})`}
        />
      </svg>
    </span>
  )
}

export interface TxStreamTextHandle {
  readonly state: TxStreamState
  replay: () => void
  skip: () => void
}

export interface TxStreamTextProps extends Omit<HTMLAttributes<HTMLElement>, 'content'> {
  content: string | TxStreamInline[]
  streaming?: boolean
  wordMs?: number
  maxLagMs?: number
  drainMs?: number
  pauseMs?: number
  reveal?: TxStreamRevealPreset
  caret?: boolean
  reserve?: boolean
  paced?: boolean
  appear?: boolean
  tag?: ElementType
  locale?: string
  renderCaret?: (state: TxStreamState) => ReactNode
  renderCitation?: (props: { source: TxStreamSourceItem, label?: string, index?: number }) => ReactNode
  renderInline?: (props: { name: string, props?: Record<string, unknown> }) => ReactNode
  onStateChange?: (state: TxStreamState) => void
  onDone?: () => void
  onCite?: (source: TxStreamSourceItem) => void
}

interface WordView {
  key: string
  text: string
  ws: string
}

type Group
  = | { kind: 'run', key: string, run: StreamRun, settled: string, fresh: WordView[] }
    | { kind: 'atom', key: string, atom: StreamAtom, ws: string, fresh: boolean }

const CLOSED_WORD = /\p{P}$/u
const TAIL_GRACE_MS = 200

function buildGroups(model: StreamModel, revealed: number, settled: number): Group[] {
  const { runs, units } = model
  const groups: Group[] = []
  let current: Extract<Group, { kind: 'run' }> | null = null
  let currentRun = -1

  for (let index = 0; index < revealed && index < units.length; index++) {
    const unit = units[index]!
    if (unit.kind === 'atom') {
      groups.push({ kind: 'atom', key: `a${index}`, atom: unit.atom!, ws: unit.ws, fresh: index >= settled })
      current = null
      continue
    }
    if (!current || currentRun !== unit.run) {
      current = { kind: 'run', key: `r${unit.run}`, run: runs[unit.run]!, settled: '', fresh: [] }
      currentRun = unit.run
      groups.push(current)
    }
    if (index < settled)
      current.settled += unit.text + unit.ws
    else
      current.fresh.push({ key: `w${index}`, text: unit.text, ws: unit.ws })
  }
  return groups
}

function renderGroups(
  groups: Group[],
  options: {
    renderCitation?: TxStreamTextProps['renderCitation']
    renderInline?: TxStreamTextProps['renderInline']
    onCite?: (source: TxStreamSourceItem) => void
  },
): ReactNode {
  return groups.map((group) => {
    if (group.kind === 'atom') {
      const { atom } = group
      let inner: ReactNode = null
      if (atom.type === 'citation') {
        inner = options.renderCitation
          ? options.renderCitation({ source: atom.source, label: atom.label, index: atom.index })
          : (
              <button
                type="button"
                className="tx-stream-text__citation"
                onClick={() => options.onCite?.(atom.source)}
              >
                {atom.label ?? `[${atom.index ?? atom.source.id}]`}
              </button>
            )
      }
      else {
        inner = options.renderInline?.({ name: atom.name, props: atom.props }) ?? null
      }
      return (
        <Fragment key={group.key}>
          <span className={cn('tx-stream-text__atom', group.fresh && 'tx-stream-text__word')}>
            {inner}
          </span>
          {group.ws}
        </Fragment>
      )
    }

    const last = group.fresh[group.fresh.length - 1]
    const settledText = last ? group.settled : group.settled.trimEnd()
    const trailing = last ? last.ws : group.settled.slice(settledText.length)

    let node: ReactNode = (
      <>
        {settledText}
        {group.fresh.map(word => (
          <Fragment key={word.key}>
            <span className="tx-stream-text__word">{word.text}</span>
            {word.ws && word !== last ? word.ws : null}
          </Fragment>
        ))}
      </>
    )

    const { marks, href } = group.run
    if (marks.includes('code'))
      node = <code className="tx-stream-text__code">{node}</code>
    if (marks.includes('del'))
      node = <del>{node}</del>
    if (marks.includes('em'))
      node = <em>{node}</em>
    if (marks.includes('strong'))
      node = <strong>{node}</strong>
    if (href)
      node = <a className="tx-stream-text__link" href={href} rel="noopener noreferrer">{node}</a>

    return (
      <span key={group.key} className="tx-stream-text__run">
        {node}
        {trailing}
      </span>
    )
  })
}

export const TxStreamText = forwardRef<TxStreamTextHandle, TxStreamTextProps>((
  {
    content,
    streaming = false,
    wordMs,
    maxLagMs,
    drainMs,
    pauseMs,
    reveal = 'aurora',
    caret = true,
    reserve = false,
    paced = true,
    appear = false,
    tag = 'span',
    locale = 'zh',
    renderCaret,
    renderCitation,
    renderInline,
    onStateChange,
    onDone,
    onCite,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const model = useMemo(() => buildStreamModel(content, locale), [content, locale])
  const [quietTail, setQuietTail] = useState(false)

  useEffect(() => {
    setQuietTail(false)
    if (!streaming || !hasWindow())
      return
    const timer = setTimeout(() => setQuietTail(true), TAIL_GRACE_MS)
    return () => clearTimeout(timer)
  }, [content, streaming])

  const available = useMemo(() => {
    const { units } = model
    const last = units[units.length - 1]
    if (!streaming || !last || quietTail)
      return units.length
    const open = last.kind === 'word' && !last.ws && !CLOSED_WORD.test(last.text)
    return open ? units.length - 1 : units.length
  }, [model, streaming, quietTail])

  const reduced = hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const preset: TxStreamRevealPreset = reduced ? 'none' : reveal
  const duration = streamRevealDuration(preset)

  const latestRef = useRef({
    available,
    streaming,
    wordMs,
    maxLagMs,
    drainMs,
    pauseMs,
    duration,
    paced: paced && !reduced,
    onStateChange,
    onDone,
  })
  latestRef.current = {
    available,
    streaming,
    wordMs,
    maxLagMs,
    drainMs,
    pauseMs,
    duration,
    paced: paced && !reduced,
    onStateChange,
    onDone,
  }

  const pacerRef = useRef<ReturnType<typeof createReactiveStreamPacer> | null>(null)
  if (!pacerRef.current) {
    pacerRef.current = createReactiveStreamPacer({
      total: () => latestRef.current.available,
      streaming: () => latestRef.current.streaming,
      wordMs: () => latestRef.current.wordMs,
      maxLagMs: () => latestRef.current.maxLagMs,
      drainMs: () => latestRef.current.drainMs,
      pauseMs: () => latestRef.current.pauseMs,
      settleMs: () => latestRef.current.duration,
      paced: () => latestRef.current.paced,
      appear,
      onState: (next) => {
        latestRef.current.onStateChange?.(next)
        if (next === 'done')
          latestRef.current.onDone?.()
      },
    })
  }
  const pacer = pacerRef.current

  useEffect(() => {
    pacer.sync()
  }, [pacer, available, streaming, paced, reduced, duration])

  useEffect(() => {
    return () => pacer.stop()
  }, [pacer])

  const revealed = useSignal(pacer.revealed)
  const settled = useSignal(pacer.settled)
  const state = useSignal(pacer.state)

  useImperativeHandle(
    ref,
    () => ({
      get state() {
        return pacer.state.value
      },
      replay: () => pacer.replay(),
      skip: () => pacer.skip(),
    }),
    [pacer],
  )

  const live = state === 'streaming' || state === 'paused' || state === 'draining'
  const showCaret = caret && live
  const reserving = reserve && !streaming && revealed < model.units.length

  const liveGroups = useMemo(() => buildGroups(model, revealed, settled), [model, revealed, settled])
  const fullGroups = useMemo(() => buildGroups(model, model.units.length, model.units.length), [model])

  const RootTag = tag
  const rootStyle = {
    '--tx-stream-reveal-duration': `${duration}ms`,
    ...style,
  } as CSSProperties

  return (
    <RootTag
      className={cn(
        'tx-stream-text',
        `is-reveal-${preset}`,
        { 'is-live': live, 'is-reserving': reserving },
        className,
      )}
      style={rootStyle}
      aria-busy={live ? 'true' : undefined}
      {...rest}
    >
      {reserving && (
        <span className="tx-stream-text__reserve" aria-hidden="true">
          {renderGroups(fullGroups, { renderCitation, renderInline, onCite })}
        </span>
      )}
      <span className="tx-stream-text__live">
        {renderGroups(liveGroups, { renderCitation, renderInline, onCite })}
        {showCaret && (
          <span className="tx-stream-text__caret" aria-hidden="true">
            {renderCaret ? renderCaret(state) : <TxStreamCaret state={state} />}
          </span>
        )}
      </span>
    </RootTag>
  )
})
