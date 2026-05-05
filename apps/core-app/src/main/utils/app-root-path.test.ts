import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_FOLDER_NAME } from '../config/default'
import { DEV_APP_FOLDER_NAME, resolveRuntimeRootPath, type AppPathLike } from './app-root-path'

function createAppLike(options: { isPackaged?: boolean; userDataPath: string }): AppPathLike {
  return {
    isPackaged: options.isPackaged === true,
    getPath(name: 'userData') {
      if (name !== 'userData') {
        throw new Error(`Unsupported path: ${name}`)
      }
      return options.userDataPath
    }
  }
}

describe('app-root-path', () => {
  it('resolves packaged root path to userData/tuff', () => {
    const appLike = createAppLike({
      isPackaged: true,
      userDataPath: path.join(os.tmpdir(), 'tuff-user-data')
    })

    const resolved = resolveRuntimeRootPath(appLike)
    expect(resolved).toBe(path.join(os.tmpdir(), 'tuff-user-data', APP_FOLDER_NAME))
  })

  it('resolves dev root path to userData/tuff-dev', () => {
    const appLike = createAppLike({
      isPackaged: false,
      userDataPath: path.join(os.tmpdir(), 'tuff-user-data')
    })

    const resolved = resolveRuntimeRootPath(appLike)
    expect(resolved).toBe(path.join(os.tmpdir(), 'tuff-user-data', DEV_APP_FOLDER_NAME))
  })
})
