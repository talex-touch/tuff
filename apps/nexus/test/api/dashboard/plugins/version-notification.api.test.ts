import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard plugin version notification contract', () => {
  it('routes version moderation notifications to the plugin developer context', () => {
    const handler = readFileSync(
      new URL('../../../../server/api/dashboard/plugins/[id]/versions/[versionId].patch.ts', import.meta.url),
      'utf8',
    )

    expect(handler).toContain('dispatchNotificationEvent(event')
    expect(handler).toContain("status === 'approved' ? 'plugin.version.approved'")
    expect(handler).toContain("status === 'rejected' ? 'plugin.version.rejected'")
    expect(handler).toContain('userId: plugin.userId')
    expect(handler).toContain('developerId: plugin.userId')
    expect(handler).not.toContain('ownerEmail')
  })
})
