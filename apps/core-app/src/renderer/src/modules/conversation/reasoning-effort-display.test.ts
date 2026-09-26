import { describe, expect, it } from 'vitest'
import { reasoningLevelLabelKey, resolveReasoningRow } from './reasoning-effort-display'

const GPT_55 = { providerId: 'openai-default', providerType: 'openai', model: 'gpt-5.5' }
const GPT_4O = { providerId: 'openai-default', providerType: 'openai', model: 'gpt-4o' }
const V4_PRO = {
  providerId: 'deepseek-default',
  providerType: 'deepseek',
  model: 'deepseek-v4-pro'
}
const OLLAMA = { providerId: 'local-default', providerType: 'local', model: 'qwen3:8b' }
const NEXUS = { providerId: 'tuff-nexus-default', providerType: 'custom', model: 'gpt-4o-mini' }
const PI = { providerId: 'pi-cli-default', providerType: 'local', model: 'openai/gpt-5.5' }

describe('resolveReasoningRow', () => {
  it('shows no suffix on auto, whatever is pinned (D11-a)', () => {
    for (const choice of [undefined, GPT_55, V4_PRO, NEXUS, PI]) {
      expect(resolveReasoningRow('auto', choice)).toEqual({
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
    expect(resolveReasoningRow('max', PI)).toEqual({
      disabled: false,
      note: null,
      pillLevel: 'max'
    })
  })
})

describe('reasoningLevelLabelKey', () => {
  it('points into the home.reasoning.level catalog', () => {
    expect(reasoningLevelLabelKey('xhigh')).toBe('home.reasoning.level.xhigh')
  })
})
