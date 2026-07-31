import { describe, expect, it } from 'vitest'
import { sanitizeTelemetryFailureCode } from './telemetry-upload-stats-store'

describe('telemetry upload failure projection', () => {
  it('keeps stable codes and replaces native detail', () => {
    expect(sanitizeTelemetryFailureCode('NETWORK_TIMEOUT')).toBe('NETWORK_TIMEOUT')
    expect(sanitizeTelemetryFailureCode('CANARY_NATIVE_ERROR path=/private query=secret')).toBe(
      'TELEMETRY_UPLOAD_FAILED'
    )
    expect(sanitizeTelemetryFailureCode(null)).toBeNull()
  })
})
