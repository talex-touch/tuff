import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { NativeOcrOptions, NativeOcrResult } from '@talex-touch/tuff-native'

type Listener = (payload: unknown) => void

interface FakeUtilityChild {
  pid: number | undefined
  on: (event: string, listener: Listener) => FakeUtilityChild
  once: (event: string, listener: Listener) => FakeUtilityChild
  off: (event: string, listener: Listener) => FakeUtilityChild
  emit: (event: string, payload?: unknown) => void
  emitSpawn: () => void
  postMessage: Mock
  kill: Mock
  stdout: { on: (event: string, listener: Listener) => void }
  stderr: { on: (event: string, listener: Listener) => void }
  requests: () => Array<Record<string, unknown>>
  requestId: () => string
}

const ocrProcessMocks = vi.hoisted(() => {
  interface HoistedChild {
    pid: number | undefined
    on: (event: string, listener: Listener) => HoistedChild
    once: (event: string, listener: Listener) => HoistedChild
    off: (event: string, listener: Listener) => HoistedChild
    emit: (event: string, payload?: unknown) => void
    emitSpawn: () => void
    postMessage: Mock
    kill: Mock
    stdout: { on: (event: string, listener: Listener) => void }
    stderr: { on: (event: string, listener: Listener) => void }
    requests: () => Array<Record<string, unknown>>
    requestId: () => string
  }

  const children: HoistedChild[] = []
  // Production `utilityProcess.fork` returns pid === undefined until 'spawn'; a test can pre-set a
  // pid to cover the already-spawned fast path.
  let nextPid: number | undefined

  const createChild = (): HoistedChild => {
    const listeners = new Map<string, Listener[]>()
    const detach = (event: string, listener: Listener) => {
      const existing = listeners.get(event)
      if (!existing) return
      listeners.set(
        event,
        existing.filter((candidate) => candidate !== listener)
      )
    }
    const child: HoistedChild = {
      pid: nextPid,
      on: (event, listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
        return child
      },
      once: (event, listener) => {
        const wrapped: Listener = (payload) => {
          detach(event, wrapped)
          listener(payload)
        }
        listeners.set(event, [...(listeners.get(event) ?? []), wrapped])
        return child
      },
      off: (event, listener) => {
        detach(event, listener)
        return child
      },
      emit: (event, payload) => {
        for (const listener of [...(listeners.get(event) ?? [])]) listener(payload)
      },
      emitSpawn: () => {
        child.pid = child.pid ?? 4242
        for (const listener of [...(listeners.get('spawn') ?? [])]) listener(undefined)
      },
      postMessage: vi.fn(),
      kill: vi.fn(() => true),
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      requests: () =>
        child.postMessage.mock.calls
          .map((call) => call[0])
          .filter(
            (message): message is Record<string, unknown> =>
              Boolean(message) && typeof message === 'object' && message.type === 'ocr.request'
          ),
      requestId: () => {
        const request = child.requests()[0]
        if (!request || typeof request.requestId !== 'string' || !request.requestId) {
          throw new Error('no ocr.request frame was posted to the utility child')
        }
        return request.requestId
      }
    }
    return child
  }

  const fork = vi.fn((_childPath: string, _args: unknown[], _options: unknown) => {
    const child = createChild()
    children.push(child)
    return child
  })

  const appListeners = new Map<string, Listener[]>()
  const appOn = vi.fn((event: string, listener: Listener) => {
    appListeners.set(event, [...(appListeners.get(event) ?? []), listener])
  })
  const appOff = vi.fn((event: string, listener: Listener) => {
    const existing = appListeners.get(event)
    if (!existing) return
    appListeners.set(
      event,
      existing.filter((candidate) => candidate !== listener)
    )
  })
  const emitApp = (event: string): void => {
    for (const listener of [...(appListeners.get(event) ?? [])]) listener(undefined)
  }

  const reset = () => {
    children.length = 0
    nextPid = undefined
    appListeners.clear()
    appOn.mockReset()
    appOff.mockReset()
    fork.mockReset()
  }

  const setNextPid = (pid: number | undefined) => {
    nextPid = pid
  }

  return { children, fork, appOn, appOff, emitApp, setNextPid, reset }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/tuff-ocr-process-test'),
    on: ocrProcessMocks.appOn,
    off: ocrProcessMocks.appOff
  },
  utilityProcess: { fork: ocrProcessMocks.fork }
}))

const filesystemMocks = vi.hoisted(() => ({
  existsSync: vi.fn<(candidate: string) => boolean>(() => true)
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: filesystemMocks.existsSync,
    default: { ...actual, existsSync: filesystemMocks.existsSync }
  }
})

