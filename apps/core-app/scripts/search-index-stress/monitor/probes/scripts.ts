/**
 * Source evaluated inside the app under test. Both probes are idempotent, hold no references to app
 * objects and cost a timer (main) or one rAF callback per frame (page).
 */

/** Node's histogram records the timer period too, so a reading of 10 means "no delay". */
export const LOOP_RESOLUTION_MS = 10

/** Period of the in-app heartbeat timer; a heartbeat older than this is late by the difference. */
export const LOOP_HEARTBEAT_MS = 25

/** The 5 s window histogram is read (and reset) every this many reads; p99 is judged on whole windows only. */
export const LOOP_WINDOW_READS = 5

/** `histogram.reset()` also clears Node's baseline, so a stall that straddles a read leaves no sample; `late` is only read and cleared. */
export const MAIN_INSTALL_EXPRESSION = `(() => {
  const g = globalThis
  if (g.__stressLoop) return 'present'
  const { monitorEventLoopDelay } = process.getBuiltinModule('node:perf_hooks')
  const make = () => { const h = monitorEventLoopDelay({ resolution: ${LOOP_RESOLUTION_MS} }); h.enable(); return h }
  const state = { sec: make(), win: make(), beat: performance.now(), late: 0, elu: performance.eventLoopUtilization() }
  g.__stressLoop = state
  setInterval(() => {
    const now = performance.now()
    const late = now - state.beat - ${LOOP_HEARTBEAT_MS}
    if (late > state.late) state.late = late
    state.beat = now
  }, ${LOOP_HEARTBEAT_MS}).unref()
  return 'installed'
})()`

/** Small enough to send four times a second: how long since the loop last ran a 25 ms timer. */
export const MAIN_PEEK_EXPRESSION = `(() => {
  const s = globalThis.__stressLoop
  return s ? performance.now() - s.beat : -1
})()`

export function mainReadExpression(resetWindow: boolean): string {
  return `(() => {
  const s = globalThis.__stressLoop
  if (!s) return null
  const ms = (ns) => ns / 1e6
  const sec = s.sec
  const out = {
    n: sec.count, mean: ms(sec.mean), p50: ms(sec.percentile(50)), p99: ms(sec.percentile(99)), max: ms(sec.max),
    wn: s.win.count, w99: ms(s.win.percentile(99)), wmax: ms(s.win.max),
    late: s.late,
    beatAge: performance.now() - s.beat,
    elu: performance.eventLoopUtilization(s.elu).utilization
  }
  s.elu = performance.eventLoopUtilization()
  s.late = 0
  sec.reset()
  ${resetWindow ? 's.win.reset()' : ''}
  return out
})()`
}

/**
 * Frame intervals come from a rAF loop and only count while the page is visible. An interval over
 * 500 ms with no long task or long animation frame inside it is a throttled rAF, not a block, and
 * is counted apart. `takeRecords` flushes observer entries so the check never races their delivery.
 */
export const PAGE_INSTALL_EXPRESSION = `(() => {
  if (window.top !== window) return 'frame'
  if (window.__stressPage) return 'present'
  const s = (window.__stressPage = {
    n: 0, o20: 0, o33: 0, o50: 0, o100: 0, worst: 0, thr: 0, last: 0, lastBusyEnd: 0,
    lt: 0, ltMax: 0, loaf: 0, loafMax: 0
  })
  const observe = (type, onEntry) => {
    try {
      const o = new PerformanceObserver((list) => { for (const e of list.getEntries()) onEntry(e) })
      o.observe({ type })
      return o
    } catch { return null }
  }
  const onLongTask = (e) => {
    s.lt++
    if (e.duration > s.ltMax) s.ltMax = e.duration
    if (e.startTime + e.duration > s.lastBusyEnd) s.lastBusyEnd = e.startTime + e.duration
  }
  const onLoaf = (e) => {
    s.loaf++
    const b = e.blockingDuration || 0
    if (b > s.loafMax) s.loafMax = b
    if (e.startTime + e.duration > s.lastBusyEnd) s.lastBusyEnd = e.startTime + e.duration
  }
  const ltObserver = observe('longtask', onLongTask)
  const loafObserver = observe('long-animation-frame', onLoaf)
  const frame = (t) => {
    if (document.visibilityState === 'visible') {
      if (ltObserver) for (const e of ltObserver.takeRecords()) onLongTask(e)
      if (loafObserver) for (const e of loafObserver.takeRecords()) onLoaf(e)
      if (s.last) {
        const d = t - s.last
        if (d >= 500 && s.lastBusyEnd < s.last) s.thr++
        else {
          s.n++
          if (d > 20) s.o20++
          if (d > 33) s.o33++
          if (d > 50) s.o50++
          if (d > 100) s.o100++
          if (d > s.worst) s.worst = d
        }
      }
      s.last = t
    } else s.last = 0
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  document.addEventListener('visibilitychange', () => { s.last = 0 })
  return 'installed'
})()`

export const PAGE_READ_EXPRESSION = `(() => {
  const s = window.__stressPage
  if (!s) return null
  const out = {
    vis: document.visibilityState === 'visible',
    n: s.n, o20: s.o20, o33: s.o33, o50: s.o50, o100: s.o100, worst: s.worst, thr: s.thr,
    lt: s.lt, ltMax: s.ltMax, loaf: s.loaf, loafMax: s.loafMax
  }
  s.n = 0; s.o20 = 0; s.o33 = 0; s.o50 = 0; s.o100 = 0; s.worst = 0; s.thr = 0
  s.lt = 0; s.ltMax = 0; s.loaf = 0; s.loafMax = 0
  return out
})()`
