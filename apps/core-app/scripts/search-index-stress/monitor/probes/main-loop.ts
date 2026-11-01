import { cdpEvaluate, CdpConnection, fetchJson, type CdpTarget } from '../cdp'
import type { StallSampler } from '../sample'
import { round } from '../stats'
import { BlockTracker } from './block-tracker'
import type { ProbeContext } from './context'
import {
  LOOP_HEARTBEAT_MS,
  LOOP_RESOLUTION_MS,
  LOOP_WINDOW_READS,
  MAIN_INSTALL_EXPRESSION,
  MAIN_PEEK_EXPRESSION,
  mainReadExpression
} from './scripts'

export const MAIN_LOOP_BLOCK_KEY = 'main-loop-block'
const P99_KEY = 'main-loop-p99'

export const PEEK_PERIOD_MS = 250
const JS_HOLD_MS = 400
const SLOW_REPLY_MS = 50
const REQUEST_TIMEOUT_MS = 120_000

interface LoopRead {
  n: number
  p50: number
  p99: number
  max: number
  wn: number
  w99: number
  late?: number
  beatAge: number
  elu: number
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Histogram values include the timer period, so a quiet loop reads `LOOP_RESOLUTION_MS`. */
function delay(value: number): number {
  return Math.max(0, value - LOOP_RESOLUTION_MS)
}

/**
 * Watches the main process through its Node inspector. Three views of the same stall:
 * - the worst lateness of the in-app 25 ms heartbeat and the histogram of 10 ms timer lateness,
 *   read once a second (exact, but after the fact);
 * - an unanswered request that keeps ageing, which is how a native block (a synchronous libsql
 *   call, `execSync`) shows itself live, because the inspector cannot run until JS does;
 * - the age of the heartbeat, which shows a busy JS loop live, because V8 answers inspector
 *   requests by interrupting it (`Atomics.wait` too, so it reads as busy JS).
 */
export class MainLoopProbe {
  private conn: CdpConnection | null = null
  private connecting = false
  private peekInFlight = false
  private readInFlight = false
  private lastPeekAt = -Infinity
  private windowReads = 0
  private jsLate: { at: number; ms: number } | null = null
  private lastFailure = ''
  private readonly block: BlockTracker

  constructor(
    private readonly ctx: ProbeContext,
    private readonly sampler: StallSampler
  ) {
    this.block = new BlockTracker(ctx.episodes, MAIN_LOOP_BLOCK_KEY, 'main-loop-block', ctx.now)
  }

  get attached(): boolean {
    return this.conn !== null && !this.conn.closed
  }

  close(): void {
    this.conn?.close()
    this.conn = null
  }

  async connect(): Promise<void> {
    if (this.connecting || this.attached) return
    this.connecting = true
    const { ctx } = this
    try {
      const targets = await fetchJson<CdpTarget[]>(
        `http://127.0.0.1:${ctx.handles.inspectPort}/json/list`
      )
      const url = targets.find((target) => target.webSocketDebuggerUrl)?.webSocketDebuggerUrl
      if (!url) throw new Error('the inspector lists no target')
      const conn = await CdpConnection.open(url, ctx.now)
      const status = await cdpEvaluate<string>(conn, MAIN_INSTALL_EXPRESSION, 10_000).catch(
        (error) => {
          conn.close()
          throw error
        }
      )
      if (status !== 'installed' && status !== 'present') {
        conn.close()
        throw new Error(`unexpected install answer ${JSON.stringify(status)}`)
      }
      conn.onClose((reason) => {
        if (this.conn === conn) this.lost(reason)
      })
      this.conn = conn
      this.windowReads = 0
      ctx.blind.end('main-loop')
      this.lastFailure = ''
      ctx.log(`main-loop probe attached (inspector :${ctx.handles.inspectPort}, ${status})`)
    } catch (error) {
      ctx.blind.begin('main-loop')
      const text = error instanceof Error ? error.message : String(error)
      if (text !== this.lastFailure) {
        this.lastFailure = text
        ctx.log(`main-loop probe unavailable: ${text}`)
      }
    } finally {
      this.connecting = false
    }
  }

  private lost(reason: string): void {
    const { ctx } = this
    this.conn = null
    this.jsLate = null
    ctx.blind.begin('main-loop')
    this.block.release(ctx.thresholds.mainLoopBlockMs)
    ctx.timeline('event', { k: 'inspector-closed', reason })
    ctx.log(`main-loop probe lost: ${reason}`)
  }

