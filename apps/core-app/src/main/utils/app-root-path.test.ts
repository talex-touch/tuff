import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { APP_FOLDER_NAME } from '../config/default'
import {
  DEV_APP_FOLDER_NAME,
  resetRuntimeRootPathForTests,
  resolveRuntimeRootPath,
  type AppPathLike
} from './app-root-path'
import { evaluateDownloadTarget } from './download-target-policy'

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

/** Like `createAppLike`, but its `userData` can be rewritten mid-test the way startup does. */
function createMutableAppLike(userDataPath: string): AppPathLike & { userDataPath: string } {
  return {
    isPackaged: false,
    userDataPath,
    getPath(name: 'userData') {
      if (name !== 'userData') {
        throw new Error(`Unsupported path: ${name}`)
      }
      return this.userDataPath
    }
  }
}

afterEach(() => {
  resetRuntimeRootPathForTests()
})

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

/**
 * `userData` is rewritten twice during startup: `precore` overrides it for startup benchmarking and
 * resolves the root immediately after, then `polyfills` repoints Chromium's profile at a separate
 * dev directory. Resolving afresh on every call meant the answer depended on when you asked —
 * `precore` captured one root at module load, `getAllowedDownloadRoots` derived another at download
 * time, and every update package was rejected as `destination-outside-roots`.
 */
describe('app-root-path is stable across a userData rewrite', () => {
  it('keeps the first answer after userData changes underneath it', () => {
    const appLike = createMutableAppLike('/base/@scope/core-app')

    const first = resolveRuntimeRootPath(appLike)
    appLike.userDataPath = '/base/@scope/tuff-dev' // what polyfills does in dev

    expect(resolveRuntimeRootPath(appLike)).toBe(first)
  })

  it('honours a deliberate override taken before the first resolution', () => {
    // The startup-benchmark override runs before the root is first read, so a benchmark run must
    // still get its isolated root. Memoizing must not swallow that.
    const appLike = createMutableAppLike('/tmp/benchmark-run')

    expect(resolveRuntimeRootPath(appLike)).toBe(
      path.join('/tmp/benchmark-run', DEV_APP_FOLDER_NAME)
    )
  })

  it('falls back when userData cannot be read', () => {
    const throwing: AppPathLike = {
      isPackaged: false,
      getPath(): string {
        throw new Error('userData unavailable')
      }
    }

    expect(resolveRuntimeRootPath(throwing, '/fallback')).toBe(
      path.join('/fallback', DEV_APP_FOLDER_NAME)
    )
  })
})

describe('the update package destination survives the rewrite', () => {
  it('is accepted when userData changes between the two resolutions', () => {
    // The defect end to end: the update system resolved its storage root at startup and wrote under
    // it, while the download policy resolved again at download time and rejected the result.
    const appLike = createMutableAppLike('/base/@scope/core-app')

    const storageRoot = resolveRuntimeRootPath(appLike) // precore, at startup
    const destination = path.join(storageRoot, 'modules', 'update-packages')

    appLike.userDataPath = '/base/@scope/tuff-dev' // polyfills, later

    const allowedRoots = [resolveRuntimeRootPath(appLike)] // download policy, later still
    const decision = evaluateDownloadTarget(
      destination,
      'tuff-2.4.14-macos-arm64.dmg',
      allowedRoots
    )

    expect(decision).toMatchObject({ allowed: true })
  })

  it('still rejects a destination that is genuinely outside every root', () => {
    const appLike = createMutableAppLike('/base/@scope/core-app')
    const roots = [resolveRuntimeRootPath(appLike)]

    expect(evaluateDownloadTarget('/tmp/somewhere-else', 'payload.dmg', roots)).toMatchObject({
      allowed: false,
      reason: 'destination-outside-roots'
    })
  })
})
