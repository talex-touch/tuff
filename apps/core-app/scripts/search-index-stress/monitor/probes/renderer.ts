import type { FrameMetric } from '../../eval-types'
import {
  CdpConnection,
  cdpEvaluate,
  describeTarget,
  fetchJson,
  isPageTarget,
  type CdpTarget
} from '../cdp'
import { round } from '../stats'
import type { Level } from '../thresholds'
import { BlockTracker } from './block-tracker'
import type { ProbeContext } from './context'
import { PAGE_INSTALL_EXPRESSION, PAGE_READ_EXPRESSION } from './scripts'

const MAX_PAGES = 12
const REFRESH_MS = 2_000
const FRAME_WINDOW_MS = 10_000
const MIN_FRAMES_FOR_RATIO = 60
const REQUEST_TIMEOUT_MS = 60_000
const HISTORY_CAP = 100

interface PageRead {
  vis: boolean
  n: number
  o20: number
  o33: number
  o50: number
  o100: number
  worst: number
  thr: number
  lt: number
  ltMax: number
  loaf: number
  loafMax: number
}

export interface WindowStats {
  label: string
  visibleReads: number
  hiddenReads: number
  frames: number
  over20ms: number
  over50ms: number
  worstFrameMs: number
  throttledIntervals: number
  worstBlockMs: number
}

interface Session {
  id: string
  label: string
  wsUrl: string
  conn: CdpConnection | null
  connecting: boolean
  readInFlight: boolean
  visible: boolean
  /** The renderer process crashed: its probe will never answer, and that is the crash's doing, not a block. */
  dead: boolean
  block: BlockTracker
  recent: Array<{ at: number; n: number; o20: number; o50: number }>
  stats: WindowStats
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * One DevTools session per page target. Each page reports its own frame intervals (rAF), long tasks
 * and round-trip time once a second; only pages that are visible count for frames, and a hidden
 * page's blocks are capped at warn because nobody is looking at it.
 */
export class RendererProbe {
  private readonly sessions = new Map<string, Session>()
  private readonly history = new Map<string, WindowStats>()
  private lastRefreshAt = -Infinity
  private refreshing = false
  private capNoted = false

  constructor(private readonly ctx: ProbeContext) {}

  close(): void {
    for (const session of this.sessions.values()) session.conn?.close()
  }

  get pageCount(): number {
    return this.sessions.size
  }

  windows(): WindowStats[] {
    return [...this.history.values()]
  }

  private blockLimits(session: Session): Level {
    const limits = this.ctx.thresholds.rendererBlockMs
    return session.visible ? limits : { warn: limits.warn, fail: Infinity }
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    const { ctx } = this
    try {
      let targets: CdpTarget[]
      try {
        targets = await fetchJson<CdpTarget[]>(`http://127.0.0.1:${ctx.handles.cdpPort}/json/list`)
      } catch {
        ctx.blind.begin('renderer:list')
        return
      }
      ctx.blind.end('renderer:list')
      const listed = new Set<string>()
      for (const target of targets.filter(isPageTarget)) {
        let session = this.sessions.get(target.id)
        if (!session) {
          if (this.sessions.size >= MAX_PAGES) {
            if (!this.capNoted) {
              this.capNoted = true
              ctx.note(`more than ${MAX_PAGES} page targets: the extra ones are not probed`)
            }
            continue
          }
          session = this.add(target)
        }
        listed.add(target.id)
        session.label = describeTarget(target)
        session.stats.label = session.label
        session.wsUrl = target.webSocketDebuggerUrl!
      }
      for (const session of [...this.sessions.values()])
        if (!listed.has(session.id)) this.remove(session)
      await Promise.all([...this.sessions.values()].map((session) => this.connect(session)))
    } finally {
      this.refreshing = false
    }
  }

  private add(target: CdpTarget): Session {
    const { ctx } = this
    const stats: WindowStats = {
      label: describeTarget(target),
      visibleReads: 0,
      hiddenReads: 0,
      frames: 0,
      over20ms: 0,
      over50ms: 0,
      worstFrameMs: 0,
      throttledIntervals: 0,
      worstBlockMs: 0
    }
    const session: Session = {
      id: target.id,
      label: stats.label,
      wsUrl: target.webSocketDebuggerUrl!,
      conn: null,
      connecting: false,
      readInFlight: false,
      visible: false,
      dead: false,
      block: new BlockTracker(
        ctx.episodes,
        `renderer-block:${target.id}`,
        'renderer-block',
        ctx.now
      ),
      recent: [],
      stats
    }
    this.sessions.set(session.id, session)
    this.history.set(session.id, stats)
    if (this.history.size > HISTORY_CAP) this.history.delete(this.history.keys().next().value!)
    return session
  }

