import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  const workers: MockWorker[] = []

  class MockWorker {
    readonly threadId = 1
    readonly messages: unknown[] = []
    terminateCalls = 0
    private readonly handlers = new Map<string, Handler[]>()

    constructor(readonly workerPath: string) {
      workers.push(this)
    }

    on(event: string, handler: Handler): this {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    postMessage(message: unknown): void {
      this.messages.push(message)
    }

    emit(event: string, payload: unknown): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload)
      }
    }

    terminate(): Promise<number> {
      this.terminateCalls += 1
      return Promise.resolve(0)
    }
  }

  return { MockWorker, workers }
})

vi.mock('node:worker_threads', () => ({
  Worker: workerMock.MockWorker
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn()
  })
}))

import { SearchIndexWorkerClient } from './search-index-worker-client'

function taskIdOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('taskId' in message)) {
    throw new Error('message has no taskId')
  }
  return String((message as { taskId: unknown }).taskId)
}

function messageTypeOf(message: unknown): string {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    throw new Error('message has no type')
  }
  return String((message as { type: unknown }).type)
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('SearchIndexWorkerClient init gate', () => {
  beforeEach(() => {
    workerMock.workers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for init before dispatching atomic provider item writes', async () => {
    const client = new SearchIndexWorkerClient()
    const item = {
      itemId: 'file:/tmp/demo.txt',
      providerId: 'file-provider',
      type: 'file',
      name: 'demo.txt'
    }
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0]).toMatchObject({ type: 'init' })

    const applyPromise = client.applyProviderItems(
      'file-provider',
      [item],
      ['file:/tmp/legacy.txt']
    )
    expect(worker.messages).toHaveLength(1)

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(worker.messages[1]).toMatchObject({
      type: 'applyProviderItems',
      providerId: 'file-provider',
      items: [item],
      legacyItemIds: ['file:/tmp/legacy.txt']
    })
    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[1]),
      result: { removedItems: 0, indexedItems: 1 }
    })

    await expect(applyPromise).resolves.toEqual({ removedItems: 0, indexedItems: 1 })
  })

  it('rejects pending atomic provider writes on init failure and allows init retry', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!
    const applyPromise = client.applyProviderItems(
      'file-provider',
      [
        {
          itemId: 'file:/tmp/demo.txt',
          providerId: 'file-provider',
          type: 'file',
          name: 'demo.txt'
        }
      ],
      []
    )

    const initRejection = expect(initPromise).rejects.toThrow('init failed')
    const applyRejection = expect(applyPromise).rejects.toThrow('init failed')

    worker.emit('message', {
      type: 'error',
      taskId: taskIdOf(worker.messages[0]),
      error: 'init failed'
    })

    await initRejection
    await applyRejection

    const retryPromise = client.init('/tmp/search-index.db')
    expect(worker.messages).toHaveLength(2)
    expect(worker.messages[1]).toMatchObject({ type: 'init' })

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })

    await expect(retryPromise).resolves.toBeUndefined()
  })

  it('restarts and reinitializes on demand after idle shutdown', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(1)

    const applyPromise = client.applyProviderItems(
      'file-provider',
      [
        {
          itemId: 'file:/tmp/demo.txt',
          providerId: 'file-provider',
          type: 'file',
          name: 'demo.txt'
        }
      ],
      ['file:/tmp/legacy.txt']
    )
    const restartedWorker = workerMock.workers.at(-1)!

    expect(workerMock.workers).toHaveLength(2)
    expect(restartedWorker.messages).toHaveLength(1)
    expect(restartedWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })

    restartedWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(restartedWorker.messages[0])
    })
    await vi.waitFor(() => expect(restartedWorker.messages).toHaveLength(2))
    expect(restartedWorker.messages[1]).toMatchObject({
      type: 'applyProviderItems',
      providerId: 'file-provider',
      items: [
        expect.objectContaining({
          itemId: 'file:/tmp/demo.txt',
          providerId: 'file-provider'
        })
      ],
      legacyItemIds: ['file:/tmp/legacy.txt']
    })

    restartedWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(restartedWorker.messages[1]),
      result: { removedItems: 0, indexedItems: 1 }
    })

    await expect(applyPromise).resolves.toEqual({ removedItems: 0, indexedItems: 1 })
  })

  it('waits for deferred idle retirement before reinitializing, then retries the write', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const init = client.init('/tmp/search-index.db')
    const retiringWorker = workerMock.workers.at(-1)!
    retiringWorker.emit('message', { type: 'done', taskId: taskIdOf(retiringWorker.messages[0]) })
    await init

    const termination = deferred<number>()
    const terminate = vi.spyOn(retiringWorker, 'terminate').mockReturnValue(termination.promise)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(terminate).toHaveBeenCalledTimes(1)
    await expect(
      client.applyProviderItems(
        'file-provider',
        [
          {
            itemId: 'file:/tmp/retry.txt',
            providerId: 'file-provider',
            type: 'file',
            name: 'retry'
          }
        ],
        []
      )
    ).rejects.toThrow('SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:pending')
    expect(workerMock.workers).toHaveLength(1)
    expect(retiringWorker.messages).toHaveLength(1)

    termination.resolve(0)
    await vi.advanceTimersByTimeAsync(0)

    const retry = client.applyProviderItems(
      'file-provider',
      [{ itemId: 'file:/tmp/retry.txt', providerId: 'file-provider', type: 'file', name: 'retry' }],
      []
    )
    expect(workerMock.workers).toHaveLength(2)
    const replacementWorker = workerMock.workers.at(-1)!
    expect(replacementWorker.messages).toHaveLength(1)
    expect(replacementWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    replacementWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(replacementWorker.messages[0])
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(replacementWorker.messages[1]).toMatchObject({ type: 'applyProviderItems' })
    replacementWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(replacementWorker.messages[1]),
      result: { removedItems: 0, indexedItems: 1 }
    })

    await expect(retry).resolves.toEqual({ removedItems: 0, indexedItems: 1 })
  })

  it('keeps drain pending through an unresolved idle termination and releases it after settlement', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const init = client.init('/tmp/search-index.db')
    const retiringWorker = workerMock.workers.at(-1)!
    retiringWorker.emit('message', { type: 'done', taskId: taskIdOf(retiringWorker.messages[0]) })
    await init

    const termination = deferred<number>()
    const terminate = vi.spyOn(retiringWorker, 'terminate').mockReturnValue(termination.promise)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(terminate).toHaveBeenCalledTimes(1)

    const drain = client.drain(1)
    void drain.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(1)
    await expect(drain).rejects.toThrow('SEARCH_INDEX_WRITER_DRAIN_TIMEOUT')
    expect(workerMock.workers).toHaveLength(1)
    expect(terminate).toHaveBeenCalledTimes(1)

    termination.resolve(0)
    await vi.advanceTimersByTimeAsync(0)
    await expect(client.drain()).resolves.toBeUndefined()
  })

  it('does not terminate during status metrics sampling and restarts the idle window after timeout', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const statusPromise = client.getStatus()
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(messageTypeOf(worker.messages[1])).toBe('metrics')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminateCalls).toBe(0)
    await expect(statusPromise).resolves.toMatchObject({
      name: 'search-index',
      state: 'idle',
      metrics: null
    })

    await vi.advanceTimersByTimeAsync(300)
    expect(worker.terminateCalls).toBe(1)
  })

  it('reports pending work while an atomic provider item write is in flight', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const applyPromise = client.applyProviderItems(
      'file-provider',
      [
        {
          itemId: 'file:/tmp/demo.txt',
          providerId: 'file-provider',
          type: 'file',
          name: 'demo.txt'
        }
      ],
      []
    )
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(client.hasPendingWork()).toBe(true)

    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[1]),
      result: { removedItems: 0, indexedItems: 1 }
    })
    await applyPromise

    expect(client.hasPendingWork()).toBe(false)
  })

  it('rejects pending work and releases drain waiters during shutdown', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const pendingWrite = client.applyProviderItems(
      'file-provider',
      [
        {
          itemId: 'file:/tmp/pending.md',
          providerId: 'file-provider',
          type: 'file',
          name: 'pending.md'
        }
      ],
      []
    )
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    const drain = client.drain()

    client.shutdown()

    await expect(pendingWrite).rejects.toThrow('SEARCH_INDEX_WRITER_CLOSED')
    await expect(drain).resolves.toBeUndefined()
    expect(client.hasPendingWork()).toBe(false)
  })

  it('dispatches provider-scoped item removal and returns removed count', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const removePromise = client.removeProviderItems('file-provider', ['file:/tmp/demo.txt'])
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(worker.messages[1]).toMatchObject({
      type: 'removeProviderItems',
      providerId: 'file-provider',
      itemIds: ['file:/tmp/demo.txt']
    })

    worker.emit('message', {
      type: 'done',
      taskId: taskIdOf(worker.messages[1]),
      result: 1
    })

    await expect(removePromise).resolves.toBe(1)
  })

  it('dispatches provider clear and returns removed count', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const removePromise = client.removeByProvider('file-provider')
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(worker.messages[1]).toMatchObject({
      type: 'removeByProvider',
      providerId: 'file-provider'
    })

    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[1]),
      result: 4
    })

    await expect(removePromise).resolves.toBe(4)
  })

  it('normalizes scan progress writes before dispatching worker tasks', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'result', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const upsertPromise = client.upsertScanProgress(
      ['/tmp/root-a', '', '/tmp/root-a', '/tmp/root-b'],
      '2026-06-20T10:00:00.000Z',
      'file-provider'
    )
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    expect(worker.messages[1]).toMatchObject({
      type: 'upsertScanProgress',
      paths: ['/tmp/root-a', '/tmp/root-b'],
      lastScanned: '2026-06-20T10:00:00.000Z',
      sourceId: 'file-provider'
    })

    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[1]),
      result: 2
    })

    await expect(upsertPromise).resolves.toBe(2)
  })

  it('does not dispatch unsafe scan progress writes', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'result', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    await expect(client.upsertScanProgress(['', '  '], '2026-06-20T10:00:00.000Z')).resolves.toBe(0)
    await expect(client.upsertScanProgress(['/tmp/root-a'], 'invalid-date')).resolves.toBe(0)

    expect(worker.messages).toHaveLength(1)
  })

  it('sends a staged provider replacement transaction before committing it', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const begin = client.beginProviderReplacement('file-provider', 'replacement-1')
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    expect(worker.messages[1]).toMatchObject({
      type: 'beginProviderReplacement',
      providerId: 'file-provider',
      replacementId: 'replacement-1'
    })
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })
    await begin

    const stage = client.stageProviderReplacementItems('file-provider', 'replacement-1', [
      { itemId: 'file:/tmp/a.txt', providerId: 'file-provider', type: 'file', name: 'a.txt' }
    ])
    await vi.waitFor(() => expect(worker.messages).toHaveLength(3))
    expect(worker.messages[2]).toMatchObject({
      type: 'stageProviderReplacementItems',
      providerId: 'file-provider',
      replacementId: 'replacement-1',
      items: [expect.objectContaining({ itemId: 'file:/tmp/a.txt' })]
    })
    worker.emit('message', { type: 'result', taskId: taskIdOf(worker.messages[2]), result: 1 })
    await expect(stage).resolves.toBe(1)

    const commit = client.commitProviderReplacement('file-provider', 'replacement-1')
    await vi.waitFor(() => expect(worker.messages).toHaveLength(4))
    expect(worker.messages[3]).toMatchObject({
      type: 'commitProviderReplacement',
      providerId: 'file-provider',
      replacementId: 'replacement-1'
    })
    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[3]),
      result: { removedItems: 2, indexedItems: 1 }
    })
    await expect(commit).resolves.toEqual({ removedItems: 2, indexedItems: 1 })
  })

  it('sends replacement abort after a begun transaction cannot commit', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const begin = client.beginProviderReplacement('file-provider', 'replacement-rollback')
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[1]) })
    await begin

    const abort = client.abortProviderReplacement('file-provider', 'replacement-rollback')
    await vi.waitFor(() => expect(worker.messages).toHaveLength(3))
    expect(worker.messages[2]).toMatchObject({
      type: 'abortProviderReplacement',
      providerId: 'file-provider',
      replacementId: 'replacement-rollback'
    })
    worker.emit('message', { type: 'done', taskId: taskIdOf(worker.messages[2]) })
    await expect(abort).resolves.toBeUndefined()
  })

  it('posts provider-local persistence entries without a search payload', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'result', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const persistPromise = client.persistEntries([
      {
        fileId: 1,
        fileUpdate: null,
        progress: {
          status: 'completed',
          progress: 100,
          processedBytes: 1,
          totalBytes: 1,
          lastError: null,
          startedAt: null,
          updatedAt: null
        }
      }
    ])
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    const message = worker.messages[1] as { type: string; entries: Array<Record<string, unknown>> }
    expect(message.type).toBe('persistEntries')
    expect(message.entries[0]).toMatchObject({ fileId: 1, fileUpdate: null })
    expect(message.entries[0]).not.toHaveProperty('indexItem')

    worker.emit('message', {
      type: 'result',
      taskId: taskIdOf(worker.messages[1]),
      result: {
        entries: 1,
        chunks: 1,
        persistedRows: 1,
        fileUpdates: 0,
        progressRows: 1,
        embeddings: 0
      }
    })

    await expect(persistPromise).resolves.toEqual({
      entries: 1,
      chunks: 1,
      persistedRows: 1,
      fileUpdates: 0,
      progressRows: 1,
      embeddings: 0
    })
  })

  it('unwraps structured worker error messages', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const worker = workerMock.workers.at(-1)!

    worker.emit('message', { type: 'result', taskId: taskIdOf(worker.messages[0]) })
    await initPromise

    const removePromise = client.removeProviderItems('file-provider', ['file:/tmp/demo.txt'])
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2))

    worker.emit('message', {
      type: 'error',
      taskId: taskIdOf(worker.messages[1]),
      error: { message: 'structured failure' }
    })

    await expect(removePromise).rejects.toThrow('structured failure')
  })

  it('recovers a committed replacement after the worker fails before its response arrives', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    const commit = client.commitProviderReplacement('file-provider', 'replacement-recovered')
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))
    initialWorker.emit('error', new Error('worker failed after commit'))

    await vi.waitFor(() => expect(workerMock.workers).toHaveLength(2))
    const restartedWorker = workerMock.workers.at(-1)!
    expect(restartedWorker.messages).toHaveLength(1)
    expect(restartedWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    restartedWorker.emit('message', { type: 'done', taskId: taskIdOf(restartedWorker.messages[0]) })

    await vi.waitFor(() => expect(restartedWorker.messages).toHaveLength(2))
    expect(restartedWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      providerId: 'file-provider',
      replacementId: 'replacement-recovered'
    })
    restartedWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(restartedWorker.messages[1]),
      result: { removedItems: 2, indexedItems: 1 }
    })

    await expect(commit).resolves.toEqual({ removedItems: 2, indexedItems: 1 })
  })

  it('waits for deferred error retirement before recovering a durable commit outcome', async () => {
    const client = new SearchIndexWorkerClient()
    const init = client.init('/tmp/search-index.db')
    const failedWorker = workerMock.workers.at(-1)!
    failedWorker.emit('message', { type: 'done', taskId: taskIdOf(failedWorker.messages[0]) })
    await init

    const termination = deferred<number>()
    const terminate = vi.spyOn(failedWorker, 'terminate').mockReturnValue(termination.promise)
    const commit = client.commitProviderReplacement('file-provider', 'replacement-error-recovered')
    void commit.catch(() => undefined)
    await vi.waitFor(() => expect(failedWorker.messages).toHaveLength(2))

    failedWorker.emit('error', new Error('worker failed after commit'))
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledTimes(1))
    expect(workerMock.workers).toHaveLength(1)
    expect(failedWorker.messages).toHaveLength(2)

    termination.resolve(0)
    await vi.waitFor(() => expect(workerMock.workers).toHaveLength(2))
    const recoveryWorker = workerMock.workers.at(-1)!
    expect(recoveryWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    recoveryWorker.emit('message', { type: 'done', taskId: taskIdOf(recoveryWorker.messages[0]) })
    await vi.waitFor(() => expect(recoveryWorker.messages).toHaveLength(2))
    expect(recoveryWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      providerId: 'file-provider',
      replacementId: 'replacement-error-recovered'
    })
    recoveryWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(recoveryWorker.messages[1]),
      result: { removedItems: 2, indexedItems: 1 }
    })

    await expect(commit).resolves.toEqual({ removedItems: 2, indexedItems: 1 })
  })

  it('preserves the original commit failure when recovery finds no durable outcome', async () => {
    const client = new SearchIndexWorkerClient()
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    const commit = client.commitProviderReplacement('file-provider', 'replacement-missing')
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))
    initialWorker.emit('error', new Error('worker failed before outcome'))

    await vi.waitFor(() => expect(workerMock.workers).toHaveLength(2))
    const restartedWorker = workerMock.workers.at(-1)!
    restartedWorker.emit('message', { type: 'done', taskId: taskIdOf(restartedWorker.messages[0]) })
    await vi.waitFor(() => expect(restartedWorker.messages).toHaveLength(2))
    expect(restartedWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      providerId: 'file-provider',
      replacementId: 'replacement-missing'
    })
    restartedWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(restartedWorker.messages[1]),
      result: null
    })

    await expect(commit).rejects.toThrow('worker failed before outcome')
  })

  it('restarts and queries the durable outcome when a live worker never acknowledges commit', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient({
      commitResponseTimeoutMs: 1,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 2
    })
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    const commit = client.commitProviderReplacement(
      'file-provider',
      'replacement-timeout-recovered'
    )
    void commit.catch(() => undefined)
    const drain = client.drain()
    let drainSettled = false
    void drain.then(
      () => {
        drainSettled = true
      },
      () => {
        drainSettled = true
      }
    )
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))
    expect(initialWorker.messages[1]).toMatchObject({ type: 'commitProviderReplacement' })

    await vi.advanceTimersByTimeAsync(1)

    await Promise.resolve()
    expect(initialWorker.terminateCalls).toBe(1)
    expect(workerMock.workers).toHaveLength(2)
    const restartedWorker = workerMock.workers.at(-1)!
    expect(restartedWorker.messages).toHaveLength(1)
    expect(restartedWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    restartedWorker.emit('message', { type: 'done', taskId: taskIdOf(restartedWorker.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)
    expect(restartedWorker.messages).toHaveLength(2)
    expect(restartedWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      providerId: 'file-provider',
      replacementId: 'replacement-timeout-recovered'
    })
    expect(drainSettled).toBe(false)
    expect(client.hasPendingWork()).toBe(true)
    restartedWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(restartedWorker.messages[1]),
      result: { removedItems: 3, indexedItems: 2 }
    })

    await expect(commit).resolves.toEqual({ removedItems: 3, indexedItems: 2 })
    await expect(drain).resolves.toBeUndefined()
    expect(drainSettled).toBe(true)
    expect(client.getPendingCount()).toBe(0)
  })

  it('bounds silent outcome lookups and releases pending work before rethrowing commit timeout', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient({
      commitResponseTimeoutMs: 1,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 2
    })
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    const commit = client.commitProviderReplacement('file-provider', 'replacement-timeout-missing')
    void commit.catch(() => undefined)
    const drain = client.drain()
    void drain.catch(() => undefined)
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(1)

    await Promise.resolve()
    expect(workerMock.workers).toHaveLength(2)
    const firstRecoveryWorker = workerMock.workers.at(-1)!
    expect(firstRecoveryWorker.messages).toHaveLength(1)
    firstRecoveryWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(firstRecoveryWorker.messages[0])
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(firstRecoveryWorker.messages).toHaveLength(2)
    expect(firstRecoveryWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      replacementId: 'replacement-timeout-missing'
    })

    await vi.advanceTimersByTimeAsync(100)

    await Promise.resolve()
    expect(firstRecoveryWorker.terminateCalls).toBe(1)
    expect(workerMock.workers).toHaveLength(3)
    const secondRecoveryWorker = workerMock.workers.at(-1)!
    expect(secondRecoveryWorker.messages).toHaveLength(1)
    secondRecoveryWorker.emit('message', {
      type: 'done',
      taskId: taskIdOf(secondRecoveryWorker.messages[0])
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(secondRecoveryWorker.messages).toHaveLength(2)
    expect(secondRecoveryWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      replacementId: 'replacement-timeout-missing'
    })

    await vi.advanceTimersByTimeAsync(100)

    await expect(commit).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TASK_TIMEOUT:commitProviderReplacement'
    )
    await expect(drain).resolves.toBeUndefined()
    expect(client.getPendingCount()).toBe(0)
    expect(client.hasPendingWork()).toBe(false)
    expect(secondRecoveryWorker.terminateCalls).toBe(1)
  })

  it('waits for timed-out worker termination before spawning an outcome recovery worker', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient({
      commitResponseTimeoutMs: 1,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 1
    })
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    let resolveTermination: (exitCode: number) => void = () => undefined
    const termination = new Promise<number>((resolve) => {
      resolveTermination = resolve
    })
    const terminate = vi.spyOn(initialWorker, 'terminate').mockReturnValue(termination)
    const commit = client.commitProviderReplacement(
      'file-provider',
      'replacement-waits-for-termination'
    )
    void commit.catch(() => undefined)
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))

    await vi.advanceTimersByTimeAsync(1)

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(workerMock.workers).toHaveLength(1)
    expect(initialWorker.messages).toHaveLength(2)

    resolveTermination(0)

    await vi.advanceTimersByTimeAsync(0)
    expect(workerMock.workers).toHaveLength(2)
    const recoveryWorker = workerMock.workers.at(-1)!
    expect(recoveryWorker.messages).toHaveLength(1)
    expect(recoveryWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    recoveryWorker.emit('message', { type: 'done', taskId: taskIdOf(recoveryWorker.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)
    expect(recoveryWorker.messages).toHaveLength(2)
    expect(recoveryWorker.messages[1]).toMatchObject({
      type: 'getProviderReplacementOutcome',
      replacementId: 'replacement-waits-for-termination'
    })
    recoveryWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(recoveryWorker.messages[1]),
      result: null
    })

    await expect(commit).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TASK_TIMEOUT:commitProviderReplacement'
    )
  })

  it('joins concurrent ambiguous commits on one retirement and recovers the second durable outcome', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient({
      commitResponseTimeoutMs: 2,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 1
    })
    const init = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await init

    const termination = deferred<number>()
    const terminate = vi.spyOn(initialWorker, 'terminate').mockReturnValue(termination.promise)
    const commitA = client.commitProviderReplacement('file-provider', 'replacement-a')
    void commitA.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(initialWorker.messages).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    const commitB = client.commitProviderReplacement('file-provider', 'replacement-b')
    void commitB.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(initialWorker.messages).toHaveLength(3)
    const drain = client.drain()
    void drain.catch(() => undefined)

    await vi.advanceTimersByTimeAsync(1)

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(workerMock.workers).toHaveLength(1)
    expect(initialWorker.messages).toHaveLength(3)

    termination.resolve(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(workerMock.workers).toHaveLength(2)
    const recoveryWorker = workerMock.workers.at(-1)!
    expect(recoveryWorker.messages[0]).toMatchObject({
      type: 'init',
      dbPath: '/tmp/search-index.db'
    })
    recoveryWorker.emit('message', { type: 'done', taskId: taskIdOf(recoveryWorker.messages[0]) })
    await vi.advanceTimersByTimeAsync(0)
    expect(recoveryWorker.messages).toHaveLength(3)
    const outcomeMessages = recoveryWorker.messages.slice(1)
    expect(outcomeMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'getProviderReplacementOutcome',
          replacementId: 'replacement-a'
        }),
        expect.objectContaining({
          type: 'getProviderReplacementOutcome',
          replacementId: 'replacement-b'
        })
      ])
    )
    const outcomeA = outcomeMessages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { replacementId?: unknown }).replacementId === 'replacement-a'
    )
    const outcomeB = outcomeMessages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { replacementId?: unknown }).replacementId === 'replacement-b'
    )
    expect(outcomeA).toBeDefined()
    expect(outcomeB).toBeDefined()

    recoveryWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(outcomeA),
      result: null
    })
    recoveryWorker.emit('message', {
      type: 'result',
      taskId: taskIdOf(outcomeB),
      result: { removedItems: 4, indexedItems: 3 }
    })

    await expect(commitA).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TASK_TIMEOUT:commitProviderReplacement'
    )
    await expect(commitB).resolves.toEqual({ removedItems: 4, indexedItems: 3 })
    await expect(drain).resolves.toBeUndefined()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('fails closed when an ambiguous worker cannot terminate within its deadline', async () => {
    vi.useFakeTimers()
    const client = new SearchIndexWorkerClient({
      commitResponseTimeoutMs: 1,
      outcomeLookupTimeoutMs: 100,
      outcomeLookupAttempts: 1,
      terminationTimeoutMs: 1
    })
    const initPromise = client.init('/tmp/search-index.db')
    const initialWorker = workerMock.workers.at(-1)!
    initialWorker.emit('message', { type: 'done', taskId: taskIdOf(initialWorker.messages[0]) })
    await initPromise

    const unresolvedTermination = new Promise<number>(() => undefined)
    const terminate = vi.spyOn(initialWorker, 'terminate').mockReturnValue(unresolvedTermination)
    const commit = client.commitProviderReplacement(
      'file-provider',
      'replacement-termination-timeout'
    )
    void commit.catch(() => undefined)
    await vi.waitFor(() => expect(initialWorker.messages).toHaveLength(2))

    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(commit).rejects.toThrow('SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:timeout')
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(workerMock.workers).toHaveLength(1)
    expect(initialWorker.messages).toHaveLength(2)
    await expect(client.init('/tmp/search-index.db')).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:pending'
    )
    await expect(
      client.applyProviderItems(
        'file-provider',
        [
          {
            itemId: 'file:/tmp/fail-closed.txt',
            providerId: 'file-provider',
            type: 'file',
            name: 'fail'
          }
        ],
        []
      )
    ).rejects.toThrow('SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:pending')
    expect(workerMock.workers).toHaveLength(1)
    expect(initialWorker.messages).toHaveLength(2)
    expect(client.getPendingCount()).toBe(0)
  })

  it('fails closed after terminate rejects without spawning another worker', async () => {
    const client = new SearchIndexWorkerClient()
    const init = client.init('/tmp/search-index.db')
    const failedWorker = workerMock.workers.at(-1)!
    failedWorker.emit('message', { type: 'done', taskId: taskIdOf(failedWorker.messages[0]) })
    await init

    const terminate = vi
      .spyOn(failedWorker, 'terminate')
      .mockRejectedValue(new Error('worker termination rejected'))
    const commit = client.commitProviderReplacement(
      'file-provider',
      'replacement-terminate-rejected'
    )
    void commit.catch(() => undefined)
    await vi.waitFor(() => expect(failedWorker.messages).toHaveLength(2))

    failedWorker.emit('error', new Error('worker failed before outcome'))

    await expect(commit).rejects.toThrow('SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:rejected')
    await expect(client.drain()).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:rejected'
    )
    await expect(client.init('/tmp/search-index.db')).rejects.toThrow(
      'SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:rejected'
    )
    await expect(
      client.applyProviderItems(
        'file-provider',
        [
          {
            itemId: 'file:/tmp/fail-closed.txt',
            providerId: 'file-provider',
            type: 'file',
            name: 'fail'
          }
        ],
        []
      )
    ).rejects.toThrow('SEARCH_INDEX_WORKER_TERMINATION_UNCONFIRMED:rejected')
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(workerMock.workers).toHaveLength(1)
  })
})
