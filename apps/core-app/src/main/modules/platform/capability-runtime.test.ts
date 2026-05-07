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

import {
  getActiveAppCapabilityPatch,
  getAutoPasteCapabilityPatch,
  getNativeShareCapabilityPatch,
  getPermissionDeepLinkCapabilityPatch
} from './capability-adapter'
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

function expectActionableCapabilityMetadata(
  patch: { supportLevel: string; issueCode?: string; reason?: string; limitations?: string[] },
  expectedIssueCode: string
): void {
  expect(patch.supportLevel === 'best_effort' || patch.supportLevel === 'unsupported').toBe(true)
  expect(patch.issueCode).toBe(expectedIssueCode)
  expect(patch.reason).toEqual(expect.any(String))
  expect(patch.reason?.length).toBeGreaterThan(0)
  expect(patch.limitations?.length).toBeGreaterThan(0)
}

describe('platform capability runtime patch', () => {
  it('reports macOS active-app as best-effort because Automation permission is runtime dependent', async () => {
    const patch = await withPlatform('darwin', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('best_effort')
    expectActionableCapabilityMetadata(patch, 'AUTOMATION_PERMISSION')
  })

  it('reports Windows active-app as best-effort because PowerShell probing can fail at runtime', async () => {
    const patch = await withPlatform('win32', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('best_effort')
    expectActionableCapabilityMetadata(patch, 'POWERSHELL_FOREGROUND_WINDOW')
  })

  it('reports Linux active-app as unsupported when xdotool is missing', async () => {
    isXdotoolAvailableMock.mockResolvedValueOnce(false)

    const patch = await withPlatform('linux', () => getActiveAppCapabilityPatch())

    expect(patch.supportLevel).toBe('unsupported')
    expectActionableCapabilityMetadata(patch, 'XDTOOL_MISSING')
  })

  it('reports Linux auto-paste as unsupported when xdotool is missing', async () => {
    isXdotoolAvailableMock.mockResolvedValueOnce(false)

    const patch = await withPlatform('linux', () => getAutoPasteCapabilityPatch())

    expect(patch.supportLevel).toBe('unsupported')
    expectActionableCapabilityMetadata(patch, 'XDTOOL_MISSING')
  })

  it('reports native share as explicit mail-only unsupported on Windows and Linux', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const patch = withPlatform(platform, () => getNativeShareCapabilityPatch())

      expect(patch.supportLevel).toBe('unsupported')
      expectActionableCapabilityMetadata(patch, 'MAIL_ONLY')
    }
  })

  it('reports Linux permission deep-link as desktop best-effort', () => {
    const patch = withPlatform('linux', () => getPermissionDeepLinkCapabilityPatch())

    expect(patch.supportLevel).toBe('best_effort')
    expectActionableCapabilityMetadata(patch, 'DESKTOP_ENV')
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
