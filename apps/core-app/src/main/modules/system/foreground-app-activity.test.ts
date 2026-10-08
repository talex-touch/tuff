import type {
  ForegroundActivation,
  ForegroundActivationHandlers,
  ForegroundActivityEntry
} from './foreground-app-activity'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  systemPreferences: {}
}))

vi.mock('../../utils/logger', () => {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: (): unknown => log
  }
  return { createLogger: () => log }
})

const polling = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn(), start: vi.fn() }))
vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: { getInstance: () => polling }
}))

import {
  FOREGROUND_ACTIVITY_WINDOW_MS,
  FOREGROUND_MIN_DWELL_MS,
  ForegroundAppActivityTracker,
  parseRunningApplicationDescription
} from './foreground-app-activity'

const SELF_BUNDLE_ID = 'com.tagzxia.app.tuff'
const START_AT = 1_700_000_000_000

function activation(bundleId: string, pid = 4242): ForegroundActivation {
  return { bundleId, appKey: bundleId.toLowerCase(), pid }
}

function createHarness(
  options: {
    enabled?: boolean
    names?: Record<string, string | null | Error>
    rows?: ForegroundActivityEntry[]
    frontmost?: { activation: ForegroundActivation; name: string | null } | null
    source?: boolean
  } = {}
) {
  let now = START_AT
  let enabled = options.enabled ?? true
  let handlers: ForegroundActivationHandlers | null = null
  const unsubscribe = vi.fn()
  const saved: ForegroundActivityEntry[][] = []
  const store = {
    rows: options.rows ?? [],
    load: vi.fn(async () => store.rows),
    save: vi.fn(async (entries: ForegroundActivityEntry[]) => {
      saved.push(entries)
    })
  }
  const nameOf = vi.fn(async (bundleId: string) => {
    const name = options.names?.[bundleId] ?? null
    if (name instanceof Error) throw name
    return name
  })
  const tracker = new ForegroundAppActivityTracker({
    subscribe: (next) => {
      if (options.source === false) return null
      handlers = next
      return unsubscribe
    },
    isEnabled: () => enabled,
    describe: { nameOf, frontmost: vi.fn(async () => options.frontmost ?? null) },
    now: () => now
  })
  const require = (): ForegroundActivationHandlers => {
    if (!handlers) throw new Error('tracker not started')
    return handlers
  }
  return {
    tracker,
    store,
    saved,
    nameOf,
    unsubscribe,
    get now() {
      return now
    },
    advance: (ms: number) => {
      now += ms
    },
    setEnabled: (value: boolean) => {
      enabled = value
    },
    activate: (bundleId: string, pid?: number) => require().onActivate(activation(bundleId, pid)),
    pause: () => require().onPause(),
    resume: () => require().onResume()
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('parseRunningApplicationDescription', () => {
  it('reads the bundle id and pid out of the NSRunningApplication description', () => {
    expect(
      parseRunningApplicationDescription(
        '<NSRunningApplication: 0x600003a1c000 (com.apple.finder - 872) LSASN:{0x0-0x3c03c}>'
      )
    ).toEqual({ bundleId: 'com.apple.finder', appKey: 'com.apple.finder', pid: 872 })
  })

  it('drops a process without a reverse-DNS bundle id, and anything that is not a string', () => {
    expect(
      parseRunningApplicationDescription('<NSRunningApplication: 0x1 (node - 123) LSASN:{0x0-0x1}>')
    ).toBeNull()
    expect(parseRunningApplicationDescription(undefined)).toBeNull()
    expect(parseRunningApplicationDescription({ description: 'x' })).toBeNull()
  })
})

describe('ForegroundAppActivityTracker', () => {
  it('credits a stay when the next app takes over and reads the app in front as "now"', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)

    h.activate('com.apple.Safari')
    h.advance(5_000)
    expect(h.tracker.view()?.lastActiveAt('com.apple.Safari')).toBe(h.now)
    expect(h.tracker.view()?.recent(5)).toEqual([
      { appKey: 'com.apple.safari', lastActiveAt: h.now }
    ])

    const switchedAt = h.now
    h.activate('com.microsoft.VSCode')
    h.advance(2_000)
    const view = h.tracker.view()
    expect(view?.lastActiveAt('COM.APPLE.SAFARI')).toBe(switchedAt)
    expect(view?.lastActiveAt('com.microsoft.vscode')).toBe(h.now)
    expect(view?.recent(5).map((entry) => entry.appKey)).toEqual([
      'com.microsoft.vscode',
      'com.apple.safari'
    ])
  })

  it('treats a stay shorter than the dwell as a pass-through', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)

    h.activate('com.apple.Finder')
    h.advance(FOREGROUND_MIN_DWELL_MS - 1)
    expect(h.tracker.view()?.lastActiveAt('com.apple.finder')).toBeNull()
    h.activate('com.apple.Safari')

    expect(h.tracker.view()?.lastActiveAt('com.apple.finder')).toBeNull()
    expect(h.tracker.view()?.recent(5)).toEqual([])
  })

  it("ends the previous stay on Touch's own activation without starting one", async () => {
    const h = createHarness()
    await h.tracker.start(h.store)

    h.activate('com.apple.Safari')
    h.advance(3_000)
    const switchedAt = h.now
    h.activate(SELF_BUNDLE_ID)
    h.advance(10_000)

    const view = h.tracker.view()
    expect(view?.lastActiveAt('com.apple.safari')).toBe(switchedAt)
    expect(view?.lastActiveAt(SELF_BUNDLE_ID)).toBeNull()
    expect(view?.recent(5)).toEqual([{ appKey: 'com.apple.safari', lastActiveAt: switchedAt }])
    // The same by process id, for an unexpected bundle id of our own.
    h.activate('com.apple.Notes', process.pid)
    h.advance(3_000)
    expect(h.tracker.view()?.lastActiveAt('com.apple.notes')).toBeNull()
  })

  it('closes the stay on lock or sleep and reopens it on resume', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)

    h.activate('com.apple.Safari')
    h.advance(2_000)
    const lockedAt = h.now
    h.pause()
    h.advance(60_000)
    expect(h.tracker.view()?.lastActiveAt('com.apple.safari')).toBe(lockedAt)

    h.resume()
    h.advance(2_000)
    expect(h.tracker.view()?.lastActiveAt('com.apple.safari')).toBe(h.now)
  })

  it('records nothing while the switch is off and forgets the stay in progress', async () => {
    const h = createHarness({ enabled: false })
    await h.tracker.start(h.store)

    h.activate('com.apple.Safari')
    h.advance(5_000)
    expect(h.tracker.view()).toBeNull()
    h.activate('com.microsoft.VSCode')

    h.setEnabled(true)
    expect(h.tracker.view()?.lastActiveAt('com.apple.safari')).toBeNull()
    await h.tracker.flush()
    expect(h.store.save).not.toHaveBeenCalled()
  })

  it('flushes what changed, stamps the stay in progress, and re-queues a failed write', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)
    expect(polling.register).toHaveBeenCalledWith(
      'foreground-app-activity.flush',
      expect.any(Function),
      expect.objectContaining({ lane: 'maintenance' })
    )

    h.activate('com.apple.Safari')
    h.advance(2_000)
    const switchedAt = h.now
    h.activate('com.microsoft.VSCode')
    h.advance(2_000)

    await h.tracker.flush()
    expect(h.saved).toEqual([
      expect.arrayContaining([
        { appKey: 'com.apple.safari', lastActiveAt: switchedAt },
        { appKey: 'com.microsoft.vscode', lastActiveAt: h.now }
      ])
    ])
    expect(h.saved[0]).toHaveLength(2)

    h.store.save.mockRejectedValueOnce(new Error('disk full'))
    h.advance(1_000)
    await h.tracker.flush()
    expect(h.saved).toHaveLength(1)
    await h.tracker.flush()
    expect(h.saved[1]).toEqual([{ appKey: 'com.microsoft.vscode', lastActiveAt: h.now }])
  })

  it('loads the persisted window at start and ignores instants that fell out of it', async () => {
    const inside = START_AT - FOREGROUND_ACTIVITY_WINDOW_MS + 1
    const h = createHarness({
      rows: [
        { appKey: 'com.apple.mail', lastActiveAt: inside },
        { appKey: 'com.apple.notes', lastActiveAt: START_AT - FOREGROUND_ACTIVITY_WINDOW_MS - 1 }
      ]
    })
    await h.tracker.start(h.store)

    expect(h.store.load).toHaveBeenCalledWith(new Date(START_AT - FOREGROUND_ACTIVITY_WINDOW_MS))
    const view = h.tracker.view()
    expect(view?.lastActiveAt('com.apple.mail')).toBe(inside)
    expect(view?.lastActiveAt('com.apple.notes')).toBeNull()
    expect(view?.recent(5)).toEqual([{ appKey: 'com.apple.mail', lastActiveAt: inside }])
  })

  it('drops memory on resetFromStore and keeps only what the store still holds', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)
    h.activate('com.apple.Safari')
    h.advance(2_000)
    h.activate('com.microsoft.VSCode')
    h.advance(2_000)

    h.store.rows = []
    await h.tracker.resetFromStore()

    const view = h.tracker.view()
    expect(view?.lastActiveAt('com.apple.safari')).toBeNull()
    // The stay in progress is use happening after the deletion.
    expect(view?.lastActiveAt('com.microsoft.vscode')).toBe(h.now)
  })

  it('reports the app in front without spawning, with the name once the lookup settles', async () => {
    const h = createHarness({ names: { 'com.apple.Safari': 'Safari' } })
    await h.tracker.start(h.store)
    expect(h.tracker.readForegroundApp()).toBeNull()

    h.activate('com.apple.Safari', 777)
    const first = h.tracker.readForegroundApp()
    expect(first?.app).toMatchObject({
      bundleId: 'com.apple.Safari',
      identifier: 'com.apple.Safari',
      displayName: null,
      processId: 777,
      platform: 'macos'
    })
    expect(first?.pendingName).toBeInstanceOf(Promise)
    await expect(first?.pendingName).resolves.toBe('Safari')

    const second = h.tracker.readForegroundApp()
    expect(second?.app).toMatchObject({ displayName: 'Safari', identifier: 'Safari' })
    expect(second?.pendingName).toBeNull()
    expect(h.nameOf).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed name lookup on every switch back to the app', async () => {
    const h = createHarness({ names: { 'com.apple.Safari': new Error('lsappinfo exploded') } })
    await h.tracker.start(h.store)

    h.activate('com.apple.Safari')
    await expect(h.tracker.readForegroundApp()?.pendingName).resolves.toBeNull()
    h.activate('com.microsoft.VSCode')
    h.activate('com.apple.Safari')
    expect(h.tracker.readForegroundApp()?.pendingName).toBeNull()
    expect(h.nameOf).toHaveBeenCalledTimes(2)

    h.advance(10 * 60_000)
    h.activate('com.apple.Safari')
    expect(h.nameOf).toHaveBeenCalledTimes(3)
  })

  it('names the app already in front at start, before any activation arrives', async () => {
    const h = createHarness({
      frontmost: { activation: activation('com.apple.Mail', 99), name: 'Mail' }
    })
    await h.tracker.start(h.store)
    await settle()

    expect(h.tracker.readForegroundApp()?.app).toMatchObject({
      bundleId: 'com.apple.Mail',
      displayName: 'Mail',
      processId: 99
    })
    expect(h.tracker.readForegroundApp()?.pendingName).toBeNull()
    h.advance(2_000)
    expect(h.tracker.view()?.lastActiveAt('com.apple.mail')).toBe(h.now)
  })

  it('stops: unsubscribes, credits the stay in progress, writes out, and goes dark', async () => {
    const h = createHarness()
    await h.tracker.start(h.store)
    h.activate('com.apple.Safari')
    h.advance(2_000)

    await h.tracker.stop()

    expect(h.unsubscribe).toHaveBeenCalledOnce()
    expect(polling.unregister).toHaveBeenCalledWith('foreground-app-activity.flush')
    expect(h.saved).toEqual([[{ appKey: 'com.apple.safari', lastActiveAt: h.now }]])
    expect(h.tracker.view()).toBeNull()
    expect(h.tracker.readForegroundApp()).toBeNull()
  })

  it('stays inert without an activation source', async () => {
    const h = createHarness({ source: false })
    polling.register.mockClear()
    await h.tracker.start(h.store)

    expect(h.tracker.view()).toBeNull()
    expect(h.tracker.readForegroundApp()).toBeNull()
    expect(h.store.load).not.toHaveBeenCalled()
    expect(polling.register).not.toHaveBeenCalled()
  })
})
