import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as tuffNative from '@talex-touch/tuff-native'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_ACTIVE_APP'
const REQUIRE_ACTIVE_APP = process.env.TUFF_NATIVE_ACTIVE_APP_REQUIRED === '1'

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/native-protocol.yml', import.meta.url)),
  'utf8',
)

describe('tuff-native darwin active-app smoke & contract', () => {
  it('is demanded on macOS by native-protocol.yml', () => {
    expect(WORKFLOW).toContain('TUFF_NATIVE_ACTIVE_APP_REQUIRED')
    expect(WORKFLOW).toContain('src/native/tuff-native-active-app.test.ts')
  })

  it('exports getDarwinFrontmostApplication', () => {
    expect(typeof tuffNative.getDarwinFrontmostApplication).toBe('function')
  })

  it('honors TUFF_DISABLE_NATIVE_ACTIVE_APP=1 without throwing', async () => {
    const previous = process.env[DISABLE_FLAG]
    process.env[DISABLE_FLAG] = '1'

    try {
      const result = await tuffNative.getDarwinFrontmostApplication()
      expect(result).toEqual({
        supported: false,
        available: false,
        reason: 'disabled-by-env',
      })
    }
    finally {
      if (previous === undefined) {
        delete process.env[DISABLE_FLAG]
      }
      else {
        process.env[DISABLE_FLAG] = previous
      }
    }
  })

  it('returns stable contract shape across platforms and demands macOS binding when required', async () => {
    const result = await tuffNative.getDarwinFrontmostApplication()

    expect(typeof result).toBe('object')
    expect(typeof result.supported).toBe('boolean')
    expect(typeof result.available).toBe('boolean')

    if (process.platform !== 'darwin') {
      expect(result.supported).toBe(false)
      expect(result.available).toBe(false)
      expect(typeof result.reason).toBe('string')
      return
    }

    if (!result.supported) {
      expect(
        REQUIRE_ACTIVE_APP,
        `getDarwinFrontmostApplication reported unsupported on darwin (${result.reason}) while TUFF_NATIVE_ACTIVE_APP_REQUIRED=1`,
      ).toBe(false)
      return
    }

    expect(result.supported).toBe(true)
    if (result.available) {
      expect(typeof result.processId).toBe('number')
      expect((result.processId ?? 0) > 0).toBe(true)
      for (const key of ['appName', 'bundleId', 'bundlePath', 'executablePath', 'windowTitle'] as const) {
        if (result[key] !== undefined) {
          expect(typeof result[key]).toBe('string')
        }
      }
    }
    else {
      expect(typeof result.reason).toBe('string')
    }
  })

  it('survives concurrent calls across libuv worker threads', async () => {
    if (process.platform !== 'darwin') {
      return
    }

    const first = await tuffNative.getDarwinFrontmostApplication()
    if (!first.supported) {
      expect(REQUIRE_ACTIVE_APP).toBe(false)
      return
    }

    const results = await Promise.all(
      Array.from({ length: 6 }, () => tuffNative.getDarwinFrontmostApplication()),
    )
    for (const item of results) {
      expect(item.supported).toBe(true)
      expect(typeof item.available).toBe('boolean')
    }
  })
})
