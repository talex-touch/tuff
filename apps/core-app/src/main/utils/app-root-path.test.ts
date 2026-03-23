import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fse from 'fs-extra'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_FOLDER_NAME } from '../config/default'
import {
  DEV_APP_FOLDER_NAME,
  DEV_DATA_MIGRATION_MARKER,
  migrateLegacyDevDataIfNeeded,
  resolveRuntimeRootPath,
  type AppPathLike
} from './app-root-path'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-root-path-'))
  tempRoots.push(root)
  return root
}

function createAppLike(options: {
  isPackaged?: boolean
  userDataPath: string
  appPath: string
}): AppPathLike {
  return {
    isPackaged: options.isPackaged === true,
    getPath(name: 'userData') {
      if (name !== 'userData') {
        throw new Error(`Unsupported path: ${name}`)
      }
      return options.userDataPath
    },
    getAppPath() {
      return options.appPath
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (!root) continue
    fse.removeSync(root)
  }
})

describe('app-root-path', () => {
  it('resolves packaged root path to userData/tuff', () => {
    const root = createTempRoot()
    const appLike = createAppLike({
      isPackaged: true,
      userDataPath: path.join(root, 'user-data'),
      appPath: path.join(root, 'app-root')
    })

    const resolved = resolveRuntimeRootPath(appLike)
    expect(resolved).toBe(path.join(root, 'user-data', APP_FOLDER_NAME))
  })

  it('resolves dev root path to userData/tuff-dev', () => {
    const root = createTempRoot()
    const appLike = createAppLike({
      isPackaged: false,
      userDataPath: path.join(root, 'user-data'),
      appPath: path.join(root, 'app-root')
    })

    const resolved = resolveRuntimeRootPath(appLike)
    expect(resolved).toBe(path.join(root, 'user-data', DEV_APP_FOLDER_NAME))
  })

  it('migrates legacy dev data on first startup when target is empty', () => {
    const root = createTempRoot()
    const userDataPath = path.join(root, 'user-data')
    const appPath = path.join(root, 'app-root')
    const sourceRoot = path.join(appPath, APP_FOLDER_NAME)
    fse.ensureDirSync(path.join(sourceRoot, 'config'))
    fse.writeJSONSync(path.join(sourceRoot, 'config', 'settings.json'), { key: 'value' })

    const appLike = createAppLike({
      isPackaged: false,
      userDataPath,
      appPath
    })

    const result = migrateLegacyDevDataIfNeeded(appLike)
    const targetRoot = path.join(userDataPath, DEV_APP_FOLDER_NAME)
    const markerPath = path.join(targetRoot, DEV_DATA_MIGRATION_MARKER)

    expect(result.status).toBe('migrated')
    expect(fse.pathExistsSync(path.join(targetRoot, 'config', 'settings.json'))).toBe(true)
    expect(fse.pathExistsSync(markerPath)).toBe(true)
    expect(fse.readJSONSync(markerPath).status).toBe('migrated')
  })

  it('skips migration when target already has data and writes marker', () => {
    const root = createTempRoot()
    const userDataPath = path.join(root, 'user-data')
    const appPath = path.join(root, 'app-root')
    const sourceRoot = path.join(appPath, APP_FOLDER_NAME)
    const targetRoot = path.join(userDataPath, DEV_APP_FOLDER_NAME)
    fse.ensureDirSync(sourceRoot)
    fse.writeFileSync(path.join(sourceRoot, 'legacy.txt'), 'legacy')
    fse.ensureDirSync(targetRoot)
    fse.writeFileSync(path.join(targetRoot, 'already.txt'), 'keep')

    const appLike = createAppLike({
      isPackaged: false,
      userDataPath,
      appPath
    })

    const result = migrateLegacyDevDataIfNeeded(appLike)
    const markerPath = path.join(targetRoot, DEV_DATA_MIGRATION_MARKER)

    expect(result.status).toBe('skipped-target-not-empty')
    expect(fse.pathExistsSync(path.join(targetRoot, 'already.txt'))).toBe(true)
    expect(fse.pathExistsSync(markerPath)).toBe(true)
    expect(fse.readJSONSync(markerPath).status).toBe('skipped-target-not-empty')
  })

  it('skips migration when marker already exists', () => {
    const root = createTempRoot()
    const userDataPath = path.join(root, 'user-data')
    const appPath = path.join(root, 'app-root')
    const sourceRoot = path.join(appPath, APP_FOLDER_NAME)
    const targetRoot = path.join(userDataPath, DEV_APP_FOLDER_NAME)
    const markerPath = path.join(targetRoot, DEV_DATA_MIGRATION_MARKER)

    fse.ensureDirSync(sourceRoot)
    fse.writeFileSync(path.join(sourceRoot, 'legacy.txt'), 'legacy')
    fse.ensureDirSync(targetRoot)
    fse.writeJSONSync(markerPath, {
      version: 1,
      status: 'migrated',
      reason: 'already-done',
      sourcePath: sourceRoot,
      targetPath: targetRoot,
      createdAt: new Date().toISOString()
    })

    const appLike = createAppLike({
      isPackaged: false,
      userDataPath,
      appPath
    })

    const result = migrateLegacyDevDataIfNeeded(appLike)

    expect(result.status).toBe('skipped-marker-exists')
    expect(fse.pathExistsSync(path.join(targetRoot, 'legacy.txt'))).toBe(false)
  })

  it('returns failed and writes marker when copy throws', () => {
    const root = createTempRoot()
    const userDataPath = path.join(root, 'user-data')
    const appPath = path.join(root, 'app-root')
    const sourceRoot = path.join(appPath, APP_FOLDER_NAME)
    const targetRoot = path.join(userDataPath, DEV_APP_FOLDER_NAME)
    fse.ensureDirSync(sourceRoot)
    fse.writeFileSync(path.join(sourceRoot, 'legacy.txt'), 'legacy')

    vi.spyOn(fse, 'copySync').mockImplementation(() => {
      throw new Error('copy-failed-for-test')
    })

    const appLike = createAppLike({
      isPackaged: false,
      userDataPath,
      appPath
    })

    const result = migrateLegacyDevDataIfNeeded(appLike)
    const markerPath = path.join(targetRoot, DEV_DATA_MIGRATION_MARKER)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('copy-failed-for-test')
    expect(fse.pathExistsSync(markerPath)).toBe(true)
    expect(fse.readJSONSync(markerPath).status).toBe('failed')
  })
})