import { existsSync } from 'node:fs'
import { recognizeImageTextIsolated } from './ocr-process-client'

const mockedExistsSync = vi.mocked(existsSync)
const SUCCESS_CODE = 0
const CRASH_CODE = 134

/**
 * Resolves the freshly forked child whether the client forks synchronously or after its first
 * microtask, so the tests do not hard-code the spawn timing.
 */
async function spawnedChild(): Promise<FakeUtilityChild> {
  for (let tick = 0; tick < 8; tick += 1) {
    const child = ocrProcessMocks.children.at(-1)
    if (child) return child as unknown as FakeUtilityChild
    await Promise.resolve()
  }
  throw new Error('utilityProcess.fork was never called')
}

/**
 * Posts exist only after 'spawn' (production fork returns pid === undefined until then), so drive
 * the spawn event exactly as Electron does and then read back the request identity.
 */
async function awaitRequest(child: FakeUtilityChild): Promise<string> {
  for (let tick = 0; tick < 8 && child.requests().length === 0; tick += 1) {
    await Promise.resolve()
  }
  if (child.requests().length === 0) {
    child.emitSpawn()
    for (let tick = 0; tick < 8 && child.requests().length === 0; tick += 1) {
      await Promise.resolve()
    }
  }
  return child.requestId()
}

async function flushMicrotasks(times = 6): Promise<void> {
  for (let tick = 0; tick < times; tick += 1) await Promise.resolve()
}

interface Settlement<T> {
  settled: boolean
  status?: 'fulfilled' | 'rejected'
  value?: T
  reason?: unknown
}

/**
 * Records settlement without racing the promise. `expect(state().settled)` after a microtask flush
 * is the negative control: a client that resolved on a frame it was supposed to ignore fails here.
 */
function trackSettlement<T>(promise: Promise<T>): () => Settlement<T> {
  const state: Settlement<T> = { settled: false }
  promise.then(
    (value) => {
      state.settled = true
      state.status = 'fulfilled'
      state.value = value
    },
    (reason) => {
      state.settled = true
      state.status = 'rejected'
      state.reason = reason
    }
  )
  return () => state
}

function nativeResult(overrides: Partial<NativeOcrResult> = {}): NativeOcrResult {
  return {
    text: 'Hello OCR',
    confidence: 0.91,
    language: 'en',
    blocks: [{ text: 'Hello OCR', confidence: 0.91, boundingBox: [1, 2, 3, 4] }],
    engine: 'apple-vision',
    durationMs: 17,
    ...overrides
  }
}

function baseOptions(): NativeOcrOptions {
  return {
    image: Buffer.from('fake-image'),
    languageHint: 'en',
    includeLayout: true,
    maxBlocks: 120
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' ? (error as { code?: string }).code : undefined
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  ocrProcessMocks.reset()
  mockedExistsSync.mockReset()
  mockedExistsSync.mockReturnValue(true)
  vi.useRealTimers()
})