  private remove(session: Session): void {
    const { ctx } = this
    this.sessions.delete(session.id)
    session.conn?.close()
    session.conn = null
    this.closeEpisodes(session)
    ctx.blind.end(`renderer:${session.id}`)
    ctx.timeline('event', { k: 'page-gone', id: session.id, label: session.label })
  }

  private closeEpisodes(session: Session): void {
    const { ctx } = this
    session.block.release(ctx.thresholds.rendererBlockMs)
    this.clearFrameEpisodes(session)
  }

  private clearFrameEpisodes(session: Session): void {
    const { episodes, thresholds } = this.ctx
    episodes.observe(`frames20:${session.id}`, 'frame-drop', 0, thresholds.frameOver20msRatio)
    episodes.observe(`frames:${session.id}`, 'frame-drop', 0, thresholds.frameOver50msRatio)
    episodes.observe(`frame-worst:${session.id}`, 'frame-drop', 0, thresholds.frameWorstMs)
  }

  private async connect(session: Session): Promise<void> {
    if (session.connecting || (session.conn && !session.conn.closed)) return
    session.connecting = true
    const { ctx } = this
    const probe = `renderer:${session.id}`
    try {
      const conn = await CdpConnection.open(session.wsUrl, ctx.now)
      try {
        await conn.send('Inspector.enable', {}, 3_000).catch(() => undefined)
        const status = await cdpEvaluate<string>(conn, PAGE_INSTALL_EXPRESSION, 10_000)
        if (status === 'frame') {
          conn.close()
          this.remove(session)
          return
        }
      } catch (error) {
        conn.close()
        throw error
      }
      conn.on('Inspector.targetCrashed', () => this.crashed(session, 'render process crashed'))
      conn.on('Inspector.targetReloadedAfterCrash', () => {
        session.dead = false
      })
      conn.on('Inspector.detached', (params) => {
        const reason = (params as { reason?: string } | undefined)?.reason ?? ''
        if (/process gone|crash/i.test(reason)) this.crashed(session, reason)
      })
      conn.onClose((reason) => {
        if (session.conn !== conn) return
        session.conn = null
        ctx.blind.begin(probe)
        this.closeEpisodes(session)
        ctx.timeline('event', {
          k: 'page-socket-closed',
          id: session.id,
          label: session.label,
          reason
        })
      })
      session.conn = conn
      session.dead = false
      ctx.blind.end(probe)
    } catch {
      ctx.blind.begin(probe)
    } finally {
      session.connecting = false
    }
  }

  private crashed(session: Session, reason: string): void {
    session.dead = true
    session.block.release(this.ctx.thresholds.rendererBlockMs)
    this.ctx.episodes.point(
      'process-exit',
      'fail',
      1,
      0,
      `renderer of ${session.label}: ${reason}`,
      {
        dedupeKey: `crash:${session.id}`,
        dedupeMs: 60_000
      }
    )
  }

  /** Every 100 ms; reads local state only. */
  watch(): void {
    for (const session of this.sessions.values()) {
      const conn = session.conn
      if (!conn || conn.closed || session.dead) continue
      session.block.live(
        conn.oldestPendingAgeMs(),
        this.blockLimits(session),
        `${session.label}${session.visible ? '' : ' [hidden]'}; probe unanswered`
      )
    }
  }

  async tick(): Promise<void> {
    const now = this.ctx.now()
    const work: Array<Promise<void>> = []
    if (now - this.lastRefreshAt >= REFRESH_MS) {
      this.lastRefreshAt = now
      work.push(this.refresh())
    }
    for (const session of this.sessions.values()) work.push(this.read(session))
    await Promise.all(work)
  }

