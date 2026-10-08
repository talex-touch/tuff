import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { describe, expect, it, vi } from 'vitest'
import { resolveProviderEffectiveModel } from '../../../../main/modules/ai/model-request-plan'
import * as modelCatalog from '../../../../main/modules/ai/providers/pi-model-catalog'
import { resolveReasoningRow } from './reasoning-effort-display'

function choice(providerId: string, type: IntelligenceProviderType, model: string) {
  return {
    providerId,
    providerType: type,
    model,
    binding: resolveProviderEffectiveModel(
      {
        id: providerId,
        name: providerId,
        type,
        enabled: true,
        models: [{ id: model }]
      },
      model
    )
  }
}

const GPT_55 = choice('openai-default', IntelligenceProviderType.OPENAI, 'gpt-5.5')
const GPT_4O = choice('openai-default', IntelligenceProviderType.OPENAI, 'gpt-4o')
const V4_PRO = choice('deepseek-default', IntelligenceProviderType.DEEPSEEK, 'deepseek-v4-pro')
const OLLAMA = choice('local-default', IntelligenceProviderType.LOCAL, 'qwen3:8b')
const NEXUS = choice('tuff-nexus-default', IntelligenceProviderType.CUSTOM, 'gpt-4o-mini')

function piChoice() {
  const catalog = vi.spyOn(modelCatalog, 'readPiCliModelCatalog').mockReturnValue(new Map())
  try {
    return choice('pi-cli-default', IntelligenceProviderType.LOCAL, 'openai/gpt-5.5')
  } finally {
    catalog.mockRestore()
  }
}

describe('resolveReasoningRow', () => {
  it('shows no suffix for an explicit auto effort on supported routes (D11-a)', () => {
    for (const route of [undefined, GPT_55, V4_PRO, NEXUS, piChoice()]) {
      expect(resolveReasoningRow('auto', route)).toEqual({
        disabled: false,
        note: null,
        pillLevel: null
      })
    }
  })

  it('keeps the chosen level on auto routing, and says it depends on where the turn lands', () => {
    expect(resolveReasoningRow('high', undefined)).toEqual({
      disabled: false,
      note: { kind: 'auto-route' },
      pillLevel: 'high'
    })
  })

  it('shows the chosen level when the pinned model has it', () => {
    expect(resolveReasoningRow('medium', GPT_55)).toEqual({
      disabled: false,
      note: null,
      pillLevel: 'medium'
    })
    // 极高 stays 极高 even where the model's strongest is spelled `xhigh`.
    expect(resolveReasoningRow('max', GPT_55).pillLevel).toBe('max')
  })

  it('shows the level the model will round to, and why', () => {
    expect(resolveReasoningRow('low', V4_PRO)).toEqual({
      disabled: false,
      note: { kind: 'clamped', requested: 'low', applied: 'high' },
      pillLevel: 'high'
    })
  })

  it('goes inert with its reason when the route takes no effort, on auto too', () => {
    expect(resolveReasoningRow('high', GPT_4O)).toEqual({
      disabled: true,
      note: { kind: 'unsupported-model' },
      pillLevel: null
    })
    expect(resolveReasoningRow('auto', OLLAMA)).toEqual({
      disabled: true,
      note: { kind: 'unsupported-provider' },
      pillLevel: null
    })
  })

  it('leaves Tuff Nexus to decide per upstream, and says so', () => {
    expect(resolveReasoningRow('high', NEXUS)).toEqual({
      disabled: false,
      note: { kind: 'cloud' },
      pillLevel: 'high'
    })
  })

  it('hands pi the level as chosen', () => {
    expect(resolveReasoningRow('max', piChoice())).toEqual({
      disabled: false,
      note: null,
      pillLevel: 'max'
    })
  })
})
