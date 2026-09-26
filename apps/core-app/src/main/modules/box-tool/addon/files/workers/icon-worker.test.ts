import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The worker script is the component that loads `extract-file-icon` and writes pixels to disk, so
 * the boundaries it enforces are the ones that keep the macOS crash (#310) and unbounded writes out
 * of the icon path. The fixture is deliberately a bare 2x2 PNG: byte-level PNG handling is covered
 * in file-icon-artifact.test.ts.
 */
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGNgYPj/n5H5/38Gdsb//zlY/v8HAEBuCBGhphy2AAAAAElFTkSuQmCC',
  'base64'
)

interface PostedResult {
  type: string
  taskId?: string
  path?: string | null
  error?: string
}

const harness = vi.hoisted(() => {
  type Handler = (payload: unknown) => void
  const posted: unknown[] = []
  const handlers: Handler[] = []
  const state = { onPosted: null as null | ((message: unknown) => void) }

  return {
    posted,
    handlers,
    state,
    extractFileIcon: vi.fn(),
    parentPort: {
      on: (event: string, handler: Handler) => {
        if (event === 'message') handlers.push(handler)
      },
      postMessage: (message: unknown) => {
        posted.push(message)
        state.onPosted?.(message)
      }
    }
  }
})

vi.mock('node:worker_threads', () => ({ parentPort: harness.parentPort }))
vi.mock('extract-file-icon', () => ({ default: harness.extractFileIcon }))

import { FILE_ICON_MAX_BYTES } from '../../../../../service/file-icon-artifact'
import './icon-worker'

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}

let tempRoot = ''
let iconDirectory = ''

beforeAll(() => {
  setPlatform('win32')
})

afterAll(() => {
  setPlatform(originalPlatform)
})

beforeEach(async () => {
  setPlatform('win32')
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'icon-worker-'))
  iconDirectory = path.join(tempRoot, 'file-icons')
  await fs.mkdir(iconDirectory, { recursive: true })
  harness.posted.length = 0
  harness.state.onPosted = null
  harness.extractFileIcon.mockReset()
  harness.extractFileIcon.mockReturnValue(PNG_2X2)
})

afterEach(async () => {
  harness.state.onPosted = null
  await fs.rm(tempRoot, { recursive: true, force: true })
})

function dispatchExtract(request: { filePath: string; outputPath: string; size?: number }): void {
  for (const handler of harness.handlers) {
    handler({ type: 'extract', taskId: 'task-1', ...request })
  }
}

async function waitForPostedResults(count: number): Promise<void> {
  await vi.waitFor(
    () => {
      if (harness.posted.length < count) {
        throw new Error(`the worker posted ${harness.posted.length} of ${count} results`)
      }
    },
    { timeout: 5_000 }
  )
}

async function requestIcon(request: {
  filePath: string
  outputPath: string
  size?: number
}): Promise<PostedResult> {
  dispatchExtract(request)
  await waitForPostedResults(1)
  return harness.posted[0] as PostedResult
}

describe('icon worker extract to file', () => {
  it('writes the extractor output to the requested path and reports it', async () => {
    const outputPath = path.join(iconDirectory, 'report.png')

    const result = await requestIcon({ filePath: '/docs/report.pdf', outputPath, size: 48 })

    expect(harness.extractFileIcon).toHaveBeenCalledWith('/docs/report.pdf', 48)
    expect(result).toMatchObject({ type: 'done', taskId: 'task-1', path: outputPath })
    expect(await fs.readFile(outputPath)).toEqual(PNG_2X2)
    // The staged write is renamed into place, so nothing else is left in the owned directory.
    expect(await fs.readdir(iconDirectory)).toEqual(['report.png'])
  })

  it.each([
    { name: 'a relative path', outputPath: 'file-icons/report.png' },
    { name: 'an empty path', outputPath: '' }
  ])('refuses $name as an output path without extracting', async ({ outputPath }) => {
    const result = await requestIcon({ filePath: '/docs/report.pdf', outputPath })

    expect(result).toMatchObject({ type: 'done', path: null })
    expect(harness.extractFileIcon).not.toHaveBeenCalled()
    expect(await fs.readdir(iconDirectory)).toEqual([])
  })

  it('refuses extractor output over the byte budget without writing it', async () => {
    harness.extractFileIcon.mockReturnValueOnce(Buffer.alloc(FILE_ICON_MAX_BYTES + 1, 0x41))

    const result = await requestIcon({
      filePath: '/docs/huge.pdf',
      outputPath: path.join(iconDirectory, 'huge.png')
    })

    expect(result).toMatchObject({ type: 'done', path: null })
    expect(await fs.readdir(iconDirectory)).toEqual([])
  })

  it('refuses extractor output that is not a bounded PNG without writing it', async () => {
    harness.extractFileIcon.mockReturnValueOnce(Buffer.from('this is not a png at all'))

    const result = await requestIcon({
      filePath: '/docs/text.pdf',
      outputPath: path.join(iconDirectory, 'text.png')
    })

    expect(result).toMatchObject({ type: 'done', path: null })
    expect(await fs.readdir(iconDirectory)).toEqual([])
  })

  it('runs one extraction at a time, finishing each before starting the next', async () => {
    const completionOrder: string[] = []
    harness.extractFileIcon.mockImplementation((filePath: string) => {
      completionOrder.push(`extract:${path.basename(filePath)}`)
      return PNG_2X2
    })
    harness.state.onPosted = () => completionOrder.push('written')

    dispatchExtract({ filePath: '/docs/first.pdf', outputPath: path.join(iconDirectory, 'a.png') })
    dispatchExtract({ filePath: '/docs/second.pdf', outputPath: path.join(iconDirectory, 'b.png') })
    await waitForPostedResults(2)

    expect(completionOrder).toEqual([
      'extract:first.pdf',
      'written',
      'extract:second.pdf',
      'written'
    ])
  })
})

describe('icon worker platform boundary', () => {
  it('refuses to extract on darwin instead of loading the unsafe extractor', async () => {
    setPlatform('darwin')

    const outputPath = path.join(iconDirectory, 'report.png')
    const result = await requestIcon({ filePath: '/docs/report.pdf', outputPath, size: 64 })

    expect(result).toMatchObject({ type: 'done', taskId: 'task-1', path: null })
    expect(harness.extractFileIcon).not.toHaveBeenCalled()
    expect(await fs.readdir(iconDirectory)).toEqual([])
  })
})
