import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fse from 'fs-extra'
import { sleep } from '@talex-touch/utils/common/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkDirWithCreate } from './common-util'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-common-util-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (!root) continue
    fse.removeSync(root)
  }
})

describe('checkDirWithCreate', () => {
  it('creates nested directory recursively when parent is missing', () => {
    const root = createTempRoot()
    const nested = path.join(root, 'a', 'b', 'c')

    expect(() => checkDirWithCreate(nested, true)).not.toThrow()
    expect(fse.pathExistsSync(nested)).toBe(true)
  })

  it('is idempotent when directory already exists', () => {
    const root = createTempRoot()
    const existing = path.join(root, 'existing')
    fse.ensureDirSync(existing)

    expect(checkDirWithCreate(existing, true)).toBe(true)
    expect(checkDirWithCreate(existing, true)).toBe(true)
    expect(fse.pathExistsSync(existing)).toBe(true)
  })
})

describe('sleep', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('settles only after the requested delay and returns that delay', async () => {
    vi.useFakeTimers()

    let settled = false
    const delayed = sleep(75).then((value) => {
      settled = true
      return value
    })

    await vi.advanceTimersByTimeAsync(74)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(delayed).resolves.toBe(75)
  })
})
