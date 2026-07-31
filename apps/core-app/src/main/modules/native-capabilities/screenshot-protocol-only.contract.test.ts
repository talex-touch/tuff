import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('screenshot protocol-only hard cut', () => {
  it('removes legacy package and CoreApp addon files', () => {
    for (const relativePath of [
      'packages/tuff-native/screenshot.js',
      'packages/tuff-native/screenshot.d.ts',
      'apps/core-app/src/main/modules/native-capabilities/native-screenshot-addon.ts'
    ]) {
      expect(existsSync(path.join(repoRoot, relativePath)), relativePath).toBe(false)
    }
  })

  it('keeps the Rust addon protocol-only', () => {
    const rust = source('packages/tuff-native/native-screenshot/src/lib.rs')
    for (const removed of [
      'get_native_screenshot_support',
      'list_displays',
      'capture_display',
      'capture_region',
      'capture_with_options',
      'xcap::'
    ]) {
      expect(rust).not.toContain(removed)
    }
  })

  it('removes raw addon loading and legacy coordinate conversion from CoreApp', () => {
    const service = source(
      'apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts'
    )
    for (const removed of [
      'native-screenshot-addon',
      'getPhysicalBounds',
      'scoreDisplayPair',
      'mapDisplays',
      'toNativeLocalRegion',
      'toNativePoint'
    ]) {
      expect(service).not.toContain(removed)
    }
  })
})
