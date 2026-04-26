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

export function resolveRuntimeRootPath(
  appLike: AppPathLike,
  fallbackBasePath = process.cwd()
): string {
  const userDataPath = safeGetUserDataPath(appLike, fallbackBasePath)
  const folderName = appLike.isPackaged ? APP_FOLDER_NAME : DEV_APP_FOLDER_NAME
  return path.join(userDataPath, folderName)
}
