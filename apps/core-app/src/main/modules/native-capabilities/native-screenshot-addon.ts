import type * as NativeScreenshotAddonModule from '@talex-touch/tuff-native/screenshot'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type NativeAddonCaptureOptions =
  NativeScreenshotAddonModule.NativeScreenshotCaptureOptions
export type NativeAddonCaptureResult =
  NativeScreenshotAddonModule.NativeScreenshotCaptureResult
export type NativeAddonDisplay = NativeScreenshotAddonModule.NativeScreenshotDisplay

type NativeScreenshotAddon = typeof NativeScreenshotAddonModule

const requireAddon = createRequire(import.meta.url)
let cachedAddon: NativeScreenshotAddon | null = null

function collectAncestorDirs(start: string): string[] {
  const dirs: string[] = []
  let cursor = path.resolve(start)
  while (true) {
    dirs.push(cursor)
    const next = path.dirname(cursor)
    if (next === cursor) break
    cursor = next
  }
  return dirs
}

function resolveWorkspaceFallback(): string | null {
  const startDirs = [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url))
  ]
  const seen = new Set<string>()

  for (const startDir of startDirs) {
    for (const dir of collectAncestorDirs(startDir)) {
      if (seen.has(dir)) continue
      seen.add(dir)
      const candidate = path.join(dir, 'packages', 'tuff-native', 'screenshot.js')
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

function loadNativeScreenshotAddon(): NativeScreenshotAddon {
  if (cachedAddon) return cachedAddon

  try {
    cachedAddon = requireAddon('@talex-touch/tuff-native/screenshot') as NativeScreenshotAddon
    return cachedAddon
  } catch (primaryError) {
    const fallback = resolveWorkspaceFallback()
    if (fallback) {
      cachedAddon = requireAddon(fallback) as NativeScreenshotAddon
      return cachedAddon
    }
    throw primaryError
  }
}

export const nativeScreenshotAddon: NativeScreenshotAddon = {
  getNativeScreenshotSupport: (...args) =>
    loadNativeScreenshotAddon().getNativeScreenshotSupport(...args),
  listDisplays: (...args) => loadNativeScreenshotAddon().listDisplays(...args),
  captureDisplay: (...args) => loadNativeScreenshotAddon().captureDisplay(...args),
  captureRegion: (...args) => loadNativeScreenshotAddon().captureRegion(...args),
  capture: (...args) => loadNativeScreenshotAddon().capture(...args)
}
