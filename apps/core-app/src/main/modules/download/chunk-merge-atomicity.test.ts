/**
 * mergeChunks opened the final output path with 'w' and wrote each chunk into it, so a failure
 * partway through left a truncated file under the real filename - and unlike the single-stream
 * path, nothing removed it (#781).
 *
 * These run against a real temp directory: the property under test is what is on disk after a
 * failed merge, which a mocked fs cannot show.
 */
import { ChunkStatus } from '@talex-touch/utils'
import type { ChunkInfo, DownloadTask } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { ChunkManager } from './chunk-manager'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => await fs.rm(dir, { recursive: true, force: true }))
  )
})

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chunk-merge-'))
  tempDirs.push(dir)
  return dir
}

function task(destination: string): DownloadTask {
  return { id: 'task-1', destination, filename: 'payload.bin' } as unknown as DownloadTask
}

async function chunk(dir: string, index: number, body: string, status: ChunkStatus) {
  const filePath = path.join(dir, `chunk-${index}`)
  await fs.writeFile(filePath, body)
  return { index, filePath, status, size: body.length } as unknown as ChunkInfo
}

describe('chunk merge does not damage the destination', () => {
  it('合并成功后目标文件是完整拼接结果', async () => {
    const dir = await createWorkspace()
    const manager = new ChunkManager(undefined, dir)
    const chunks = [
      await chunk(dir, 0, 'hello-', ChunkStatus.COMPLETED),
      await chunk(dir, 1, 'world', ChunkStatus.COMPLETED)
    ]

    await manager.mergeChunks(task(dir), chunks)

    expect(await fs.readFile(path.join(dir, 'payload.bin'), 'utf8')).toBe('hello-world')
  })

  it('某个切片未完成时,已存在的目标文件保持不变', async () => {
    const dir = await createWorkspace()
    const destination = path.join(dir, 'payload.bin')
    await fs.writeFile(destination, 'previous-good-download')
    const manager = new ChunkManager(undefined, dir)
    const chunks = [
      await chunk(dir, 0, 'partial-', ChunkStatus.COMPLETED),
      await chunk(dir, 1, 'never-written', ChunkStatus.PENDING)
    ]

    await expect(manager.mergeChunks(task(dir), chunks)).rejects.toThrow(/not completed/i)

    // Before the fix this read 'partial-' - the destination had been truncated and half-written.
    expect(await fs.readFile(destination, 'utf8')).toBe('previous-good-download')
  })

  it('失败后不留下 .part 残留文件', async () => {
    const dir = await createWorkspace()
    const manager = new ChunkManager(undefined, dir)
    const chunks = [
      await chunk(dir, 0, 'partial-', ChunkStatus.COMPLETED),
      await chunk(dir, 1, 'never-written', ChunkStatus.PENDING)
    ]

    await expect(manager.mergeChunks(task(dir), chunks)).rejects.toThrow()

    const leftovers = (await fs.readdir(dir)).filter((name) => name.endsWith('.part'))
    expect(leftovers).toEqual([])
  })

  it('目标文件此前不存在且合并失败时,不会凭空造出一个截断文件', async () => {
    const dir = await createWorkspace()
    const manager = new ChunkManager(undefined, dir)
    const chunks = [
      await chunk(dir, 0, 'partial-', ChunkStatus.COMPLETED),
      await chunk(dir, 1, 'never-written', ChunkStatus.PENDING)
    ]

    await expect(manager.mergeChunks(task(dir), chunks)).rejects.toThrow()

    expect(existsSync(path.join(dir, 'payload.bin'))).toBe(false)
  })
})
