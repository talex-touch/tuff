import type * as WorkerThreads from 'node:worker_threads'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FILE_CONTENT_MAX_CHARS, FILE_CONTENT_TOO_LONG_REASON } from '../constants'

/** The part of a worker `file` message these tests read. */
interface PostedFileResult {
  progress: { status: string; lastError: string | null }
  fileUpdate: {
    content: string | null
    embeddingStatus: string
    chunks?: unknown
    embeddings?: unknown
  } | null
  indexItem: { name: string; content?: string }
}

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
  ...(await importOriginal<typeof WorkerThreads>()),
  parentPort
}))

// Registers the worker's message handler on the fake parent port.
import './file-index-worker'

let directory = ''
let taskSequence = 0

async function indexTextFile(
  name: string,
  text: string
): Promise<{ result: PostedFileResult; done: Record<string, unknown> }> {
  const filePath = join(directory, name)
  await writeFile(filePath, text)
  taskSequence += 1
  const taskId = `content-cap-${taskSequence}`
  parentPort.deliver({
    type: 'index',
    taskId,
    dbPath: '/tmp/unused-index.db',
    providerId: 'file-provider',
    providerType: 'file',
    files: [
      {
        id: 1,
        path: filePath,
        name,
        extension: '.txt',
        size: Buffer.byteLength(text),
        mtime: 1_000,
        ctime: 1_000
      }
    ]
  })
  await vi.waitFor(() => {
    expect(
      parentPort.posted.some((message) => message.type === 'done' && message.taskId === taskId)
    ).toBe(true)
  })
  const messages = parentPort.posted.filter((message) => message.taskId === taskId)
  const files = messages.filter((message) => message.type === 'file')
  // The worker is in this process and posts exactly this shape; a file's last message is terminal.
  const result = files[files.length - 1] as unknown as PostedFileResult
  return { result, done: messages.find((message) => message.type === 'done')! }
}

describe('file-index worker content length cap', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'file-index-worker-cap-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('indexes a body of exactly the cap in full', async () => {
    const text = 'a'.repeat(FILE_CONTENT_MAX_CHARS)
    const { result } = await indexTextFile('at-cap.txt', text)

    expect(result.progress).toMatchObject({ status: 'completed', lastError: null })
    expect(result.fileUpdate?.content).toBe(text)
    expect(result.indexItem.content).toBe(text)
  })

  it('indexes nothing of a body one character over the cap, not even a prefix', async () => {
    const { result } = await indexTextFile('over-cap.txt', 'a'.repeat(FILE_CONTENT_MAX_CHARS + 1))

    expect(result.progress).toMatchObject({
      status: 'skipped',
      lastError: FILE_CONTENT_TOO_LONG_REASON
    })
    expect(result.fileUpdate).toMatchObject({ content: null, embeddingStatus: 'none' })
    expect(result.fileUpdate?.chunks).toBeUndefined()
    expect(result.fileUpdate?.embeddings).toBeUndefined()
    // The file stays searchable by name and path, with an empty FTS body.
    expect(result.indexItem.content).toBeUndefined()
    expect(result.indexItem.name).toBe('over-cap.txt')
  })

  it('does not count a skipped over-long file as a failure', async () => {
    const { done } = await indexTextFile(
      'over-cap-again.txt',
      'b'.repeat(FILE_CONTENT_MAX_CHARS * 3)
    )

    expect(done).toMatchObject({ processed: 1, failed: 0 })
    expect(done).not.toHaveProperty('failureSamples')
  })
})
