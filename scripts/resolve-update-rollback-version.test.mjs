import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

import { resolveSameChannelRollbackVersion } from './resolve-update-rollback-version.mjs'

describe('resolveSameChannelRollbackVersion', () => {
  it('selects the highest lower same-channel version from unsorted tags when the current tag is absent', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.13',
      tags: ['v2.4.11', 'v2.4.12-beta.9', 'v2.4.10', 'v2.4.12'],
    })

    assert.deepEqual(result, {
      channel: 'RELEASE',
      rollbackFromVersion: '2.4.12',
      rollbackTag: 'v2.4.12',
      targetVersion: '2.4.13',
    })
  })

  it('selects the immediately preceding beta sequence for the same patch', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.12-beta.11',
      tags: [
        'v2.4.12-alpha.12',
        'v2.4.12-beta.2',
        'v2.4.12-beta.10',
        'v2.4.11-beta.99',
      ],
    })

    assert.equal(result.rollbackFromVersion, '2.4.12-beta.10')
    assert.equal(result.rollbackTag, 'v2.4.12-beta.10')
  })

  it('normalizes preview aliases into the BETA rollback channel', () => {
    const result = resolveSameChannelRollbackVersion({
      tag: 'v2.4.12-snapshot.3',
      tags: ['v2.4.12-alpha.2', 'v2.4.11', 'v2.4.12'],
    })

    assert.equal(result.channel, 'BETA')
    assert.equal(result.rollbackFromVersion, '2.4.12-alpha.2')
  })

  it('fails rather than selecting a cross-channel or newer rollback target', () => {
    assert.throws(
      () =>
        resolveSameChannelRollbackVersion({
          tag: 'v2.4.12-beta.1',
          tags: ['v2.4.12', 'v2.4.12-beta.2', 'v2.4.11'],
        }),
      /No same-channel predecessor exists/,
    )
  })
})
