import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import { describe, expect, it } from 'vitest'
import { AUTO_MODEL_ICON, modelPillFace } from './model-pill'

function choice(fields: Partial<ModelChoice>): ModelChoice {
  return {
    providerId: 'pi-cli-default',
    providerName: 'Pi (local CLI)',
    providerType: 'custom',
    model: 'codex/gpt-5.5',
    source: 'codex',
    displayName: 'gpt-5.5',
    ...fields
  } as ModelChoice
}

describe('modelPillFace', () => {
  it('wears the auto mark with the routing label while routing is automatic', () => {
    expect(modelPillFace(undefined, 'Tuff 智能')).toEqual({
      label: 'Tuff 智能',
      icon: AUTO_MODEL_ICON
    })
    // The same mark as 「自动选择」 in the popover's left column.
    expect(AUTO_MODEL_ICON).toEqual({ type: 'class', value: 'i-ri-magic-line' })
  })

  it("shows a pinned model by name, with its family's mark or else its provider's", () => {
    expect(modelPillFace(choice({}), 'Tuff 智能')).toEqual({
      label: 'gpt-5.5',
      icon: expect.objectContaining({ type: 'class', value: 'i-simple-icons-openai' })
    })
    // No family claims `astra-turbo`: the provider's mark stands in.
    expect(
      modelPillFace(
        choice({ model: 'cpa/astra-turbo', source: 'cpa', displayName: 'astra-turbo' }),
        'Tuff 智能'
      )
    ).toEqual({
      label: 'astra-turbo',
      icon: expect.objectContaining({ type: 'class', value: 'i-simple-icons-pi' })
    })
  })
})