  private async read(session: Session): Promise<void> {
    const conn = session.conn
    const { ctx } = this
    if (!conn || conn.closed || session.dead || session.readInFlight) return
    session.readInFlight = true
    const acc = ctx.phases.current
    const sentAt = ctx.now()
    let read: PageRead | null
    try {
      read = await cdpEvaluate<PageRead | null>(conn, PAGE_READ_EXPRESSION, REQUEST_TIMEOUT_MS)
      // A navigation drops the probe, and Page.addScriptToEvaluateOnNewDocument does nothing without Page.enable: reinstall here.
      if (!read) await cdpEvaluate<string>(conn, PAGE_INSTALL_EXPRESSION, 10_000)
    } catch {
      return
    } finally {
      session.readInFlight = false
    }
    if (!read) return
    this.consume(session, read, ctx.now() - sentAt, acc)
  }

  private consume(
    session: Session,
    read: PageRead,
    rttMs: number,
    acc: ProbeContext['phases']['current']
  ): void {
    const { ctx } = this
    const stats = session.stats
    const longTask = num(read.ltMax)
    const blockMs = Math.max(rttMs, longTask, num(read.loafMax))
    stats.worstBlockMs = Math.max(stats.worstBlockMs, blockMs)
    stats.throttledIntervals += num(read.thr)
    acc.rendererBlock.push(blockMs)
    session.visible = read.vis === true
    session.block.settle(
      blockMs,
      this.blockLimits(session),
      `${session.label}${session.visible ? '' : ' [hidden]'}; long task ${Math.round(longTask)} ms, round trip ${Math.round(rttMs)} ms`
    )

    if (session.visible) {
      stats.visibleReads++
      this.countFrames(session, read, acc)
    } else {
      stats.hiddenReads++
      session.recent.length = 0
      this.clearFrameEpisodes(session)
    }

    ctx.timeline('tick', {
      k: 'page',
      id: session.id,
      page: session.label,
      vis: session.visible,
      frames: num(read.n),
      over20: num(read.o20),
      over50: num(read.o50),
      worstFrameMs: round(num(read.worst)),
      throttled: num(read.thr),
      longTasks: num(read.lt),
      longTaskMaxMs: round(longTask),
      loafBlockMaxMs: round(num(read.loafMax)),
      rttMs: round(rttMs)
    })
  }

  private countFrames(
    session: Session,
    read: PageRead,
    acc: ProbeContext['phases']['current']
  ): void {
    const { ctx } = this
    const limits = ctx.thresholds
    const stats = session.stats
    const frames = num(read.n)
    const over20 = num(read.o20)
    const over50 = num(read.o50)
    const worst = num(read.worst)
    acc.addFrames(session.label, {
      n: frames,
      o33: num(read.o33),
      o50: over50,
      o100: num(read.o100),
      worst
    })
    stats.frames += frames
    stats.over20ms += over20
    stats.over50ms += over50
    stats.worstFrameMs = Math.max(stats.worstFrameMs, worst)

    const now = ctx.now()
    session.recent.push({ at: now, n: frames, o20: over20, o50: over50 })
    while (session.recent.length > 0 && now - session.recent[0].at >= FRAME_WINDOW_MS)
      session.recent.shift()
    let total = 0
    let slow20 = 0
    let slow50 = 0
    for (const entry of session.recent) {
      total += entry.n
      slow20 += entry.o20
      slow50 += entry.o50
    }
    if (total >= MIN_FRAMES_FOR_RATIO) {
      this.observeShare(
        session,
        'frames20',
        'over-20ms-share',
        20,
        slow20,
        total,
        limits.frameOver20msRatio
      )
      this.observeShare(
        session,
        'frames',
        'over-50ms-share',
        50,
        slow50,
        total,
        limits.frameOver50msRatio
      )
    }
    ctx.episodes.observe(`frame-worst:${session.id}`, 'frame-drop', worst, limits.frameWorstMs, {
      unit: 'ms',
      metric: 'worst-frame',
      context: `${session.label}: worst frame interval`
    })
  }

  private observeShare(
    session: Session,
    key: string,
    metric: FrameMetric,
    overMs: number,
    slow: number,
    total: number,
    limits: Level
  ): void {
    this.ctx.episodes.observe(`${key}:${session.id}`, 'frame-drop', slow / total, limits, {
      unit: 'ratio',
      metric,
      context: `${session.label}: ${slow} of ${total} frames over ${overMs} ms in the last ${FRAME_WINDOW_MS / 1000} s`
    })
  }
}
