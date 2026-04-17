import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fse from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
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
