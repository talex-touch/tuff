import { describe, expect, it } from 'vitest'
import {
  presetCloudService,
  PresetCloudServicePlaceholder,
  PresetCloudUnavailableService
} from '../common/storage/entity/preset-cloud-api'

describe('preset cloud unavailable service', () => {
  it('reports a machine-readable not-shipped status', () => {
    expect(presetCloudService.getStatus()).toMatchObject({
      available: false,
      reason: 'not-shipped',
      authenticated: false
    })
  })

  it('fails closed for cloud preset operations', async () => {
    await expect(presetCloudService.listPresets()).rejects.toThrow(
      'Cloud preset service is not shipped'
    )
  })

  it('keeps the deprecated placeholder alias fail-closed', () => {
    const placeholder = new PresetCloudServicePlaceholder()
    const unavailable = new PresetCloudUnavailableService()

    expect(placeholder.getStatus()).toEqual(unavailable.getStatus())
  })
})
