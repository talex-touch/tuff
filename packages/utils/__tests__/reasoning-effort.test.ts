import type { ReasoningEffortPlan, ReasoningEffortTarget } from '../intelligence/reasoning-effort'
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_NON_STREAMING_MAX_TOKENS,
  DEFAULT_REASONING_EFFORT_SETTING,
  normalizeReasoningEffort,
  normalizeReasoningEffortDecision,
  normalizeReasoningEffortSetting,
  planReasoningEffort,
  REASONING_CLI_ROUTES,
  REASONING_EFFORT_SETTINGS,
  resolveReasoningEffortSupport,
  toLangChainAnthropicThinkingFields,
  toLangChainOpenAiReasoningFields,
} from '../intelligence/reasoning-effort'
import { TUFF_NEXUS_PROVIDER_ID } from '../intelligence/nexus-provider'

const openai = (model?: string): ReasoningEffortTarget => ({ providerType: 'openai', providerId: 'openai-default', model })
const anthropic = (model?: string): ReasoningEffortTarget => ({ providerType: 'anthropic', providerId: 'anthropic-default', model })
const deepseek = (model?: string): ReasoningEffortTarget => ({ providerType: 'deepseek', providerId: 'deepseek-default', model })
const custom = (model?: string): ReasoningEffortTarget => ({ providerType: 'custom', providerId: 'my-gateway', model })
const cli = (route: keyof typeof REASONING_CLI_ROUTES, model?: string): ReasoningEffortTarget => ({
  providerType: 'local',
  providerId: REASONING_CLI_ROUTES[route].id,
  model,
})

describe('the setting', () => {
  it('offers auto first and defaults to it, so an upgraded install sends nothing new', () => {
    expect(REASONING_EFFORT_SETTINGS).toEqual(['auto', 'low', 'medium', 'high', 'max'])
    expect(DEFAULT_REASONING_EFFORT_SETTING).toBe('auto')
  })

  it('reads anything unrecognised as auto', () => {
    for (const value of ['low', 'medium', 'high', 'max', 'auto'])
      expect(normalizeReasoningEffortSetting(value)).toBe(value)
    for (const value of [undefined, null, '', 'off', 'xhigh', 'HIGH', 3, {}])
      expect(normalizeReasoningEffortSetting(value)).toBe('auto')
  })

  it('turns auto and junk into no request at all', () => {
    expect(normalizeReasoningEffort('high')).toBe('high')
    expect(normalizeReasoningEffort('max')).toBe('max')
    // `xhigh` is a wire spelling, never something a caller asks for.
    for (const value of ['auto', 'xhigh', 'minimal', 'off', undefined, 1])
      expect(normalizeReasoningEffort(value)).toBeUndefined()
  })
})

