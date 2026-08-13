/**
 * Two retention leaks in the plugin transport's port handling, both of which the sibling renderer
 * transport already solved:
 *
 * - #877 a confirm arriving before its `openPort` waiter was queued with no expiry, so a live
 *   MessagePort stayed pinned until destroy(). Each failed open leaked one native port plus the
 *   entangled main-side channel.
 * - #878 `abandonedPorts` was a Set cleared only in destroy(). A confirm can never arrive once the
 *   main process has reaped the record, so those ids are worthless immediately and the set only
 *   ever grew.
 *
 * Both bounds are invisible from the public surface - nothing observable changes until the heap
 * does - so these read the private maps directly, the same way the renderer's own lifecycle test
 * does. The constants are mirrored here because the module keeps them private.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'
import { TransportEvents } from '../transport/events'

/** Mirrors PORT_CONFIRM_TIMEOUT_MS, the retention window for an unclaimed confirm. */
const PORT_CONFIRM_TIMEOUT_MS = 10000
/** Mirrors ABANDONED_PORT_RETENTION_MS / ABANDONED_PORT_MAX_ENTRIES. */
const ABANDONED_PORT_RETENTION_MS = 30000
const ABANDONED_PORT_MAX_ENTRIES = 64

const CHANNEL = 'test:port:channel'

interface Internals {
  handlePortConfirm: (port: unknown, payload: unknown) => void
  rememberAbandonedPort: (portId: string) => void
  waitForPortConfirm: (portId: string, channel: string, timeoutMs: number) => Promise<unknown>
  queuedPortConfirms: Map<string, { port: FakePort, timeout?: unknown }>
  abandonedPorts: Map<string, number>
}

class FakePort {
  closed = false
  close(): void {
    this.closed = true
  }

  start(): void {}
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

function createTransport() {
  const sent: Array<{ eventName: string, payload: unknown }> = []
  const sendToMain = vi.fn(async (eventName: string, payload?: unknown) => {
    sent.push({ eventName, payload })
    return undefined
  })
  const transport = createPluginTuffTransport({ sendToMain } as never)
  return { transport, internals: transport as unknown as Internals, sent }
}

function confirmPayload(portId: string) {
  return { portId, channel: CHANNEL }
}

describe('plugin transport port retention is bounded', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('无人认领的排队 confirm 会过期,并关闭那个 MessagePort (#877)', () => {
    const { internals, sent } = createTransport()
    const port = new FakePort()

    internals.handlePortConfirm(port, confirmPayload('port-1'))
    expect(internals.queuedPortConfirms.has('port-1')).toBe(true)

    vi.advanceTimersByTime(PORT_CONFIRM_TIMEOUT_MS + 1)

    expect(internals.queuedPortConfirms.has('port-1')).toBe(false)
    expect(port.closed).toBe(true)
    expect(
      sent.some(
        entry =>
          entry.eventName === TransportEvents.port.close.toEventName()
          && (entry.payload as { reason?: string })?.reason === 'confirm_unclaimed',
      ),
    ).toBe(true)
  })

  it('过期之前认领仍然拿得到那个 port(否则上一条会掩盖"永远拿不到")', async () => {
    const { internals } = createTransport()
    const port = new FakePort()

    internals.handlePortConfirm(port, confirmPayload('port-2'))
    const claimed = await internals.waitForPortConfirm('port-2', CHANNEL, PORT_CONFIRM_TIMEOUT_MS)

    expect(claimed).toMatchObject({ port })
    expect(port.closed).toBe(false)
  })

  // Asserting only "the claimed port is not closed later" does NOT detect a missing clearTimeout:
  // discardQueuedPortConfirm early-returns once the entry is gone, so the stale timer fires
  // harmlessly. The observable difference is the pending timer itself, so that is what is checked.
  it('认领之后计时器被清掉,不留悬挂的 timer (#877)', async () => {
    const { internals } = createTransport()
    const port = new FakePort()

    internals.handlePortConfirm(port, confirmPayload('port-3'))
    expect(vi.getTimerCount()).toBe(1)

    await internals.waitForPortConfirm('port-3', CHANNEL, PORT_CONFIRM_TIMEOUT_MS)

    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(PORT_CONFIRM_TIMEOUT_MS + 1)
    expect(port.closed).toBe(false)
  })

  it('abandonedPorts 有条数上限,不再无限增长 (#878)', () => {
    const { internals } = createTransport()

    for (let i = 0; i < ABANDONED_PORT_MAX_ENTRIES * 3; i += 1) {
      internals.rememberAbandonedPort(`port-${i}`)
    }

    expect(internals.abandonedPorts.size).toBeLessThanOrEqual(ABANDONED_PORT_MAX_ENTRIES)
  })

  it('abandonedPorts 也按年龄淘汰:主进程已回收记录后那些 id 一文不值 (#878)', () => {
    const { internals } = createTransport()
    internals.rememberAbandonedPort('stale')

    vi.advanceTimersByTime(ABANDONED_PORT_RETENTION_MS + 1)
    internals.rememberAbandonedPort('fresh')

    expect(internals.abandonedPorts.has('stale')).toBe(false)
    expect(internals.abandonedPorts.has('fresh')).toBe(true)
  })

  // A later rememberAbandonedPort is what runs the sweep, so it has to happen between recording
  // and the late confirm. Without it, an entry born already-expired is still *present* in the map
  // and the rejection passes for the wrong reason.
  it('仍在保留期内的 id,经过一次淘汰扫描后依然会拒绝迟到的 confirm', () => {
    const { internals } = createTransport()
    const port = new FakePort()
    internals.rememberAbandonedPort('port-late')

    vi.advanceTimersByTime(1000)
    internals.rememberAbandonedPort('port-other')
    expect(internals.abandonedPorts.has('port-late')).toBe(true)

    internals.handlePortConfirm(port, confirmPayload('port-late'))

    expect(port.closed).toBe(true)
    expect(internals.queuedPortConfirms.has('port-late')).toBe(false)
    // Consumed, so a second confirm for the same id is treated as a fresh one.
    expect(internals.abandonedPorts.has('port-late')).toBe(false)
  })
})
