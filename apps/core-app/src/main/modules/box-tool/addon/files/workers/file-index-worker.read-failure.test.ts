import type { FileParser } from '@talex-touch/utils/electron/file-parsers'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fileParserRegistry, textFileParser } from '@talex-touch/utils/electron/file-parsers'

type WorkerMessage = Record<string, unknown>

const parentPort = vi.hoisted(() => {
  const listeners: Array<(payload: unknown) => void> = []
  const posted: Array<Record<string, unknown>> = []
  return {
    posted,
    on(event: string, listener: (payload: unknown) => void) {
      if (event === 'message') listeners.push(listener)
      return this
    },
    postMessage(message: Record<string, unknown>) {
      posted.push(message)
    },
    deliver(payload: unknown) {
      for (const listener of listeners) listener(payload)
    }
  }
})

vi.mock('node:worker_threads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:worker_threads')>()),
  parentPort
}))

// Registers the worker's message handler on the fake parent port.
import './file-index-worker'

/**
 * EPERM (a TCC-protected path) cannot be produced on demand, so a higher-priority parser reports
 * it for one sentinel path; every other `.txt` falls through to the real text parser.
 */
const tccParser: FileParser = {
  id: 'test-tcc-protected-parser',
  priority: 1_000,
  supportedExtensions: ['.txt'],
  canParse: (context) => context.filePath.endsWith('tcc-protected.txt'),
  parse: async (context) => ({
    status: 'failed',
    reason: `EPERM: operation not permitted, open '${context.filePath}'`,
    errorCode: 'EPERM'
  })
}

let directory = ''
let taskSequence = 0

async function runIndexTask(files: Array<{ id: number; path: string; name: string }>): Promise<{
  done: WorkerMessage
  finalResults: Map<number, WorkerMessage>
}> {
  taskSequence += 1
  const taskId = `read-failure-${taskSequence}`
  parentPort.deliver({
    type: 'index',
    taskId,
    dbPath: '/tmp/unused-index.db',
    providerId: 'file-provider',
    providerType: 'file',
    files: files.map((file) => ({
      extension: '.txt',
      size: 10,
      mtime: 1_000,
      ctime: 1_000,
      ...file
    }))
  })
  await vi.waitFor(() => {
    expect(
      parentPort.posted.some((message) => message.type === 'done' && message.taskId === taskId)
    ).toBe(true)
  })
  const messages = parentPort.posted.filter((message) => message.taskId === taskId)
  // A file first reports `processing`; its last message is the terminal result.
  const finalResults = new Map<number, WorkerMessage>()
  for (const message of messages) {
    if (message.type === 'file') finalResults.set(Number(message.fileId), message)
  }
  return { done: messages.find((message) => message.type === 'done')!, finalResults }
}

describe('file-index worker read-failure classification', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'file-index-worker-read-'))
    await writeFile(join(directory, 'readable.txt'), 'hello')
    await writeFile(join(directory, 'blocker.txt'), 'a file, not a directory')
    await writeFile(join(directory, 'locked.txt'), 'secret')
    await chmod(join(directory, 'locked.txt'), 0o000)
    for (let index = 1; index <= 4; index += 1) {
      await mkdir(join(directory, `folder-${index}.txt`))
    }
    fileParserRegistry.register(tccParser)
  })

  afterAll(async () => {
    fileParserRegistry.unregister(tccParser.id)
    await chmod(join(directory, 'locked.txt'), 0o600).catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  })

  it('reports the errno code of a failed read', async () => {
    await expect(
      textFileParser.parse({ filePath: join(directory, 'missing.txt'), extension: '.txt', size: 0 })
    ).resolves.toMatchObject({ status: 'failed', errorCode: 'ENOENT' })
  })

  it('records a missing or permission-denied file as a terminal skip, not a failure', async () => {
    const { done, finalResults } = await runIndexTask([
      { id: 1, path: join(directory, 'readable.txt'), name: 'readable.txt' },
      { id: 2, path: join(directory, 'missing.txt'), name: 'missing.txt' },
      { id: 3, path: join(directory, 'blocker.txt', 'child.txt'), name: 'child.txt' },
      { id: 4, path: join(directory, 'tcc-protected.txt'), name: 'tcc-protected.txt' }
    ])

    expect(finalResults.get(1)).toMatchObject({ progress: { status: 'completed' } })
    // ENOENT and ENOTDIR: nothing is at the indexed path any more.
    expect(finalResults.get(2)).toMatchObject({
      progress: { status: 'skipped', lastError: 'file-missing' }
    })
    expect(finalResults.get(3)).toMatchObject({
      progress: { status: 'skipped', lastError: 'file-missing' }
    })
    expect(finalResults.get(4)).toMatchObject({
      progress: { status: 'skipped', lastError: 'permission-denied' }
    })
    expect(done).toMatchObject({ processed: 4, failed: 0 })
    expect(done).not.toHaveProperty('failureSamples')
  })

  it.skipIf(process.getuid?.() === 0)('records an EACCES read as permission-denied', async () => {
    const { done, finalResults } = await runIndexTask([
      { id: 5, path: join(directory, 'locked.txt'), name: 'locked.txt' }
    ])

    expect(finalResults.get(5)).toMatchObject({
      progress: { status: 'skipped', lastError: 'permission-denied' }
    })
    expect(done).toMatchObject({ processed: 1, failed: 0 })
  })

  it('counts any other read failure and carries at most three lastError samples', async () => {
    const { done, finalResults } = await runIndexTask(
      [1, 2, 3, 4].map((index) => ({
        id: 10 + index,
        path: join(directory, `folder-${index}.txt`),
        name: `folder-${index}.txt`
      }))
    )

    expect(finalResults.get(11)).toMatchObject({
      progress: { status: 'failed', lastError: expect.stringMatching(/^EISDIR/) }
    })
    expect(done).toMatchObject({ processed: 4, failed: 4 })
    const samples = done.failureSamples as string[]
    expect(samples).toHaveLength(3)
    for (const sample of samples) expect(sample).toMatch(/^EISDIR/)
  })
})