describe('the support table', () => {
  it('knows which OpenAI ids reason, and how far', () => {
    expect(resolveReasoningEffortSupport(openai('gpt-4o'))).toEqual({ wire: null, levels: [], unsupported: 'model' })
    expect(resolveReasoningEffortSupport(openai('gpt-4.1-mini')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(openai('gpt-5-pro')).levels).toEqual(['high'])
    expect(resolveReasoningEffortSupport(openai('gpt-5-mini')).levels).toEqual(['minimal', 'low', 'medium', 'high'])
    expect(resolveReasoningEffortSupport(openai('gpt-5.5')).levels).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(resolveReasoningEffortSupport(openai('gpt-5.6-terra')).levels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(resolveReasoningEffortSupport(openai('gpt-6-astra')).levels.at(-1)).toBe('max')
    expect(resolveReasoningEffortSupport(openai('o3-mini-2025-01-31'))).toEqual({
      wire: 'openai-reasoning-effort',
      levels: ['low', 'medium', 'high'],
    })
    // Narrower prefixes are matched first: these would otherwise inherit their line's range.
    expect(resolveReasoningEffortSupport(openai('gpt-5-chat-latest')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(openai('gpt-5.2-chat-latest')).levels).toEqual(['medium', 'xhigh'])
    expect(resolveReasoningEffortSupport(openai('o1-mini')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(openai('O3')).wire).toBe('openai-reasoning-effort')
  })

  it('sends nothing when the model is unknown or absent', () => {
    expect(resolveReasoningEffortSupport(openai(undefined)).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(openai('  ')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(anthropic('claude-3-5-sonnet-20241022')).unsupported).toBe('model')
  })

  it('splits Anthropic by how thinking is switched on', () => {
    expect(resolveReasoningEffortSupport(anthropic('claude-sonnet-4-5-20250929'))).toEqual({
      wire: 'anthropic-budget',
      levels: ['low', 'medium', 'high'],
    })
    expect(resolveReasoningEffortSupport(anthropic('claude-opus-4-6'))).toEqual({
      wire: 'anthropic-adaptive',
      levels: ['low', 'medium', 'high', 'max'],
    })
    expect(resolveReasoningEffortSupport(anthropic('claude-opus-5'))).toEqual({
      wire: 'anthropic-adaptive',
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    })
    expect(resolveReasoningEffortSupport(anthropic('claude-fable-5-1')).wire).toBe('anthropic-adaptive')
  })

  it('takes DeepSeek V4 and refuses the ids whose model is the level', () => {
    expect(resolveReasoningEffortSupport(deepseek('deepseek-v4-pro'))).toEqual({
      wire: 'deepseek-thinking',
      levels: ['high', 'max'],
    })
    expect(resolveReasoningEffortSupport(deepseek('deepseek-v4-flash')).levels).toEqual(['low', 'high', 'max'])
    expect(resolveReasoningEffortSupport(deepseek('deepseek-chat')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(deepseek('deepseek-reasoner')).unsupported).toBe('model')
  })

  it('treats a custom endpoint by the id as written', () => {
    expect(resolveReasoningEffortSupport(custom('gpt-5.5')).wire).toBe('openai-reasoning-effort')
    expect(resolveReasoningEffortSupport(custom('deepseek-v4-flash')).wire).toBe('deepseek-thinking')
    // A gateway's channel prefix is not stripped: whether it forwards the field is unknowable here.
    expect(resolveReasoningEffortSupport(custom('openai/gpt-5.5')).unsupported).toBe('model')
  })

  it('refuses the providers this code cannot vouch for', () => {
    for (const providerType of ['siliconflow', 'local', 'something-new']) {
      expect(resolveReasoningEffortSupport({ providerType, providerId: 'x', model: 'gpt-5.5' })).toEqual({
        wire: null,
        levels: [],
        unsupported: 'provider',
      })
    }
  })

  it('routes the local CLIs by id or origin, never by type', () => {
    expect(resolveReasoningEffortSupport(cli('pi', 'openai/gpt-4o')).wire).toBe('cli-thinking')
    expect(resolveReasoningEffortSupport(cli('omp')).wire).toBe('cli-thinking')
    expect(resolveReasoningEffortSupport({ providerType: 'local', origin: 'omp-cli' }).wire).toBe('cli-thinking')
    expect(resolveReasoningEffortSupport(cli('codex', 'gpt-5.6-sol')).wire).toBe('codex-config')
    expect(resolveReasoningEffortSupport(cli('codex', 'gpt-4o')).unsupported).toBe('model')
    expect(resolveReasoningEffortSupport(cli('claude', 'opus')).levels).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(resolveReasoningEffortSupport(cli('claude', 'haiku')).levels).toEqual(['low', 'medium', 'high'])
    // A local model that is not one of the four CLIs is Ollama: no effort.
    expect(resolveReasoningEffortSupport({ providerType: 'local', providerId: 'local-default', model: 'qwen3:8b' }).unsupported).toBe('provider')
  })

  it('forwards to Tuff Nexus by id or origin', () => {
    expect(resolveReasoningEffortSupport({ providerType: 'custom', providerId: TUFF_NEXUS_PROVIDER_ID, model: 'gpt-4o-mini' }).wire).toBe('nexus')
    expect(resolveReasoningEffortSupport({ providerType: 'custom', origin: 'tuff-nexus' }).wire).toBe('nexus')
  })
})

describe('planReasoningEffort', () => {
  it('sends the level asked for when the model has it', () => {
    expect(planReasoningEffort('high', openai('gpt-5.5'))).toEqual({
      wire: 'openai-reasoning-effort',
      decision: { requested: 'high', applied: 'high', status: 'applied' },
    })
  })

  it('reads max as the strongest level the model has', () => {
    expect(planReasoningEffort('max', openai('gpt-5.5')).decision).toEqual({ requested: 'max', applied: 'xhigh', status: 'applied' })
    expect(planReasoningEffort('max', openai('gpt-5.6-luna')).decision.applied).toBe('max')
    expect(planReasoningEffort('max', openai('o3')).decision.applied).toBe('high')
    expect(planReasoningEffort('max', anthropic('claude-haiku-4-5')).decision.applied).toBe('high')
  })

  it('rounds a missing level up first, then down', () => {
    expect(planReasoningEffort('low', deepseek('deepseek-v4-pro')).decision).toEqual({ requested: 'low', applied: 'high', status: 'clamped' })
    expect(planReasoningEffort('medium', deepseek('deepseek-v4-flash')).decision).toEqual({ requested: 'medium', applied: 'high', status: 'clamped' })
    expect(planReasoningEffort('high', openai('gpt-5.2-chat-latest')).decision).toEqual({ requested: 'high', applied: 'xhigh', status: 'clamped' })
    expect(planReasoningEffort('low', openai('gpt-5-pro')).decision).toEqual({ requested: 'low', applied: 'high', status: 'clamped' })
  })

  it('says why nothing is sent', () => {
    expect(planReasoningEffort('high', openai('gpt-4o'))).toEqual({
      wire: null,
      decision: { requested: 'high', applied: null, status: 'unsupported-model' },
    })
    expect(planReasoningEffort('high', { providerType: 'siliconflow', model: 'deepseek-ai/DeepSeek-R1' })).toEqual({
      wire: null,
      decision: { requested: 'high', applied: null, status: 'unsupported-provider' },
    })
  })

  it('leaves Nexus to decide, and says so', () => {
    expect(planReasoningEffort('low', { providerType: 'custom', providerId: TUFF_NEXUS_PROVIDER_ID })).toEqual({
      wire: 'nexus',
      decision: { requested: 'low', applied: null, status: 'forwarded' },
    })
  })

  it('hands pi and omp the level itself; they clamp against their own catalogue', () => {
    expect(planReasoningEffort('max', cli('pi', 'anthropic/claude-sonnet-4-5')).decision).toEqual({
      requested: 'max',
      applied: 'max',
      status: 'applied',
    })
    expect(planReasoningEffort('medium', cli('omp')).decision.applied).toBe('medium')
  })
})

describe('normalizeReasoningEffortDecision', () => {
  it('accepts a decision whose halves agree', () => {
    const decision = { requested: 'high', applied: 'xhigh', status: 'clamped' }
    expect(normalizeReasoningEffortDecision(decision)).toEqual(decision)
    expect(normalizeReasoningEffortDecision({ requested: 'low', applied: null, status: 'unsupported-model' })).toEqual({
      requested: 'low',
      applied: null,
      status: 'unsupported-model',
    })
    // Missing `applied` is the same as `null`.
    expect(normalizeReasoningEffortDecision({ requested: 'low', status: 'forwarded' })).toEqual({
      requested: 'low',
      applied: null,
      status: 'forwarded',
    })
  })

  it('drops anything that contradicts itself or is not a decision', () => {
    for (const value of [
      null,
      'high',
      [],
      { requested: 'high', applied: 'high' },
      { requested: 'auto', applied: 'high', status: 'applied' },
      { requested: 'high', applied: 'ultra', status: 'applied' },
      // Sent, but no level; not sent, but a level.
      { requested: 'high', applied: null, status: 'applied' },
      { requested: 'high', applied: 'high', status: 'unsupported-provider' },
    ]) {
      expect(normalizeReasoningEffortDecision(value)).toBeUndefined()
    }
  })
})

function plan(requested: 'low' | 'medium' | 'high' | 'max', target: ReasoningEffortTarget): ReasoningEffortPlan {
  return planReasoningEffort(requested, target)
}

describe('toLangChainOpenAiReasoningFields', () => {
  it('builds nothing without a plan, or when nothing is sent', () => {
    expect(toLangChainOpenAiReasoningFields(undefined)).toBeNull()
    expect(toLangChainOpenAiReasoningFields(plan('high', openai('gpt-4o')))).toBeNull()
    // Another wire's plan is not this translator's to spell.
    expect(toLangChainOpenAiReasoningFields(plan('high', anthropic('claude-opus-4-6')))).toBeNull()
  })

  it('spells the OpenAI level and DeepSeek\'s switch', () => {
    expect(toLangChainOpenAiReasoningFields(plan('max', openai('gpt-5.5')))).toEqual({ reasoningEffort: 'xhigh' })
    expect(toLangChainOpenAiReasoningFields(plan('high', deepseek('deepseek-v4-flash')))).toEqual({
      reasoningEffort: 'high',
      modelKwargs: { thinking: { type: 'enabled' } },
    })
  })
})

describe('toLangChainAnthropicThinkingFields', () => {
  const streaming = { answerTokens: 1024, streaming: true }

  it('builds nothing without a plan, or when nothing is sent', () => {
    expect(toLangChainAnthropicThinkingFields(undefined, streaming)).toBeNull()
    expect(toLangChainAnthropicThinkingFields(plan('high', anthropic('claude-3-5-sonnet-20241022')), streaming)).toBeNull()
    expect(toLangChainAnthropicThinkingFields(plan('high', openai('gpt-5.5')), streaming)).toBeNull()
  })

  it('gives a budget model its budget on top of the answer', () => {
    expect(toLangChainAnthropicThinkingFields(plan('low', anthropic('claude-sonnet-4-5')), streaming)).toEqual({
      temperature: 1,
      maxTokens: 1024 + 2048,
      thinking: { type: 'enabled', budget_tokens: 2048 },
    })
    expect(toLangChainAnthropicThinkingFields(plan('max', anthropic('claude-haiku-4-5')), streaming)).toEqual({
      temperature: 1,
      maxTokens: 1024 + 16384,
      thinking: { type: 'enabled', budget_tokens: 16384 },
    })
  })

  it('switches an adaptive model through invocationKwargs with room to think', () => {
    expect(toLangChainAnthropicThinkingFields(plan('max', anthropic('claude-opus-4-8')), streaming)).toEqual({
      temperature: 1,
      maxTokens: 1024 + 32768,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      invocationKwargs: { thinking: { type: 'adaptive' }, output_config: { effort: 'max' } },
    })
  })

  it('keeps a non-streaming request under the SDK\'s ten-minute ceiling', () => {
    const adaptive = toLangChainAnthropicThinkingFields(plan('max', anthropic('claude-opus-4-8')), {
      answerTokens: 1024,
      streaming: false,
    })
    expect(adaptive?.maxTokens).toBe(ANTHROPIC_NON_STREAMING_MAX_TOKENS)

    const budget = toLangChainAnthropicThinkingFields(plan('high', anthropic('claude-opus-4-5')), {
      answerTokens: 8000,
      streaming: false,
    })
    expect(budget?.maxTokens).toBe(ANTHROPIC_NON_STREAMING_MAX_TOKENS)
    expect(budget?.thinking.budget_tokens).toBe(16384)
  })

  it('always leaves the budget between the API floor and the ceiling', () => {
    for (const answerTokens of [0, 1, 10, 1024, 60000]) {
      for (const isStreaming of [true, false]) {
        const fields = toLangChainAnthropicThinkingFields(plan('low', anthropic('claude-opus-4-5')), {
          answerTokens,
          streaming: isStreaming,
        })!
        expect(fields.thinking.budget_tokens).toBeGreaterThanOrEqual(1024)
        expect(fields.thinking.budget_tokens).toBeLessThan(fields.maxTokens)
      }
    }
  })
})
