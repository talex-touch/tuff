import { describe, expect, it, vi } from 'vitest'

const { isXdotoolAvailableMock } = vi.hoisted(() => ({
  isXdotoolAvailableMock: vi.fn()
}))

vi.mock('../box-tool/addon/files/everything-provider', () => ({
  everythingProvider: {
    getStatusSnapshot: vi.fn(() => ({
      enabled: false,
      available: false
    }))
  }
}))

vi.mock('../system/linux-desktop-tools', () => ({
  getXdotoolUnavailableReason: vi.fn(() => 'xdotool is not available'),
  isXdotoolAvailable: isXdotoolAvailableMock
}))

import { getActiveAppCapabilityPatch } from './capability-adapter'
import {
  platformCapabilityRegistry,
  registerDefaultPlatformCapabilities
} from './capability-registry'

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const original = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: original,
      configurable: true
    })
  }
}

describe('platform capability runtime patch', () => {
  it('reports macOS active-app as best-effort because Automation permission is runtime dependent', async () => {
    const patch = await withPlatform('darwin', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('best_effort')
    expect(patch.issueCode).toBe('AUTOMATION_PERMISSION')
  })

  it('reports Windows active-app as best-effort because PowerShell probing can fail at runtime', async () => {
    const patch = await withPlatform('win32', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('best_effort')
    expect(patch.issueCode).toBe('POWERSHELL_FOREGROUND_WINDOW')
  })

  it('reports Linux active-app as unsupported when xdotool is missing', async () => {
    isXdotoolAvailableMock.mockResolvedValueOnce(false)

    const patch = await withPlatform('linux', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('unsupported')
    expect(patch.issueCode).toBe('XDTOOL_MISSING')
  })
})

describe('platform capability registry', () => {
  it('keeps Flow Transfer conditional while exposing DivisionBox as a real container capability', () => {
    registerDefaultPlatformCapabilities()

    const capabilities = platformCapabilityRegistry.list()
    const flowTransfer = capabilities.find((item) => item.id === 'platform.flow-transfer')
    const divisionBox = capabilities.find((item) => item.id === 'platform.division-box')

    expect(flowTransfer?.supportLevel).toBe('best_effort')
    expect(flowTransfer?.issueCode).toBe('TARGET_HANDLER_REQUIRED')
    expect(divisionBox?.supportLevel).toBe('supported')
    expect(divisionBox?.issueCode).toBeUndefined()
  })
})
