import type {
  HerdrProjectedConversation,
  HerdrRuntimeSnapshot,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrStreamAttachRequest,
  HerdrStreamAttachResult,
  HerdrStreamClosedPayload,
  HerdrStreamDataPayload,
  HerdrStreamIoRequest,
} from '../transport/events/herdr'
import type { ITuffTransport } from '../transport/types'
import { describe, expect, it, vi } from 'vitest'
import {
  appSettingOriginData,
  DEFAULT_HERDR_CORE_SETTINGS,
  normalizeHerdrCoreSettings,
} from '../common/storage/entity/app-settings'
import { TuffEvents } from '../transport/events'
import { HerdrEvents } from '../transport/events/herdr'
import { createHerdrSdk } from '../transport/sdk/domains/herdr'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function makeSession(overrides: Partial<HerdrSessionView> = {}): HerdrSessionView {
  return {
    address: 't1',
    machine: null,
    name: 'shell',
    title: 'zsh',
    argv: ['/bin/zsh'],
    cwd: '/tmp',
    foregroundName: 'zsh',
    foregroundCwd: '/tmp',
    foregroundPid: 1234,
    state: 'live',
    status: null,
    statusMs: null,
    reported: false,
    turn: 0,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 120,
    rows: 30,
    pid: 1234,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1_700_000_000_000,
    finishedMs: null,
    ...overrides,
  }
}

function createFakeHerdrTransport(options?: { detachBarrier?: Promise<void> }) {
  const listeners = new Map<unknown, Set<(payload: unknown) => void>>()
  const attachRequests: HerdrStreamAttachRequest[] = []
  const ioRequests: HerdrStreamIoRequest[] = []
  const sendSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>()
  const pendingAttach = deferred<HerdrStreamAttachResult>()
  const detached = deferred<void>()
  const attachSettled = deferred<void>()

  const transport = {
    on(event: unknown, listener: (payload: unknown) => void) {
      const entries = listeners.get(event) ?? new Set()
      entries.add(listener)
      listeners.set(event, entries)
      return () => {
        entries.delete(listener)
      }
    },
    async send(event: unknown, payload?: unknown, sendOptions?: unknown) {
      sendSpy(event, payload, sendOptions)
      if (event === HerdrEvents.stream.attach) {
        attachRequests.push(payload as HerdrStreamAttachRequest)
        const result = await pendingAttach.promise
        attachSettled.resolve()
        return result
      }
      if (event === HerdrEvents.stream.io) {
        const io = payload as HerdrStreamIoRequest
        ioRequests.push(io)
        if (io.op === 'detach') {
          detached.resolve()
          await options?.detachBarrier
        }
        return undefined
      }
      return undefined
    },
  }

  return {
    sdk: createHerdrSdk(transport as unknown as ITuffTransport),
    pendingAttach,
    attachRequests,
    ioRequests,
    sendSpy,
    detached: detached.promise,
    attachSettled: attachSettled.promise,
    emit: (event: unknown, payload: unknown) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(payload)
      }
    },
    subscriptions: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  }
}

