import { release } from 'node:os'
import process from 'node:process'
import { app } from 'electron'
import type { FileIconOptions, NativeImage } from 'electron'

// Electron 41.3-43.2 hard-crashes with SIGTRAP when app.getFileIcon runs on Darwin 27.
// Keep native extraction behind this boundary until the runtime/OS combination is safe.
const UNSAFE_DARWIN_FILE_ICON_MAJOR = 27

export function canUseElectronFileIcon(): boolean {
  if (process.platform !== 'darwin' || !process.versions.electron) return true

  const major = Number.parseInt(release().split('.')[0] ?? '', 10)
  return major !== UNSAFE_DARWIN_FILE_ICON_MAJOR
}

export async function getElectronFileIcon(
  filePath: string,
  options?: FileIconOptions
): Promise<NativeImage | null> {
  if (!canUseElectronFileIcon()) return null
  return app.getFileIcon(filePath, options)
}
