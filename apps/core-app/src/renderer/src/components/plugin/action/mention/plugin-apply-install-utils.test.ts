import { describe, expect, it } from 'vitest'
import {
  isPluginAlreadyInstalledMessage,
  resolvePluginApplyInstallErrorMessage
} from './plugin-apply-install-utils'

function translate(key: string, params?: unknown): string {
  return `${key}:${JSON.stringify(params ?? null)}`
}

describe('plugin-apply-install-utils', () => {
  it('detects update prompt responses', () => {
    expect(isPluginAlreadyInstalledMessage('plugin already exists')).toBe(true)
    expect(isPluginAlreadyInstalledMessage('10091')).toBe(false)
  })

  it('maps legacy install result codes to translated copy', () => {
    expect(resolvePluginApplyInstallErrorMessage('10091', translate)).toBe(
      'plugin.dropInstall.corrupted:null'
    )
    expect(resolvePluginApplyInstallErrorMessage('10092', translate)).toBe(
      'plugin.dropInstall.invalidPackage:null'
    )
    expect(resolvePluginApplyInstallErrorMessage('INTERNAL_ERROR', translate)).toBe(
      'plugin.dropInstall.invalidPackage:null'
    )
  })

  it('collapses unknown responses to a generic install failure', () => {
    expect(resolvePluginApplyInstallErrorMessage('invalid plugin name', translate)).toBe(
      'plugin.dropInstall.installFailed:null'
    )
    expect(resolvePluginApplyInstallErrorMessage(null, translate)).toBe(
      'plugin.dropInstall.installFailed:null'
    )
  })
})
