import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPluginSecurityScanWaiver,
  listActivePluginSecurityScanWaivers,
  listPluginSecurityScanWaivers,
  resetPluginSecurityScanWaiverStoreForTests,
  revokePluginSecurityScanWaiver,
} from '../pluginSecurityScanWaiverStore'

vi.mock('../platformGovernanceStore', () => ({
  recordPlatformGovernanceEvent: async () => ({}),
}))

const event = { context: {} } as H3Event
const artifactSha256 = 'b'.repeat(64)

beforeEach(() => {
  resetPluginSecurityScanWaiverStoreForTests()
})

afterEach(() => {
  resetPluginSecurityScanWaiverStoreForTests()
  vi.restoreAllMocks()
})

describe('plugin security scan waiver store memory fallback', () => {
  it('creates a server-owned waiver, filters it on expiry, and preserves its revoked audit state', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const created = await createPluginSecurityScanWaiver(event, 'security-admin', {
      artifactSha256: artifactSha256.toUpperCase(),
      ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      reason: 'Compatibility review ticket SEC-123',
      expiresAt,
      ticket: 'SEC-123',
    })

    const activeBeforeExpiry = await listActivePluginSecurityScanWaivers(
      event,
      artifactSha256,
      new Date(Date.parse(expiresAt) - 1),
    )
    expect(activeBeforeExpiry).toEqual([expect.objectContaining({
      id: created.id,
      artifactSha256,
      ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      owner: 'security-admin',
      reason: 'Compatibility review ticket SEC-123',
      ticket: 'SEC-123',
    })])

    const activeAfterExpiry = await listActivePluginSecurityScanWaivers(
      event,
      artifactSha256,
      new Date(Date.parse(expiresAt) + 1),
    )
    expect(activeAfterExpiry).toEqual([])

    const revoked = await revokePluginSecurityScanWaiver(event, created.id, 'security-admin')
    expect(revoked.revokedAt).toEqual(expect.any(String))
    expect(await listActivePluginSecurityScanWaivers(event, artifactSha256)).toEqual([])

    const stored = await listPluginSecurityScanWaivers(event, artifactSha256)
    expect(stored).toEqual([expect.objectContaining({
      id: created.id,
      revokedAt: revoked.revokedAt,
    })])
  })
})
