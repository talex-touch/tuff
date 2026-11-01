import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  LOOP_HEARTBEAT_MS,
  MAIN_INSTALL_EXPRESSION,
  MAIN_PEEK_EXPRESSION,
  PAGE_INSTALL_EXPRESSION,
  PAGE_READ_EXPRESSION,
  mainReadExpression
} from './probes/scripts'

/** The scripts run inside the app under test, so they are executed here against a fake clock and fake browser APIs. */

function appSandbox() {
  let clock = 1_000
  const timers: Array<{ fn: () => void; ms: number }> = []
  const histograms: Array<{ resets: number; enabled: boolean }> = []
  const makeHistogram = () => {
    const histogram = {
      resets: 0,
      enabled: false,
      count: 0,
      max: 0,
      mean: 0,
      enable() {
        histogram.enabled = true
      },
      reset() {
        histogram.resets++
      },
      percentile: () => 0
    }
    histograms.push(histogram)
    return histogram
  }
  const context = vm.createContext({
    performance: { now: () => clock, eventLoopUtilization: () => ({ utilization: 0 }) },
    process: { getBuiltinModule: () => ({ monitorEventLoopDelay: makeHistogram }) },
    setInterval: (fn: () => void, ms: number) => {
      timers.push({ fn, ms })
      return { unref() {} }
    }
  })
  return {
    run: (expression: string) => vm.runInContext(expression, context) as unknown,
    advance: (ms: number) => {
      clock += ms
    },
    timers,
    histograms
  }
}

describe('the main-process script', () => {
  it('installs once, with one heartbeat timer and two enabled histograms', () => {
    const app = appSandbox()
    expect(app.run(MAIN_INSTALL_EXPRESSION)).toBe('installed')
    expect(app.run(MAIN_INSTALL_EXPRESSION)).toBe('present')
    expect(app.timers.map((timer) => timer.ms)).toEqual([LOOP_HEARTBEAT_MS])
    expect(app.histograms.map((histogram) => histogram.enabled)).toEqual([true, true])
  })

  it('reads no lateness from a heartbeat that keeps its schedule, and the age of the last beat from a peek', () => {
    const app = appSandbox()
    app.run(MAIN_INSTALL_EXPRESSION)
    for (let beat = 0; beat < 4; beat++) {
      app.advance(LOOP_HEARTBEAT_MS)
      app.timers[0].fn()
    }
    app.advance(10)
    expect(app.run(MAIN_PEEK_EXPRESSION)).toBe(10)
    expect(app.run(mainReadExpression(false))).toMatchObject({ late: 0, beatAge: 10 })
  })

  it('reports a stall as the heartbeat lateness once the timer finally fires, and clears it on the read', () => {
    const app = appSandbox()
    app.run(MAIN_INSTALL_EXPRESSION)
    app.advance(LOOP_HEARTBEAT_MS)
    app.timers[0].fn()
    app.advance(600)
    expect(app.run(MAIN_PEEK_EXPRESSION)).toBe(600)
    app.timers[0].fn()
    expect(app.run(mainReadExpression(false))).toMatchObject({ late: 575 })
    expect(app.run(mainReadExpression(false))).toMatchObject({ late: 0 })
  })

  it('keeps a stall that a read interrupted: the read clears nothing the timer has not yet recorded', () => {
    const app = appSandbox()
    app.run(MAIN_INSTALL_EXPRESSION)
    app.advance(LOOP_HEARTBEAT_MS)
    app.timers[0].fn()
    app.advance(400)
    expect(app.run(mainReadExpression(true))).toMatchObject({ late: 0, beatAge: 400 })
    app.advance(200)
    app.timers[0].fn()
    expect(app.run(mainReadExpression(false))).toMatchObject({ late: 575 })
  })

  it('keeps the worst lateness between two reads, not the last', () => {
    const app = appSandbox()
    app.run(MAIN_INSTALL_EXPRESSION)
    for (const stall of [300, 40, 120]) {
      app.advance(stall)
      app.timers[0].fn()
    }
    expect(app.run(mainReadExpression(false))).toMatchObject({ late: 300 - LOOP_HEARTBEAT_MS })
  })

  it('resets the per-read histogram on every read and the 5 s window only when asked', () => {
    const app = appSandbox()
    app.run(MAIN_INSTALL_EXPRESSION)
    const [second, window] = app.histograms
    app.run(mainReadExpression(false))
    expect([second.resets, window.resets]).toEqual([1, 0])
    app.run(mainReadExpression(true))
    expect([second.resets, window.resets]).toEqual([2, 1])
  })

  it('answers a peek and a read with a marker before it was installed', () => {
    const app = appSandbox()
    expect(app.run(MAIN_PEEK_EXPRESSION)).toBe(-1)
    expect(app.run(mainReadExpression(true))).toBeNull()
  })
})

