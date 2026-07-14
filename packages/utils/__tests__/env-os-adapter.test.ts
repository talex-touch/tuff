import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadAdapter(platform: NodeJS.Platform) {
  vi.resetModules()
  vi.doMock('node:process', () => ({ default: { platform }, platform }))
  return await import('../electron/env-tool')
}

afterEach(() => {
  vi.doUnmock('node:process')
  vi.resetModules()
})

describe('withOSAdapter', () => {
  it.each([
    { platform: 'win32' as const, expected: 'Windows result' },
    { platform: 'darwin' as const, expected: 'macOS result' },
    { platform: 'linux' as const, expected: 'Linux result' }
  ])('dispatches the prepared payload to the $platform implementation', async ({ platform, expected }) => {
    const { withOSAdapter } = await loadAdapter(platform)
    const calls: string[] = []

    const result = withOSAdapter({
      onBeforeExecute: () => {
        calls.push('prepare')
        return 'prepared payload'
      },
      win32: (payload) => {
        calls.push(`win32:${payload}`)
        return 'Windows result'
      },
      darwin: (payload) => {
        calls.push(`darwin:${payload}`)
        return 'macOS result'
      },
      linux: (payload) => {
        calls.push(`linux:${payload}`)
        return 'Linux result'
      }
    })

    expect(result).toBe(expected)
    expect(calls).toEqual(['prepare', `${platform}:prepared payload`])
  })

  it('returns no result when the current OS has no adapter while preserving preparation lifecycle', async () => {
    const { withOSAdapter } = await loadAdapter('freebsd' as NodeJS.Platform)
    const calls: string[] = []

    const result = withOSAdapter({
      onBeforeExecute: () => {
        calls.push('prepare')
        return 'prepared payload'
      },
      win32: () => {
        calls.push('win32')
        return 'should not run'
      }
    })

    expect(result).toBeUndefined()
    expect(calls).toEqual(['prepare'])
  })
})
