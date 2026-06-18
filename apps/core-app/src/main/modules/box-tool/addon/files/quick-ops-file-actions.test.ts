import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  writeText: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    writeText: electronMocks.writeText
  }
}))

import {
  executeQuickOpsFileAction,
  QUICK_OPS_FILE_BASE64_ACTION_ID,
  QUICK_OPS_FILE_HASH_ACTION_ID
} from './quick-ops-file-actions'

describe('quick-ops file actions', () => {
  let tempDirs: string[] = []

  beforeEach(() => {
    electronMocks.writeText.mockReset()
  })

  afterEach(async () => {
    const dirs = tempDirs
    tempDirs = []
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createTempFile(name: string, content: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-file-actions-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, name)
    await writeFile(filePath, content)
    return filePath
  }

  it('copies file hashes for file search execute actions', async () => {
    const filePath = await createTempFile('hello.txt', 'hello')

    const handled = await executeQuickOpsFileAction(QUICK_OPS_FILE_HASH_ACTION_ID, filePath)

    expect(handled).toBe(true)
    const text = electronMocks.writeText.mock.calls[0]?.[0]
    expect(text).toContain('File: hello.txt')
    expect(text).toContain(`Path: ${filePath}`)
    expect(text).toContain('MD5: 5d41402abc4b2a76b9719d911017c592')
    expect(text).toContain('SHA1: aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    expect(text).toContain(
      'SHA256: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })

  it('copies bounded Base64 for file search execute actions', async () => {
    const filePath = await createTempFile('hello.txt', 'hello')

    const handled = await executeQuickOpsFileAction(QUICK_OPS_FILE_BASE64_ACTION_ID, filePath)

    expect(handled).toBe(true)
    expect(electronMocks.writeText).toHaveBeenCalledWith(
      [`File: hello.txt`, `Path: ${filePath}`, 'Size: 5 bytes', 'Base64:', 'aGVsbG8='].join('\n')
    )
  })

  it('degrades oversized Base64 actions without writing clipboard content', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-file-actions-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, 'large.bin')
    await writeFile(filePath, '')
    await truncate(filePath, 1024 * 1024 + 1)
    const logger = { warn: vi.fn() }

    const handled = await executeQuickOpsFileAction(
      QUICK_OPS_FILE_BASE64_ACTION_ID,
      filePath,
      logger
    )

    expect(handled).toBe(true)
    expect(electronMocks.writeText).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('QuickOps file Base64 action degraded', {
      path: filePath,
      reason: 'file-too-large'
    })
  })

  it('ignores unrelated execute actions', async () => {
    const filePath = await createTempFile('hello.txt', 'hello')

    await expect(executeQuickOpsFileAction('open-file', filePath)).resolves.toBe(false)
    expect(electronMocks.writeText).not.toHaveBeenCalled()
  })
})
