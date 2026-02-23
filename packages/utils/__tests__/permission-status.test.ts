import { describe, expect, it } from 'vitest'
import { getPluginPermissionStatus } from '../permission'

const ENFORCED_SDK = 251212

describe('permission status resolution', () => {
  it('keeps historical grants in deprecatedGranted while only exposing effective declared grants', () => {
    const status = getPluginPermissionStatus(
      'demo-plugin',
      ENFORCED_SDK,
      {
        required: ['clipboard.read'],
        optional: [],
      },
      ['clipboard.read', 'fs.read', 'storage.plugin', 'legacy.removed.permission'],
    )

    expect(status.granted).toEqual(['clipboard.read'])
    expect(status.deprecatedGranted).toEqual(['fs.read', 'legacy.removed.permission'])
    expect(status.outdatedByPluginChange).toEqual(['fs.read'])
    expect(status.outdatedByAppUpdate).toEqual(['legacy.removed.permission'])
    expect(status.missingRequired).toEqual([])
  })

  it('treats declared default permissions as granted even without explicit records', () => {
    const status = getPluginPermissionStatus(
      'demo-plugin',
      ENFORCED_SDK,
      {
        required: ['storage.plugin'],
        optional: [],
      },
      [],
    )

    expect(status.granted).toEqual(['storage.plugin'])
    expect(status.deprecatedGranted).toEqual([])
    expect(status.outdatedByPluginChange).toEqual([])
    expect(status.outdatedByAppUpdate).toEqual([])
    expect(status.missingRequired).toEqual([])
  })
})
