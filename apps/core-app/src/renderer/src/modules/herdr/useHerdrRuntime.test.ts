// @vitest-environment jsdom

import type {
  HerdrProjectedConversation,
  HerdrRuntimeSnapshot,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrStreamClosedPayload,
  HerdrStreamHandle,
  HerdrStreamHandlers
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

const mocks = vi.hoisted(() => {
  const snapshotListeners = new Set<(snapshot: HerdrRuntimeSnapshot) => void>()
  const upsertListeners = new Set<(payload: HerdrSessionUpsertPayload) => void>()
  const projectionListeners = new Set<(conversation: HerdrProjectedConversation) => void>()
  const attachHandlers = new Map<string, HerdrStreamHandlers>()
  const streamDetachFns = new Map<string, ReturnType<typeof vi.fn>>()
  const getProjection = vi.fn()
  const watchProjection = vi.fn()
  const unwatchProjection = vi.fn(async () => {})
  const onProjectionUpdated = vi.fn(
    (listener: (conversation: HerdrProjectedConversation) => void) => {
      projectionListeners.add(listener)
      return () => projectionListeners.delete(listener)
    }
  )

  return {
    snapshotListeners,
    upsertListeners,
    projectionListeners,
    attachHandlers,
    streamDetachFns,
    appSetting: {
      betaFeatures: {
        herdrRuntime: true
      },
      herdrCore: {
        autoStart: true,
        socketPath: '',
        session: 'default',
        binaryPath: ''
      }
    },
    sdk: {
      getSnapshot: vi.fn(),
      ensureStarted: vi.fn(),
      reconnect: vi.fn(),
      run: vi.fn(),
      send: vi.fn(),
      keys: vi.fn(),
      control: vi.fn(),
      interrupt: vi.fn(),
      kill: vi.fn(),
      rm: vi.fn(),
      keep: vi.fn(),
      read: vi.fn(),
      put: vi.fn(),
      attachStream: vi.fn(),
      getProjection,
      watchProjection,
      unwatchProjection,
      onProjectionUpdated,
      projection: {
        get: getProjection,
        watch: watchProjection,
        unwatch: unwatchProjection,
        onUpdated: onProjectionUpdated
      },
      onSnapshotChanged: vi.fn((listener: (snapshot: HerdrRuntimeSnapshot) => void) => {
        snapshotListeners.add(listener)
        return () => snapshotListeners.delete(listener)
      }),
      onSessionUpsert: vi.fn((listener: (payload: HerdrSessionUpsertPayload) => void) => {
        upsertListeners.add(listener)
        return () => upsertListeners.delete(listener)
      })
    }
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn(), on: vi.fn(() => () => {}) })
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/herdr', () => ({
  createHerdrSdk: () => mocks.sdk
}))

const projectsRef = ref<ProjectRecord[]>([])