describe('recognizeImageTextIsolated terminal delivery', () => {
  it('resolves the native result on a matching success frame and never kills the exiting child', async () => {
    const result = nativeResult()
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)

    child.emit('message', { type: 'ocr.success', requestId, result })

    // The client rebuilds the result from the untrusted frame, so assert the value, not identity.
    await expect(promise).resolves.toEqual(result)
    // The success frame can land while the child's N-API completion callback is still unwinding; a
    // parent kill here aborts the whole Electron process instead of failing one request.
    expect(child.kill).not.toHaveBeenCalled()

    child.emit('exit', SUCCESS_CODE)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('maps a nonzero child exit before any result to OCR_PROCESS_EXITED without a second kill', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await awaitRequest(child)

    child.emit('exit', CRASH_CODE)

    const reason = await promise.catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('OCR_PROCESS_EXITED')
    expect((reason as Error).message).toContain(String(CRASH_CODE))
    // A child that already exited must not be killed again on the exit path.
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('maps a silent zero-code exit to OCR_PROCESS_INVALID_RESPONSE instead of resolving empty', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await awaitRequest(child)

    child.emit('exit', SUCCESS_CODE)

    const reason = await promise.catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('OCR_PROCESS_INVALID_RESPONSE')
  })

  it.each([
    { name: 'non-string text', result: { text: 42 } },
    { name: 'unknown engine', result: { text: 'ok', engine: 'tesseract', durationMs: 5 } },
    {
      name: 'non-numeric duration',
      result: { text: 'ok', engine: 'apple-vision', durationMs: '5' }
    }
  ])(
    'rejects a matching success frame with $name shape immediately as OCR_PROCESS_INVALID_RESPONSE',
    async ({ result }) => {
      const promise = recognizeImageTextIsolated(baseOptions())
      const child = await spawnedChild()
      const requestId = await awaitRequest(child)

      child.emit('message', { type: 'ocr.success', requestId, result })

      // A frame that carries our request id but an unusable result is a protocol violation: the
      // client must fail the request now, not hang until the deadline.
      const reason = await promise.catch((error: unknown) => error)
      expect(errorCode(reason)).toBe('OCR_PROCESS_INVALID_RESPONSE')
      expect(child.kill).not.toHaveBeenCalled()
    }
  )

  it('ignores a success frame carrying another request identity until the child exits', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await awaitRequest(child)
    const state = trackSettlement(promise)

    child.emit('message', {
      type: 'ocr.success',
      requestId: 'someone-else',
      result: nativeResult({ text: 'foreign' })
    })
    await flushMicrotasks()
    expect(state().settled).toBe(false)

    child.emit('exit', SUCCESS_CODE)
    await flushMicrotasks()
    expect(state().status).toBe('rejected')
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_INVALID_RESPONSE')
  })

  it('propagates the child-projected native error code and message', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)

    child.emit('message', {
      type: 'ocr.error',
      requestId,
      code: 'native-module-not-loaded',
      message: 'Native OCR module is unavailable on this platform'
    })

    const reason = await promise.catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('native-module-not-loaded')
    expect((reason as Error).message).toBe('Native OCR module is unavailable on this platform')
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('projects a pre-result child error event as OCR_PROCESS_EXITED without killing the dead child', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await awaitRequest(child)

    child.emit('error', 'Utility process aborted')

    const reason = await promise.catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('OCR_PROCESS_EXITED')
    expect((reason as Error).message).toContain('Utility process aborted')
    expect(child.kill).not.toHaveBeenCalled()
  })
})

