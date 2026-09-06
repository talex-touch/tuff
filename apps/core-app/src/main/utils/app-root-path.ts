import path from 'node:path'
import process from 'node:process'
import { APP_FOLDER_NAME } from '../config/default'

export const DEV_APP_FOLDER_NAME = `${APP_FOLDER_NAME}-dev`

export interface AppPathLike {
  isPackaged: boolean
  getPath(name: 'userData'): string
}

function safeGetUserDataPath(appLike: AppPathLike, fallbackBasePath: string): string {
  try {
    return appLike.getPath('userData')
  } catch {
    return fallbackBasePath
  }
}

/**
 * The app data root, resolved once and then fixed for the process.
 *
 * `userData` is rewritten twice during startup, and the root must follow exactly one of them.
 * `precore` overrides it for startup benchmarking and then reads the root immediately, so a
 * benchmark run gets an isolated root — that one is deliberate. `polyfills` later points Chromium's
 * profile at a separate dev directory, which is about Chromium, not about where our own data lives.
 *
 * Reading `userData` afresh on every call meant the answer depended on when you asked.
 * `getAllowedDownloadRoots` asked at download time and got the post-`polyfills` path, while the
 * update system wrote under the root `precore` had captured at startup, so every update download
 * in a dev build was rejected as `destination-outside-roots` (#F2).
 *
 * Memoizing makes the first resolution authoritative for everyone. `precore` performs it at
 * module load, after the benchmark override and before the Chromium one, which is the point that
 * was always intended.
 */
let memoizedRootPath: string | null = null

export function resolveRuntimeRootPath(
  appLike: AppPathLike,
  fallbackBasePath = process.cwd()
): string {
  if (memoizedRootPath !== null) {
    return memoizedRootPath
  }

  const userDataPath = safeGetUserDataPath(appLike, fallbackBasePath)
  const folderName = appLike.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  memoizedRootPath = path.join(userDataPath, folderName)
  return memoizedRootPath
}

/**
 * Clears the memoized root so a test can resolve it again under different conditions.
 *
 * Production has no reason to call this: a process that changed its data root mid-run would leave
 * half its state in the previous one.
 */
export function resetRuntimeRootPathForTests(): void {
  memoizedRootPath = null
}