  /** Every 100 ms; reads local state only. */
  watch(): void {
    const conn = this.conn
    if (!conn || conn.closed) return
    const { ctx } = this
    const now = ctx.now()
    const native = conn.oldestPendingAgeMs()
    const js = this.jsLate && now - this.jsLate.at <= JS_HOLD_MS ? this.jsLate.ms : 0
    const blocked = Math.max(native, js)
    this.block.live(
      blocked,
      ctx.thresholds.mainLoopBlockMs,
      native >= js
        ? 'inspector request unanswered (native block)'
        : 'heartbeat timer late (busy JS)'
    )
    if (blocked >= ctx.thresholds.sampleOnBlockMs) this.requestSample(now)
  }

  private requestSample(now: number): void {
    const { episodes } = this.ctx
    const open = episodes.isOpen(MAIN_LOOP_BLOCK_KEY)
      ? episodes.latest(MAIN_LOOP_BLOCK_KEY)
      : undefined
    this.sampler.request((file) => {
      const latest = episodes.latest(MAIN_LOOP_BLOCK_KEY)
      const breach = open ?? (latest && latest.at >= now ? latest : undefined)
      if (breach) breach.evidence = file
      this.ctx.timeline('event', { k: 'stall-sample', file })
    })
  }

  /** At most one peek in flight; the answer is the age of the heartbeat. */
  peek(): void {
    const conn = this.conn
    const { ctx } = this
    if (!conn || conn.closed || this.peekInFlight) return
    const now = ctx.now()
    if (now - this.lastPeekAt < PEEK_PERIOD_MS) return
    this.lastPeekAt = now
    this.peekInFlight = true
    cdpEvaluate<number>(conn, MAIN_PEEK_EXPRESSION, REQUEST_TIMEOUT_MS)
      .then((age) => {
        if (finite(age) && age >= 0) {
          // V8 answers the inspector from inside a busy JS loop; a slow answer means a native block, which the pending request already measured.
          if (ctx.now() - now <= SLOW_REPLY_MS)
            this.jsLate = { at: ctx.now(), ms: Math.max(0, age - LOOP_HEARTBEAT_MS) }
        } else if (age === -1) {
          return cdpEvaluate<string>(conn, MAIN_INSTALL_EXPRESSION, 10_000)
        }
        return undefined
      })
      .catch(() => undefined)
      .finally(() => {
        this.peekInFlight = false
      })
  }

  /** Once per probe interval: reconnect if needed, then read and reset the histograms. */
  async tick(): Promise<void> {
    if (!this.attached) await this.connect()
    await this.read()
  }

  private async read(): Promise<void> {
    const conn = this.conn
    const { ctx } = this
    if (!conn || conn.closed || this.readInFlight) return
    this.readInFlight = true
    const acc = ctx.phases.current
    const resetWindow = this.windowReads + 1 >= LOOP_WINDOW_READS
    let read: LoopRead | null
    try {
      read = await cdpEvaluate<LoopRead | null>(
        conn,
        mainReadExpression(resetWindow),
        REQUEST_TIMEOUT_MS
      )
      if (!read) await cdpEvaluate<string>(conn, MAIN_INSTALL_EXPRESSION, 10_000)
    } catch {
      return
    } finally {
      this.readInFlight = false
    }
    if (!read) return
    this.windowReads = resetWindow ? 0 : this.windowReads + 1
    this.consume(read, acc, resetWindow)
  }

  private consume(
    read: LoopRead,
    acc: ProbeContext['phases']['current'],
    windowComplete: boolean
  ): void {
    const { ctx } = this
    const limits = ctx.thresholds
    const n = finite(read.n) ? read.n : 0
    const late = finite(read.late) ? Math.max(0, read.late) : 0
    const max = Math.max(n > 0 && finite(read.max) ? delay(read.max) : 0, late)
    const p50 = n > 0 && finite(read.p50) ? delay(read.p50) : 0
    const p99 = n > 0 && finite(read.p99) ? delay(read.p99) : 0
    if (n > 0) acc.loopDelay.push(p99)
    acc.loopMax = Math.max(acc.loopMax, max)
    this.block.settle(max, limits.mainLoopBlockMs, 'event-loop delay (timer lateness)')
    if (windowComplete && finite(read.wn) && read.wn > 0 && finite(read.w99)) {
      ctx.episodes.observe(P99_KEY, 'main-loop-p99', delay(read.w99), limits.mainLoopP99Ms, {
        unit: 'ms',
        context: `p99 of ${read.wn} timer samples over ${LOOP_WINDOW_READS} reads`
      })
    }
    ctx.timeline('tick', {
      k: 'loop',
      n,
      p50: round(p50),
      p99: round(p99),
      max: round(max),
      late: round(late),
      elu: finite(read.elu) ? round(read.elu, 2) : null,
      beatAgeMs: finite(read.beatAge) ? round(read.beatAge) : null
    })
  }
}
