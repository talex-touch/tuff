import { describe, expect, it, vi } from 'vitest'
import { runStartupHealthCheck } from './startup-health'

describe('startup-health', () => {
  it('does not mark healthy when module loading fails', async () => {
    const onHealthy = vi.fn()
    await expect(
      runStartupHealthCheck({
        loadModules: async () => {
          throw new Error('load-failed')
        },
        waitUntilInitialized: vi.fn(async () => {}),
        onHealthy
      })
    ).rejects.toThrow('load-failed')
    expect(onHealthy).not.toHaveBeenCalled()
  })

  it('does not mark healthy when renderer initialization fails', async () => {
    const onHealthy = vi.fn()
    await expect(
      runStartupHealthCheck({
        loadModules: async () => [{ name: 'A', loadTime: 1, order: 1 }],
        waitUntilInitialized: async () => {
          throw new Error('renderer-init-failed')
        },
        onHealthy
      })
    ).rejects.toThrow('renderer-init-failed')
    expect(onHealthy).not.toHaveBeenCalled()
  })
})
