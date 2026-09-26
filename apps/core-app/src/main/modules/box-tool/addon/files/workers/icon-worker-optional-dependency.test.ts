import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `extract-file-icon` is an optional native dependency (#602): on a host without a build toolchain
 * it is simply not installed. The worker has to answer "no icon" for that case rather than refusing
 * the task or reporting an error — that is what makes the dependency safe to keep optional.
 */
const harness = vi.hoisted(() => {
  type Handler = (payload: unknown) => void
  const posted: unknown[] = []
  const handlers: Handler[] = []

  return {
    posted,
    handlers,
    parentPort: {
      on: (event: string, handler: Handler) => {
        if (event === 'message') handlers.push(handler)
      },
      postMessage: (message: unknown) => {
        posted.push(message)
      }
    }
  }
})

vi.mock('node:worker_threads', () => ({ parentPort: harness.parentPort }))
vi.mock('extract-file-icon', () => {
  throw new Error("Cannot find module 'extract-file-icon'")
})

import './icon-worker'

const originalPlatform = process.platform

let tempRoot = ''
let iconDirectory = ''

beforeAll(() => {
  // The darwin branch returns before the extractor is ever loaded, which would let this file pass
  // without exercising the missing-module path at all.
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
})

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'icon-worker-optional-'))
  iconDirectory = path.join(tempRoot, 'file-icons')
  await fs.mkdir(iconDirectory, { recursive: true })
  harness.posted.length = 0
})

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('icon worker without the optional native extractor', () => {
  it('reports no icon instead of failing when the module cannot be loaded', async () => {
    const outputPath = path.join(iconDirectory, 'report.png')
    for (const handler of harness.handlers) {
      handler({ type: 'extract', taskId: 'task-1', filePath: '/docs/report.pdf', outputPath })
    }

    await vi.waitFor(
      () => {
        if (harness.posted.length === 0) throw new Error('the worker did not answer')
      },
      { timeout: 5_000 }
    )

    expect(harness.posted[0]).toMatchObject({ type: 'done', taskId: 'task-1', path: null })
    expect(await fs.readdir(iconDirectory)).toEqual([])
  })
})
