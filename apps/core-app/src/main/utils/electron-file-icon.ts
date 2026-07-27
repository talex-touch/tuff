import process from 'node:process'
import { app } from 'electron'
import type { FileIconOptions, NativeImage } from 'electron'

export function canUseElectronFileIcon(options?: FileIconOptions): boolean {
  return process.platform !== 'darwin' || options?.size !== 'large'
}

export async function getElectronFileIcon(
  filePath: string,
  options?: FileIconOptions
): Promise<NativeImage | null> {
  if (!canUseElectronFileIcon(options)) return null
  return app.getFileIcon(filePath, options)
}