interface FakeEntry {
  startTime: number
  duration: number
  blockingDuration?: number
}

function pageSandbox(options: { framed?: boolean } = {}) {
  let visible = true
  let frameCallback: ((t: number) => void) | null = null
  const observers: Array<{
    type: string
    records: FakeEntry[]
    callback: (list: { getEntries(): FakeEntry[] }) => void
  }> = []
  const listeners: Array<() => void> = []

  class FakeObserver {
    private readonly slot: (typeof observers)[number]

    constructor(callback: (list: { getEntries(): FakeEntry[] }) => void) {
      this.slot = { type: '', records: [], callback }
      observers.push(this.slot)
    }

    observe(init: { type: string }): void {
      this.slot.type = init.type
    }

    takeRecords(): FakeEntry[] {
      return this.slot.records.splice(0)
    }
  }

  const sandbox: Record<string, unknown> = {
    PerformanceObserver: FakeObserver,
    requestAnimationFrame: (callback: (t: number) => void) => {
      frameCallback = callback
    },
    document: {
      get visibilityState() {
        return visible ? 'visible' : 'hidden'
      },
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener)
    }
  }
  sandbox.window = sandbox
  sandbox.top = options.framed ? {} : sandbox
  const context = vm.createContext(sandbox)
  return {
    run: (expression: string) => vm.runInContext(expression, context) as unknown,
    frame: (t: number) => frameCallback!(t),
    record: (type: 'longtask' | 'long-animation-frame', entry: FakeEntry) => {
      observers.find((observer) => observer.type === type)!.records.push(entry)
    },
    setVisible: (value: boolean) => {
      visible = value
      for (const listener of listeners) listener()
    },
    observers
  }
}

describe('the page script', () => {
  it('installs once, watches long tasks and long animation frames, and leaves iframes alone', () => {
    const page = pageSandbox()
    expect(page.run(PAGE_READ_EXPRESSION)).toBeNull()
    expect(page.run(PAGE_INSTALL_EXPRESSION)).toBe('installed')
    expect(page.run(PAGE_INSTALL_EXPRESSION)).toBe('present')
    expect(page.observers.map((observer) => observer.type)).toEqual([
      'longtask',
      'long-animation-frame'
    ])
    expect(pageSandbox({ framed: true }).run(PAGE_INSTALL_EXPRESSION)).toBe('frame')
  })

  it('counts frame intervals, slow ones by their size, and clears the counters on the read', () => {
    const page = pageSandbox()
    page.run(PAGE_INSTALL_EXPRESSION)
    let t = 100
    page.frame(t)
    for (const gap of [17, 17, 20, 21, 25, 33, 40, 60, 120, 17]) {
      t += gap
      page.frame(t)
    }
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      vis: true,
      n: 10,
      o20: 6,
      o33: 3,
      o50: 2,
      o100: 1,
      worst: 120,
      thr: 0
    })
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      n: 0,
      o20: 0,
      o33: 0,
      o50: 0,
      o100: 0,
      worst: 0
    })
  })

  it('reports long tasks and the blocking part of long animation frames', () => {
    const page = pageSandbox()
    page.run(PAGE_INSTALL_EXPRESSION)
    page.frame(100)
    page.record('longtask', { startTime: 110, duration: 90 })
    page.record('longtask', { startTime: 210, duration: 301 })
    page.record('long-animation-frame', { startTime: 210, duration: 301, blockingDuration: 251 })
    page.frame(520)
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      lt: 2,
      ltMax: 301,
      loaf: 1,
      loafMax: 251
    })
  })

  it('does not call a throttled requestAnimationFrame a block, but a long interval around a long task is one', () => {
    const page = pageSandbox()
    page.run(PAGE_INSTALL_EXPRESSION)
    page.frame(100)
    page.frame(1_100)
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({ n: 0, thr: 1, worst: 0 })
    page.record('longtask', { startTime: 1_150, duration: 700 })
    page.frame(1_900)
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      n: 1,
      thr: 0,
      o100: 1,
      worst: 800,
      lt: 1
    })
  })

  it('counts nothing while the page is hidden and measures no interval across the gap', () => {
    const page = pageSandbox()
    page.run(PAGE_INSTALL_EXPRESSION)
    page.frame(100)
    page.setVisible(false)
    page.frame(5_000)
    page.frame(5_017)
    page.frame(5_400)
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      vis: false,
      n: 0,
      o20: 0,
      o50: 0,
      thr: 0,
      worst: 0
    })
    page.setVisible(true)
    page.frame(9_000)
    page.frame(9_017)
    expect(page.run(PAGE_READ_EXPRESSION)).toMatchObject({
      vis: true,
      n: 1,
      o20: 0,
      o50: 0,
      thr: 0,
      worst: 17
    })
  })
})
