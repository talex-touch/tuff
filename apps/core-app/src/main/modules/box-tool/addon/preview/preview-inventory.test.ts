import { beforeAll, describe, expect, it } from 'vitest'
import {
  listPreviewAbilityInventory,
  listPreviewDynamicExecutionInventory
} from './preview-inventory'
import { registerDefaultPreviewAbilities } from './abilities'
import { previewAbilityRegistry, registerPreviewAbility } from './preview-registry'

beforeAll(() => {
  if (previewAbilityRegistry.list().length === 0) {
    registerDefaultPreviewAbilities({ register: registerPreviewAbility })
  }
})

describe('preview inventory', () => {
  it('classifies migrated SDK abilities and CoreApp adapters', () => {
    const inventory = listPreviewAbilityInventory()

    expect(inventory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'preview.expression.basic',
          owner: 'preview-sdk',
          status: 'migrated',
          safety: expect.objectContaining({ usesDynamicExecution: false })
        }),
        expect.objectContaining({
          id: 'preview.expression.advanced',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.constants.scientific',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.time',
          owner: 'preview-sdk',
          status: 'migrated'
        }),
        expect.objectContaining({
          id: 'preview.currency',
          owner: 'core-app',
          status: 'adapter',
          safety: expect.objectContaining({ usesNetwork: true, usesCache: true })
        })
      ])
    )
  })

  it('keeps widget runtime sandbox out of PreviewSDK inventory', () => {
    expect(listPreviewDynamicExecutionInventory()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'widget.runtime.sandbox',
          owner: 'core-app',
          boundary: 'sandbox',
          dynamicExecution: true,
          replacementPlan: expect.stringContaining('Keep out of PreviewSDK')
        })
      ])
    )
  })
})