vi.mock('~/stores/projects', () => ({
  useProjectStore: () => ({
    get projects() {
      return projectsRef.value
    }
  })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

import {
  __resetHerdrRuntimeForTesting,
  matchSessionProject,
  useHerdrRuntime
} from './useHerdrRuntime'

function makeSession(overrides: Partial<HerdrSessionView> = {}): HerdrSessionView {
  return {
    address: 't1',
    machine: null,
    name: null,
    title: '',
    argv: ['zsh'],
    cwd: '/Users/dev/project-a',
    foregroundName: 'zsh',
    foregroundCwd: null,
    foregroundPid: 1001,
    state: 'live',
    status: { state: 'idle' },
    statusMs: 1000,
    reported: false,
    turn: 0,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 1000,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1000,
    finishedMs: null,
    ...overrides
  }
}

function makeSnapshot(overrides: Partial<HerdrRuntimeSnapshot> = {}): HerdrRuntimeSnapshot {
  return {
    revision: 1,
    seq: 1,
    enabled: true,
    connection: 'connected',
    ownership: 'external',
    socketPath: '/tmp/herdr.sock',
    session: 'default',
    binaryPath: '/usr/local/bin/hc',
    error: null,
    core: {
      id: 'core-1',
      name: 'default',
      version: '0.2.0',
      pid: 42,
      uptimeMs: 5000,
      liveCount: 0,
      finishedCount: 0,
      socketPath: '/tmp/herdr.sock',
      session: 'default',
      generation: 1,
      features: []
    },
    sessions: [],
    machines: [],
    templates: [],
    updatedAt: 1000,
    ...overrides
  }
}

describe('useHerdrRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.snapshotListeners.clear()
    mocks.upsertListeners.clear()
    mocks.projectionListeners.clear()
    mocks.attachHandlers.clear()
    mocks.streamDetachFns.clear()
    mocks.sdk.projection.get.mockResolvedValue({
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'sess-1',
      filePath: '/tmp/sess-1.jsonl',
      available: true,
      messages: [],
      truncated: false,
      updatedAt: 100
    })
    mocks.sdk.projection.watch.mockResolvedValue({
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'sess-1',
      filePath: '/tmp/sess-1.jsonl',
      available: true,
      messages: [],
      truncated: false,
      updatedAt: 100
    })
    mocks.sdk.projection.unwatch.mockResolvedValue(undefined)
    projectsRef.value = [
      {
        id: 'proj-root',
        rootPath: '/Users/dev',
        name: 'Dev Root',
        pinned: false,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1
      },
      {
        id: 'proj-a',
        rootPath: '/Users/dev/project-a',
        name: 'Project A',
        pinned: true,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1
      }
    ]
    mocks.sdk.getSnapshot.mockResolvedValue(makeSnapshot())
    mocks.sdk.attachStream.mockImplementation(
      async (req: { terminal: string }, handlers: HerdrStreamHandlers) => {
        mocks.attachHandlers.set(req.terminal, handlers)
        const detachFn = vi.fn(async () => {})
        mocks.streamDetachFns.set(req.terminal, detachFn)
        const handle: HerdrStreamHandle = {
          streamId: `stream-${req.terminal}`,
          terminal: makeSession({ address: req.terminal }),
          automaticInput: true,
          resizeNotifications: true,
          write: vi.fn(async () => {}),
          sendAutoInput: vi.fn(async () => {}),
          resize: vi.fn(async () => {}),
          focus: vi.fn(async () => {}),
          detach: detachFn
        }
        return handle
      }
    )
    __resetHerdrRuntimeForTesting()
  })

  afterEach(() => {
    __resetHerdrRuntimeForTesting()
  })

  it('matches deepest local project root via foregroundCwd || cwd and ignores remote machines', () => {
    const matchedDeep = matchSessionProject(
      {
        machine: null,
        cwd: '/Users/dev',
        foregroundCwd: '/Users/dev/project-a/packages/app'
      },
      projectsRef.value
    )
    expect(matchedDeep).toEqual({ projectId: 'proj-a', projectName: 'Project A' })

    const remote = matchSessionProject(
      {
        machine: 'prod-box',
        cwd: '/Users/dev/project-a',
        foregroundCwd: '/Users/dev/project-a'
      },
      projectsRef.value
    )
    expect(remote).toEqual({ projectId: null, projectName: null })
  })

  it('subscribes to snapshotChanged & sessionUpsert, sorts sessions, and projects projects', async () => {
    const scope = effectScope()
    const runtime = scope.run(() => useHerdrRuntime())!
    await Promise.resolve()
    await Promise.resolve()

    const sIdle = makeSession({
      address: 't1',
      name: 'shell',
      status: { state: 'idle' },
      statusMs: 3000
    })
    const sWorking = makeSession({
      address: 't2',
      name: 'codex-task',
      status: { state: 'working', progress: 40 },
      statusMs: 2000,
      foregroundCwd: '/Users/dev/project-a/src'
    })
    const sBlocked = makeSession({
      address: 't3',
      name: 'claude-auth',
      status: { state: 'blocked', kind: 'permission' },
      statusMs: 1500
    })
    const sFinished = makeSession({
      address: 't4',
      name: 'done-build',
      state: 'finished',
      finishedMs: 4000,
      status: { state: 'done' }
    })

    for (const listener of mocks.snapshotListeners) {
      listener(
        makeSnapshot({ revision: 2, seq: 10, sessions: [sIdle, sWorking, sBlocked, sFinished] })
      )
    }

    expect(runtime.liveSessions.value.map((s) => s.address)).toEqual(['t3', 't2', 't1'])
    expect(runtime.finishedSessions.value.map((s) => s.address)).toEqual(['t4'])
    expect(runtime.hasBlockedSession.value).toBe(true)
    expect(runtime.liveSessions.value[1]?.projectId).toBe('proj-a')
    expect(runtime.liveSessions.value[1]?.projectName).toBe('Project A')

    // Stale revision snapshot is ignored.
    for (const listener of mocks.snapshotListeners) {
      listener(makeSnapshot({ revision: 1, seq: 99, sessions: [] }))
    }
    expect(runtime.liveCount.value).toBe(3)

    // Session upsert updates existing session and removes on kind='removed'.
    for (const listener of mocks.upsertListeners) {
      listener({
        revision: 3,
        seq: 11,
        kind: 'removed',
        address: 't1',
        session: null
      })
    }
    expect(runtime.liveSessions.value.map((s) => s.address)).toEqual(['t3', 't2'])

    scope.stop()
  })

  it('ignores null-session doc upserts without deleting matching terminal addresses or fabricating snapshot', async () => {
    // Keep initial getSnapshot pending so snapshot.value starts null.
    let resolveInitial!: (snap: HerdrRuntimeSnapshot) => void
    mocks.sdk.getSnapshot.mockReturnValue(
      new Promise<HerdrRuntimeSnapshot>((resolve) => {
        resolveInitial = resolve
      })
    )

    const scope = effectScope()
    const runtime = scope.run(() => useHerdrRuntime())!

    // Early doc event before snapshot arrives must NOT fabricate a connected snapshot.
    for (const listener of mocks.upsertListeners) {
      listener({
        revision: 1,
        seq: 1,
        kind: 'doc',
        address: 't1',
        session: null
      })
    }
    expect(runtime.snapshot.value).toBeNull()
    expect(runtime.connection.value).toBe('disconnected')

    // Hydrate snapshot with terminal 't1'.
    resolveInitial(
      makeSnapshot({
        revision: 2,
        seq: 5,
        sessions: [makeSession({ address: 't1', name: 'main-shell' })]
      })
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.liveSessions.value.map((s) => s.address)).toEqual(['t1'])

    // Subsequent doc event sharing address 't1' must preserve terminal 't1' and advance revision/seq.
    for (const listener of mocks.upsertListeners) {
      listener({
        revision: 3,
        seq: 6,
        kind: 'doc',
        address: 't1',
        session: null
      })
    }
    expect(runtime.liveSessions.value.map((s) => s.address)).toEqual(['t1'])
    expect(runtime.snapshot.value?.revision).toBe(3)
    expect(runtime.snapshot.value?.seq).toBe(6)

    scope.stop()
  })

  it('wraps run, send, interrupt, kill, rm, keep, ensureStarted, reconnect', async () => {
    const runtime = useHerdrRuntime()
    await Promise.resolve()

    const created = makeSession({ address: 't9', name: 'build' })
    mocks.sdk.run.mockResolvedValue(created)
    mocks.sdk.send.mockResolvedValue({ turn: 1, status: 'working', started: true })
    mocks.sdk.interrupt.mockResolvedValue({
      terminal: 't9',
      action: 'interrupt',
      outcome: 'stopped'
    })
    mocks.sdk.keep.mockResolvedValue({
      terminal: 't9',
      action: 'keep-on',
      session: { ...created, keep: true }
    })
    mocks.sdk.kill.mockResolvedValue({
      terminal: 't9',
      action: 'kill',
      session: { ...created, state: 'finished' }
    })
    mocks.sdk.rm.mockResolvedValue({ terminal: 't9', action: 'rm', removed: 't9' })
    mocks.sdk.ensureStarted.mockResolvedValue(makeSnapshot({ revision: 4, ownership: 'managed' }))
    mocks.sdk.reconnect.mockResolvedValue(makeSnapshot({ revision: 5, connection: 'connected' }))

    await runtime.run({ name: 'build' })
    expect(runtime.sessionByAddress.value.get('t9')?.name).toBe('build')

    await runtime.send('t9', 'npm test')
    expect(mocks.sdk.send).toHaveBeenCalledWith({ terminal: 't9', text: 'npm test' })

    await runtime.interrupt('t9')
    expect(mocks.sdk.interrupt).toHaveBeenCalledWith('t9', undefined)

    await runtime.keep('t9', true)
    expect(runtime.sessionByAddress.value.get('t9')?.keep).toBe(true)

    await runtime.kill('t9')
    expect(mocks.sdk.kill).toHaveBeenCalledWith('t9')
    expect(runtime.sessionByAddress.value.get('t9')?.state).toBe('finished')

    await runtime.rm('t9')
    expect(runtime.sessionByAddress.value.get('t9')).toBeUndefined()

    const ensured = await runtime.ensureStarted({ forceBootstrap: true })
    expect(ensured.ownership).toBe('managed')

    const reconnected = await runtime.reconnect()
    expect(reconnected.revision).toBe(5)
  })

  it('defaults tab close to detach (without kill) and auto-reattaches on restarted status', async () => {
    const runtime = useHerdrRuntime()
    await Promise.resolve()

    const tab = runtime.openTerminalTab('t7')
    expect(runtime.drawerTabs.value).toHaveLength(1)

    await runtime.attach(tab.id, { cols: 80, rows: 24 })
    expect(runtime.isAttached('t7')).toBe(true)

    // Stream closed with reason 'restarted' bumps reattachNonce on the open tab.
    const onClosedPayload: HerdrStreamClosedPayload = {
      streamId: 'stream-t7',
      terminal: 't7',
      reason: 'restarted'
    }
    mocks.attachHandlers.get('t7')?.onClosed?.(onClosedPayload)
    expect(runtime.isAttached('t7')).toBe(false)
    expect(runtime.drawerTabs.value[0]?.reattachNonce).toBe(1)

    // sessionUpsert with kind 'restarted' also triggers auto-reattach.
    for (const listener of mocks.upsertListeners) {
      listener({
        revision: 6,
        seq: 20,
        kind: 'restarted',
        address: 't7',
        session: makeSession({ address: 't7', state: 'live' })
      })
    }
    expect(runtime.drawerTabs.value[0]?.reattachNonce).toBe(2)

    // Re-attach, then closeTab -> detaches stream WITHOUT killing the process!
    await runtime.attach(tab.id, { cols: 80, rows: 24, resumed: true })
    await runtime.closeTab(tab.id)
    expect(mocks.streamDetachFns.get('t7')).toHaveBeenCalledTimes(1)
    expect(mocks.sdk.kill).not.toHaveBeenCalled()
    expect(runtime.drawerTabs.value).toHaveLength(0)

    // Explicit killTab detaches AND calls sdk.kill.
    const tab2 = runtime.openTerminalTab('t8')
    await runtime.attach(tab2.id, { cols: 80, rows: 24 })
    mocks.sdk.kill.mockResolvedValue({ terminal: 't8', action: 'kill' })
    await runtime.killTab(tab2.id)
    expect(mocks.sdk.kill).toHaveBeenCalledWith('t8')
    expect(runtime.drawerTabs.value).toHaveLength(0)
  })

  it('opens structured tabs on demand, streams projection updates, switches viewMode, and unwatches on close/dispose', async () => {
    const scope = effectScope()
    const runtime = scope.run(() => useHerdrRuntime())!
    await Promise.resolve()

    const initialProjection: HerdrProjectedConversation = {
      address: 't12',
      provider: 'codex',
      nativeSessionId: 'codex-1',
      filePath: '/tmp/codex-1.jsonl',
      available: true,
      messages: [{ id: 'm1', role: 'user', text: 'Run tests', timestamp: 1000 }],
      truncated: false,
      updatedAt: 1000
    }
    mocks.sdk.projection.watch.mockResolvedValueOnce(initialProjection)

    const tab = runtime.openSessionStructured('t12')
    await Promise.resolve()
    await Promise.resolve()

    expect(tab.viewMode).toBe('structured')
    expect(tab.terminalMounted).toBe(false)
    expect(mocks.sdk.attachStream).not.toHaveBeenCalled()
    expect(mocks.sdk.projection.watch).toHaveBeenCalledWith({ address: 't12' })
    expect(runtime.projectionsByAddress.t12?.messages).toHaveLength(1)

    // Push update updates reactive projection map and ignores stale older updatedAt.
    for (const listener of mocks.projectionListeners) {
      listener({
        ...initialProjection,
        messages: [
          ...initialProjection.messages,
          { id: 'm2', role: 'assistant', text: 'All green', timestamp: 2000 }
        ],
        updatedAt: 2000
      })
      listener({ ...initialProjection, updatedAt: 500 })
    }
    expect(runtime.projectionsByAddress.t12?.messages).toHaveLength(2)

    // Switching to terminal mode flips terminalMounted=true; switching back keeps terminalMounted=true.
    runtime.setTabViewMode(tab.id, 'terminal')
    expect(runtime.drawerTabs.value[0]?.viewMode).toBe('terminal')
    expect(runtime.drawerTabs.value[0]?.terminalMounted).toBe(true)
    runtime.setTabViewMode(tab.id, 'structured')
    expect(runtime.drawerTabs.value[0]?.viewMode).toBe('structured')
    expect(runtime.drawerTabs.value[0]?.terminalMounted).toBe(true)

    // refreshProjection calls sdk.projection.get.
    mocks.sdk.projection.get.mockResolvedValueOnce({ ...initialProjection, updatedAt: 3000 })
    await runtime.refreshProjection('t12', 50)
    expect(mocks.sdk.projection.get).toHaveBeenCalledWith({ address: 't12', limit: 50 })

    // Closing tab unwatches projection cleanly.
    await runtime.closeTab(tab.id)
    expect(mocks.sdk.projection.unwatch).toHaveBeenCalledWith({ address: 't12' })
    expect(runtime.isWatchingProjection('t12')).toBe(false)

    // Scope dispose cleans up any remaining watched projection.
    mocks.sdk.projection.watch.mockResolvedValueOnce({ ...initialProjection, address: 't13' })
    await runtime.watchProjection('t13')
    expect(runtime.isWatchingProjection('t13')).toBe(true)
    scope.stop()
    expect(mocks.sdk.projection.unwatch).toHaveBeenCalledWith({ address: 't13' })
  })
})
