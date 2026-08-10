import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadScreenshotCarrier } from '@talex-touch/tuff-native/screenshot-protocol'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_SCREENSHOT'

/**
 * The carrier is a compiled Rust addon. `Integration suite (packages/test)` installs and runs;
 * it does not build Rust, so the binding is legitimately absent there and this file was red on
 * every PR for it. `native-protocol.yml` does build it, and sets this flag to demand it loads.
 */
const REQUIRE_BINDING = process.env.TUFF_NATIVE_SCREENSHOT_REQUIRED === '1'

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/native-protocol.yml', import.meta.url)),
  'utf8',
)

describe('tuff-native screenshot protocol contract', () => {
  it('is demanded to load by the workflow that builds it', () => {
    // Without this, the tolerance below is indistinguishable from no coverage: every runner
    // would report the binding absent and the capability shape would go unasserted anywhere.
    expect(WORKFLOW).toContain('TUFF_NATIVE_SCREENSHOT_REQUIRED')
    expect(WORKFLOW).toMatch(/packages\/test[\s\S]{0,120}src\/native/)
  })

  it('loads the screenshot carrier and reports the versioned capability shape', async () => {
    const loaded = loadScreenshotCarrier({ clientName: 'package-test', clientVersion: '1.0.0' })

    if (!REQUIRE_BINDING && !loaded.carrier) {
      // Tolerated, but only in this one shape. `export-mismatch` or a null reason with no
      // carrier are real defects and still fail here.
      expect(loaded).toEqual({ carrier: null, reason: 'binding-unavailable' })
      return
    }

    expect(loaded.reason).toBeNull()
    if (!loaded.carrier)
      throw new Error('Screenshot protocol carrier is unavailable')

    try {
      const hello = loaded.carrier.handshake()
      const capability = hello.capabilities.find(item => item.id === 'screenshot.capture')

      expect(capability).toMatchObject({
        id: 'screenshot.capture',
        version: '1.1.0',
      })
      expect(capability?.operations.map(operation => [operation.name, operation.mode])).toEqual([
        ['probe', 'unary'],
        ['refresh', 'unary'],
        ['hit_test', 'unary'],
        ['capture', 'unary'],
        ['compose', 'unary'],
        ['frames', 'stream'],
      ])
      expect(['available', 'degraded', 'unavailable']).toContain(capability?.state)
    }
    finally {
      await loaded.carrier.dispose()
    }
  })

  it('honors TUFF_DISABLE_NATIVE_SCREENSHOT without loading a fallback', () => {
    const previous = process.env[DISABLE_FLAG]
    process.env[DISABLE_FLAG] = '1'

    try {
      expect(loadScreenshotCarrier()).toEqual({ carrier: null, reason: 'disabled-by-env' })
    }
    finally {
      if (previous === undefined)
        delete process.env[DISABLE_FLAG]
      else process.env[DISABLE_FLAG] = previous
    }
  })
})