describe('recognizeImageTextIsolated spawn gating', () => {
  it('does not post the request until the child reports spawn', async () => {
    const result = nativeResult()
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await flushMicrotasks()

    // Posting straight after fork can be dropped before the child exists; the request must wait
    // for the spawn event.
    expect(child.requests()).toHaveLength(0)

    child.emitSpawn()
    await flushMicrotasks()
    expect(child.requests()).toHaveLength(1)

    child.emit('message', {
      type: 'ocr.success',
      requestId: child.requestId(),
      result
    })
    await expect(promise).resolves.toEqual(result)
  })

  it('times out and reclaims a child that never spawns', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const state = trackSettlement(promise)
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(29_999)
    expect(state().settled).toBe(false)
    expect(child.kill).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    // The deadline covers the spawn wait, not only recognition: a process that never comes up is
    // still reclaimed instead of hanging the request forever.
    expect(state().status).toBe('rejected')
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()
    expect(child.requests()).toHaveLength(0)
  })

  it('does not reset the deadline when the child spawns late', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const state = trackSettlement(promise)
    await flushMicrotasks()

    // Spend most of the budget with no spawn; the request is still pending.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(state().settled).toBe(false)

    // A late spawn must not restart the clock: only the remaining budget is left, so the request
    // still expires exactly on the original deadline rather than getting a fresh 30s.
    child.emitSpawn()
    await flushMicrotasks()
    expect(child.requests()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(state().settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('posts immediately when fork already reports a pid', async () => {
    const result = nativeResult()
    ocrProcessMocks.setNextPid(4242)
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await flushMicrotasks()

    // An already-spawned child must not wait for a spawn event that will never be re-emitted.
    expect(child.pid).toBe(4242)
    expect(child.requests()).toHaveLength(1)

    child.emit('message', {
      type: 'ocr.success',
      requestId: child.requestId(),
      result
    })
    await expect(promise).resolves.toEqual(result)
  })
})

describe('recognizeImageTextIsolated deadline and cancellation', () => {
  it('keeps a silent child alive until the deadline, then reclaims it with OCR_PROCESS_TIMEOUT once', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    await awaitRequest(child)
    const state = trackSettlement(promise)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(state().settled).toBe(false)
    expect(child.kill).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(state().status).toBe('rejected')
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('honours a caller deadline that is shorter than the isolated default', async () => {
    const promise = recognizeImageTextIsolated(baseOptions(), { timeoutMs: 1_000 })
    const child = await spawnedChild()
    await awaitRequest(child)
    const state = trackSettlement(promise)

    await vi.advanceTimersByTimeAsync(999)
    expect(state().settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('keeps the timeout error when a result arrives after the child was reclaimed', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)
    const state = trackSettlement(promise)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()

    child.emit('message', {
      type: 'ocr.success',
      requestId,
      result: nativeResult({ text: 'late' })
    })
    await flushMicrotasks()
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_TIMEOUT')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('rejects an already-aborted signal before spawning any child', async () => {
    const controller = new AbortController()
    controller.abort()

    const reason = await recognizeImageTextIsolated(baseOptions(), {
      signal: controller.signal
    }).catch((error: unknown) => error)

    expect(errorCode(reason)).toBe('OCR_PROCESS_ABORTED')
    expect(ocrProcessMocks.fork).not.toHaveBeenCalled()
  })

  it('rejects OCR_PROCESS_ABORTED and reclaims the child when cancelled after spawn', async () => {
    const controller = new AbortController()
    const promise = recognizeImageTextIsolated(baseOptions(), { signal: controller.signal })
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)
    const state = trackSettlement(promise)

    controller.abort()
    await flushMicrotasks()

    expect(state().status).toBe('rejected')
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_ABORTED')
    expect(child.kill).toHaveBeenCalledOnce()

    child.emit('message', { type: 'ocr.success', requestId, result: nativeResult() })
    await flushMicrotasks()
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_ABORTED')
    expect(child.kill).toHaveBeenCalledOnce()
  })
})

describe('recognizeImageTextIsolated app quit reclamation', () => {
  it('reclaims the in-flight child when the app quits before a result', async () => {
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)
    const state = trackSettlement(promise)

    ocrProcessMocks.emitApp('before-quit')
    await flushMicrotasks()

    // An orphaned utility process would keep a native OCR job running after the parent is gone.
    expect(state().status).toBe('rejected')
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_ABORTED')
    expect(child.kill).toHaveBeenCalledOnce()

    child.emit('message', { type: 'ocr.success', requestId, result: nativeResult() })
    await flushMicrotasks()
    expect(errorCode(state().reason)).toBe('OCR_PROCESS_ABORTED')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('disarms the quit hook after a result so a later quit never kills the settled child', async () => {
    const result = nativeResult()
    const promise = recognizeImageTextIsolated(baseOptions())
    const child = await spawnedChild()
    const requestId = await awaitRequest(child)

    child.emit('message', { type: 'ocr.success', requestId, result })
    await expect(promise).resolves.toEqual(result)

    ocrProcessMocks.emitApp('before-quit')
    expect(child.kill).not.toHaveBeenCalled()
  })
})

describe('recognizeImageTextIsolated spawn failures and recycling', () => {
  it('rejects OCR_PROCESS_EXITED when the fork throws instead of leaking an uncaught throw', async () => {
    ocrProcessMocks.fork.mockImplementationOnce(() => {
      throw new Error('ocr-process.js missing from the packaged tree')
    })

    const reason = await recognizeImageTextIsolated(baseOptions()).catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('OCR_PROCESS_EXITED')
    expect((reason as Error).message).toContain('ocr-process.js missing from the packaged tree')
  })

  it('rejects OCR_PROCESS_EXITED without forking when the child artifact is absent', async () => {
    mockedExistsSync.mockReturnValue(false)

    const reason = await recognizeImageTextIsolated(baseOptions()).catch((error: unknown) => error)
    expect(errorCode(reason)).toBe('OCR_PROCESS_EXITED')
    expect(ocrProcessMocks.fork).not.toHaveBeenCalled()
  })

  it('fails only the crashed request and lets a later request succeed', async () => {
    const crashed = recognizeImageTextIsolated(baseOptions())
    const crashedChild = await spawnedChild()
    await awaitRequest(crashedChild)
    crashedChild.emit('exit', CRASH_CODE)
    await expect(crashed).rejects.toMatchObject({ code: 'OCR_PROCESS_EXITED' })

    const result = nativeResult({ text: 'second run' })
    const recovered = recognizeImageTextIsolated(baseOptions())
    const recoveredChild = await spawnedChild()
    const requestId = await awaitRequest(recoveredChild)
    expect(recoveredChild).not.toBe(crashedChild)
    expect(requestId).not.toBe(crashedChild.requestId())

    recoveredChild.emit('message', { type: 'ocr.success', requestId, result })
    await expect(recovered).resolves.toEqual(result)
    expect(ocrProcessMocks.children).toHaveLength(2)
  })
})
