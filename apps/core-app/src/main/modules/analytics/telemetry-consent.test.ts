import { describe, expect, it, vi } from 'vitest'
import { StorageList } from '@talex-touch/utils/common/storage/constants'

const { getMainConfigMock } = vi.hoisted(() => ({
  getMainConfigMock: vi.fn((_file?: unknown): unknown => undefined)
}))

vi.mock('../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: vi.fn()
}))

import { readTelemetryConsent, resolveTelemetryConsent } from './telemetry-consent'

describe('resolveTelemetryConsent', () => {
  it('defaults to enabled and not anonymous when nothing is stored', () => {
    expect(resolveTelemetryConsent(undefined)).toEqual({ enabled: true, anonymous: false })
    expect(resolveTelemetryConsent(null)).toEqual({ enabled: true, anonymous: false })
    expect(resolveTelemetryConsent('garbage')).toEqual({ enabled: true, anonymous: false })
  })

  it('honours an explicit opt-out and only a boolean true for anonymous', () => {
    expect(resolveTelemetryConsent({ enabled: false })).toEqual({
      enabled: false,
      anonymous: false
    })
    expect(resolveTelemetryConsent({ enabled: true, anonymous: true })).toEqual({
      enabled: true,
      anonymous: true
    })
    expect(resolveTelemetryConsent({ enabled: 'false', anonymous: 'true' })).toEqual({
      enabled: true,
      anonymous: false
    })
  })
})

describe('readTelemetryConsent', () => {
  it('reads sentry-config.json from main storage', () => {
    getMainConfigMock.mockImplementation((file) =>
      file === StorageList.SENTRY_CONFIG ? { enabled: false, anonymous: true } : undefined
    )
    expect(readTelemetryConsent()).toEqual({ enabled: false, anonymous: true })
    expect(getMainConfigMock).toHaveBeenCalledWith(StorageList.SENTRY_CONFIG)
  })

  it('keeps the default when storage throws', () => {
    getMainConfigMock.mockImplementation(() => {
      throw new Error('storage not ready')
    })
    expect(readTelemetryConsent()).toEqual({ enabled: true, anonymous: false })
  })
})
