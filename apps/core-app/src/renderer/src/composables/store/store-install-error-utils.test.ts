import { describe, expect, it } from 'vitest'
import { resolveStoreInstallFailureReason } from './store-install-error-utils'

function translate(key: string, params?: unknown): string {
  return `${key}:${JSON.stringify(params ?? null)}`
}

describe('resolveStoreInstallFailureReason', () => {
  it('maps known install codes to translated reasons', () => {
    expect(resolveStoreInstallFailureReason('STORE_INSTALL_NO_SOURCE', translate)).toBe(
      'store.installation.reasons.noSource:null'
    )
    expect(resolveStoreInstallFailureReason('INSTALL_FAILED', translate)).toBe(
      'store.installation.reasons.installFailed:null'
    )
    expect(resolveStoreInstallFailureReason('UNAUTHORIZED', translate)).toBe(
      'store.installation.reasons.authRequired:null'
    )
    expect(resolveStoreInstallFailureReason('HTTP_ERROR_503', translate)).toBe(
      'store.installation.reasons.httpError:{"status":"503"}'
    )
  })

  it('maps sdk gate messages to readable reasons', () => {
    expect(resolveStoreInstallFailureReason('SDKAPI_BLOCKED', translate)).toBe(
      'store.installation.reasons.sdkapiBlocked:null'
    )
    expect(
      resolveStoreInstallFailureReason(
        'Plugin "demo" is blocked because manifest.json must declare sdkapi >= 251212.',
        translate
      )
    ).toBe('store.installation.reasons.sdkapiMissing:null')
    expect(
      resolveStoreInstallFailureReason(
        'Plugin "demo" is blocked because sdkapi "abc" is invalid. Use YYMMDD format and declare at least 251212.',
        translate
      )
    ).toBe('store.installation.reasons.sdkapiInvalid:null')
    expect(
      resolveStoreInstallFailureReason(
        'Plugin "demo" is blocked because sdkapi 251211 is below the minimum supported baseline 251212.',
        translate
      )
    ).toBe('store.installation.reasons.sdkapiOutdated:{"declared":"251211","minimum":"251212"}')
  })

  it('preserves unknown messages for diagnostics', () => {
    expect(resolveStoreInstallFailureReason('Install queue is not ready', translate)).toBe(
      'Install queue is not ready'
    )
  })
})
