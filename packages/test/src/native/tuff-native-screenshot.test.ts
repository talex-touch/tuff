import process from 'node:process'
import { loadScreenshotCarrier } from '@talex-touch/tuff-native/screenshot-protocol'
import { describe, expect, it } from 'vitest'

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_SCREENSHOT'

describe('tuff-native screenshot protocol contract', () => {
  it('loads the screenshot carrier and reports the versioned capability shape', async () => {
    const loaded = loadScreenshotCarrier({ clientName: 'package-test', clientVersion: '1.0.0' })
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