describe('HerdrEvents & createHerdrSdk mappings', () => {
  it('registers all typed herdr events under HerdrEvents and TuffEvents.herdr', () => {
    expect(TuffEvents.herdr).toBe(HerdrEvents)
    expect(HerdrEvents.runtime.getSnapshot.toEventName()).toBe('herdr:runtime:get-snapshot')
    expect(HerdrEvents.runtime.ensureStarted.toEventName()).toBe('herdr:runtime:ensure-started')
    expect(HerdrEvents.runtime.reconnect.toEventName()).toBe('herdr:runtime:reconnect')
    expect(HerdrEvents.terminal.run.toEventName()).toBe('herdr:terminal:run')
    expect(HerdrEvents.terminal.send.toEventName()).toBe('herdr:terminal:send')
    expect(HerdrEvents.terminal.keys.toEventName()).toBe('herdr:terminal:keys')
    expect(HerdrEvents.terminal.control.toEventName()).toBe('herdr:terminal:control')
    expect(HerdrEvents.terminal.read.toEventName()).toBe('herdr:terminal:read')
    expect(HerdrEvents.terminal.put.toEventName()).toBe('herdr:terminal:put')
    expect(HerdrEvents.stream.attach.toEventName()).toBe('herdr:stream:attach')
    expect(HerdrEvents.stream.io.toEventName()).toBe('herdr:stream:io')
    expect(HerdrEvents.projection.get.toEventName()).toBe('herdr:projection:get')
    expect(HerdrEvents.projection.watch.toEventName()).toBe('herdr:projection:watch')
    expect(HerdrEvents.projection.unwatch.toEventName()).toBe('herdr:projection:unwatch')
    expect(HerdrEvents.push.snapshotChanged.toEventName()).toBe('herdr:push:snapshot-changed')
    expect(HerdrEvents.push.sessionUpsert.toEventName()).toBe('herdr:push:session-upsert')
    expect(HerdrEvents.push.streamData.toEventName()).toBe('herdr:push:stream-data')
    expect(HerdrEvents.push.streamClosed.toEventName()).toBe('herdr:push:stream-closed')
    expect(HerdrEvents.push.projectionUpdated.toEventName()).toBe('herdr:push:projection-updated')
  })

  it('maps P3 dual-source projection RPCs and push updates cleanly', async () => {
    const fake = createFakeHerdrTransport()
    const receivedDirect: HerdrProjectedConversation[] = []
    const receivedGrouped: HerdrProjectedConversation[] = []

    const offDirect = fake.sdk.onProjectionUpdated(conv => receivedDirect.push(conv))
    const offGrouped = fake.sdk.projection.onUpdated(conv => receivedGrouped.push(conv))

    await fake.sdk.getProjection({ address: 't1', limit: 50 })
    await fake.sdk.watchProjection({ address: 't1', limit: 80 })
    await fake.sdk.unwatchProjection({ address: 't1' })
    await fake.sdk.projection.get({ address: 't2' })
    await fake.sdk.projection.watch({ address: 't2', limit: 40 })
    await fake.sdk.projection.unwatch({ address: 't2' })

    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.get, { address: 't1', limit: 50 }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.watch, { address: 't1', limit: 80 }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.unwatch, { address: 't1' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.get, { address: 't2' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.watch, { address: 't2', limit: 40 }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.projection.unwatch, { address: 't2' }, undefined)

    const sampleProjection: HerdrProjectedConversation = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'sess-abc',
      filePath: '/Users/demo/.claude/projects/proj/sess-abc.jsonl',
      available: true,
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          text: 'Running checks',
          reasoning: 'Need to inspect package.json',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'read_file',
              status: 'completed',
              argsPreview: '{"path":"package.json"}',
              outputPreview: '{"name":"tuff"}',
              isError: false,
            },
          ],
          timestamp: 1_700_000_001_000,
        },
      ],
      truncated: false,
      updatedAt: 1_700_000_002_000,
    }

    fake.emit(HerdrEvents.push.projectionUpdated, sampleProjection)
    expect(receivedDirect).toEqual([sampleProjection])
    expect(receivedGrouped).toEqual([sampleProjection])

    offDirect()
    offGrouped()
    expect(fake.subscriptions()).toBe(0)
  })

  it('forwards runtime, terminal, and push subscriptions cleanly', async () => {
    const fake = createFakeHerdrTransport()
    const snapshots: HerdrRuntimeSnapshot[] = []
    const upserts: HerdrSessionUpsertPayload[] = []

    const offSnapshot = fake.sdk.onSnapshotChanged(snapshot => snapshots.push(snapshot))
    const offUpsert = fake.sdk.onSessionUpsert(payload => upserts.push(payload))

    await fake.sdk.getSnapshot()
    await fake.sdk.ensureStarted({ forceBootstrap: true })
    await fake.sdk.reconnect()
    await fake.sdk.run({ argv: ['/bin/zsh'], cwd: '/workspace', keep: true })
    await fake.sdk.send({ terminal: 't1', text: 'echo hi' })
    await fake.sdk.keys({ terminal: 't1', keys: ['ctrl+c'] })
    await fake.sdk.interrupt('t1', 5)
    await fake.sdk.kill('t1')
    await fake.sdk.rm('t1')
    await fake.sdk.keep('t1', true)
    await fake.sdk.keep('t1', false)
    await fake.sdk.read({ terminal: 't1', lines: 200 })
    await fake.sdk.put({ terminal: 't1', name: 'img.png', data: 'AQID' })

    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.runtime.getSnapshot, undefined, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.runtime.ensureStarted, { forceBootstrap: true }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.runtime.reconnect, undefined, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.run, { argv: ['/bin/zsh'], cwd: '/workspace', keep: true }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.send, { terminal: 't1', text: 'echo hi' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.keys, { terminal: 't1', keys: ['ctrl+c'] }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.control, { terminal: 't1', action: 'interrupt', timeout: 5 }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.control, { terminal: 't1', action: 'kill' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.control, { terminal: 't1', action: 'rm' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.control, { terminal: 't1', action: 'keep-on' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.control, { terminal: 't1', action: 'keep-off' }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.read, { terminal: 't1', lines: 200 }, undefined)
    expect(fake.sendSpy).toHaveBeenCalledWith(HerdrEvents.terminal.put, { terminal: 't1', name: 'img.png', data: 'AQID' }, undefined)

    const sampleSnapshot: HerdrRuntimeSnapshot = {
      revision: 1,
      seq: 2,
      enabled: true,
      connection: 'connected',
      ownership: 'external',
      socketPath: '/tmp/default.sock',
      session: 'default',
      binaryPath: '/usr/local/bin/herdr-core',
      error: null,
      core: null,
      sessions: [makeSession()],
      machines: [],
      templates: [],
      updatedAt: 1_700_000_000_000,
    }
    const sampleUpsert: HerdrSessionUpsertPayload = {
      revision: 2,
      seq: 3,
      kind: 'restarted',
      address: 't1',
      session: makeSession(),
    }

    fake.emit(HerdrEvents.push.snapshotChanged, sampleSnapshot)
    fake.emit(HerdrEvents.push.sessionUpsert, sampleUpsert)

    expect(snapshots).toEqual([sampleSnapshot])
    expect(upserts).toEqual([sampleUpsert])

    offSnapshot()
    offUpsert()
    expect(fake.subscriptions()).toBe(0)
  })
})

describe('createHerdrSdk stream lifecycle', () => {
  it('buffers ordered early stream data and fast close before attach settles and ignores foreign streams', async () => {
    const fake = createFakeHerdrTransport()
    const received: unknown[] = []
    const resizes: Array<{ cols: number, rows: number }> = []

    const attaching = fake.sdk.attachStream(
      { terminal: 't1', cols: 100, rows: 30, resizeNotifications: true },
      {
        onResize: size => resizes.push(size),
        onData: data => received.push(data),
        onClosed: closed => received.push(closed),
      },
    )

    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'other-stream',
      data: 'foreign',
      bytes: 7,
    } satisfies HerdrStreamDataPayload)
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-1',
      data: '\u001B[2Jfirst-paint',
      bytes: 15,
      resize: { cols: 100, rows: 30 },
    } satisfies HerdrStreamDataPayload)
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-1',
      data: '你好',
      bytes: 6,
    } satisfies HerdrStreamDataPayload)
    fake.emit(HerdrEvents.push.streamClosed, {
      streamId: 'stream-1',
      terminal: 't1',
      reason: 'exited',
      exitCode: 0,
    } satisfies HerdrStreamClosedPayload)

    fake.pendingAttach.resolve({
      streamId: 'stream-1',
      terminal: makeSession({ address: 't1' }),
      automaticInput: true,
      resizeNotifications: true,
    })

    const handle = await attaching

    expect(resizes).toEqual([{ cols: 100, rows: 30 }])
    expect(received).toEqual([
      '\u001B[2Jfirst-paint',
      '你好',
      { streamId: 'stream-1', terminal: 't1', reason: 'exited', exitCode: 0 },
    ])
    // Immediate acks were emitted for the two early chunks before streamClosed.
    expect(fake.ioRequests).toEqual([
      { streamId: 'stream-1', op: 'ack', bytes: 15 },
      { streamId: 'stream-1', op: 'ack', bytes: 6 },
    ])
    // Listeners were cleaned up once streamClosed arrived.
    expect(fake.subscriptions()).toBe(0)

    // Subsequent late events and detach calls are no-ops.
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-1',
      data: 'late',
      bytes: 4,
    } satisfies HerdrStreamDataPayload)
    await handle.detach()
    expect(fake.ioRequests.filter(item => item.op === 'detach')).toEqual([])
  })

  it('holds ack(bytes) credit backpressure until onData promise settles when awaitDisplay is true', async () => {
    const fake = createFakeHerdrTransport()
    const firstDisplay = deferred<void>()
    const secondDisplay = deferred<void>()
    const displayGates = [firstDisplay.promise, secondDisplay.promise]
    const chunks: string[] = []

    const attaching = fake.sdk.attachStream(
      { terminal: 't2', cols: 80, rows: 24 },
      {
        awaitDisplay: true,
        onData: (data) => {
          chunks.push(data)
          return displayGates.shift()
        },
      },
    )

    fake.pendingAttach.resolve({
      streamId: 'stream-paced',
      terminal: makeSession({ address: 't2' }),
      automaticInput: true,
      resizeNotifications: false,
    })
    const handle = await attaching

    // Chunk 1 uses explicit byte length from frame metadata (e.g. UTF-8 CJK).
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-paced',
      data: '你好',
      bytes: 6,
    } satisfies HerdrStreamDataPayload)
    // Chunk 2 falls back to UTF-8 byte length when bytes is 0.
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-paced',
      data: '世界!',
      bytes: 0,
    } satisfies HerdrStreamDataPayload)

    await Promise.resolve()
    expect(chunks).toEqual(['你好', '世界!'])
    // Neither ack sent while display promises remain unsettled.
    expect(fake.ioRequests).toEqual([])

    firstDisplay.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.ioRequests).toEqual([
      { streamId: 'stream-paced', op: 'ack', bytes: 6 },
    ])

    // Even if display write rejects, credit is released so stream never deadlocks.
    secondDisplay.reject(new Error('xterm disposed'))
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.ioRequests).toEqual([
      { streamId: 'stream-paced', op: 'ack', bytes: 6 },
      { streamId: 'stream-paced', op: 'ack', bytes: 7 },
    ])

    await handle.detach()
  })

  it('supports write, sendAutoInput, resize, focus, idempotent detach, and refuses IO after detach', async () => {
    const barrier = deferred<void>()
    const fake = createFakeHerdrTransport({ detachBarrier: barrier.promise })
    const displayGate = deferred<void>()

    const attaching = fake.sdk.attachStream(
      { terminal: 'rohan/t7', cols: 120, rows: 40 },
      {
        awaitDisplay: true,
        onData: () => displayGate.promise,
      },
    )

    fake.pendingAttach.resolve({
      streamId: 'stream-io',
      terminal: makeSession({ address: 'rohan/t7', machine: 'rohan' }),
      automaticInput: true,
      resizeNotifications: false,
    })

    const handle = await attaching
    await handle.write('ls -la\r')
    await handle.sendAutoInput('echo auto\r')
    await handle.resize(140, 50)
    await handle.focus(true)
    await handle.focus(false)

    // Emit a chunk whose display finishes only after detach begins -> must NOT send late ack.
    fake.emit(HerdrEvents.push.streamData, {
      streamId: 'stream-io',
      data: 'pending',
      bytes: 7,
    } satisfies HerdrStreamDataPayload)

    const detachA = handle.detach()
    const detachB = handle.detach()

    await expect(handle.write('after-detach')).rejects.toThrow('HERDR_STREAM_CLOSED')
    await expect(handle.sendAutoInput('after-detach')).rejects.toThrow('HERDR_STREAM_CLOSED')
    await expect(handle.resize(80, 24)).rejects.toThrow('HERDR_STREAM_CLOSED')
    await expect(handle.focus(true)).rejects.toThrow('HERDR_STREAM_CLOSED')

    displayGate.resolve()
    barrier.resolve()
    await Promise.all([detachA, detachB])

    expect(fake.subscriptions()).toBe(0)
    expect(fake.ioRequests).toEqual([
      { streamId: 'stream-io', op: 'write', data: 'ls -la\r' },
      { streamId: 'stream-io', op: 'auto-input', data: 'echo auto\r' },
      { streamId: 'stream-io', op: 'resize', cols: 140, rows: 50 },
      { streamId: 'stream-io', op: 'focus', focused: true },
      { streamId: 'stream-io', op: 'focus', focused: false },
      { streamId: 'stream-io', op: 'detach' },
    ])
  })

  it('reclaims late-resolved stream via detach when aborted in flight and cleans up listeners', async () => {
    const fake = createFakeHerdrTransport()
    const controller = new AbortController()
    const received: string[] = []

    const attaching = fake.sdk.attachStream(
      { terminal: 't9', cols: 80, rows: 24 },
      {
        signal: controller.signal,
        onData: data => received.push(data),
      },
    )

    const rejection = expect(attaching).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejection
    expect(fake.subscriptions()).toBe(0)

    fake.pendingAttach.resolve({
      streamId: 'stream-late',
      terminal: makeSession({ address: 't9' }),
      automaticInput: false,
      resizeNotifications: false,
    })
    await fake.attachSettled
    await fake.detached

    expect(received).toEqual([])
    expect(fake.ioRequests).toEqual([{ streamId: 'stream-late', op: 'detach' }])
    expect(fake.subscriptions()).toBe(0)
  })

  it('does not send attach when signal is already aborted', async () => {
    const fake = createFakeHerdrTransport()
    const controller = new AbortController()
    controller.abort()

    await expect(
      fake.sdk.attachStream({ terminal: 't1', cols: 80, rows: 24 }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(fake.attachRequests).toEqual([])
    expect(fake.subscriptions()).toBe(0)
  })
})

describe('appSetting herdrCore & betaFeatures.herdrRuntime defaults', () => {
  it('enables betaFeatures.herdrRuntime by default and provides sensible herdrCore defaults', () => {
    expect(appSettingOriginData.betaFeatures.herdrRuntime).toBe(true)
    expect(appSettingOriginData.herdrCore).toEqual(DEFAULT_HERDR_CORE_SETTINGS)
    expect(appSettingOriginData.herdrCore).toEqual({
      autoStart: true,
      socketPath: '',
      session: 'default',
      binaryPath: '',
    })
  })

  it('normalizes legacy or partial herdrCore settings safely', () => {
    expect(normalizeHerdrCoreSettings(undefined)).toEqual(DEFAULT_HERDR_CORE_SETTINGS)
    expect(normalizeHerdrCoreSettings({ autoStart: false, session: '  dev  ', socketPath: ' /tmp/hc.sock ' })).toEqual({
      autoStart: false,
      socketPath: '/tmp/hc.sock',
      session: 'dev',
      binaryPath: '',
    })
    expect(normalizeHerdrCoreSettings({ session: '   ' }).session).toBe('default')
  })
})
