import type {
  IntelligenceProviderConfig,
  IntelligenceReasoningEffortDecision
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { REASONING_CLI_ROUTES } from '@talex-touch/utils/intelligence/reasoning-effort'
import { describe, expect, it } from 'vitest'
import { sanitizeIntelligenceAuditMetadata } from './intelligence-audit-logger'
import {
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_ORIGIN,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROVIDER_ID,
  PI_CLI_ORIGIN,
  PI_CLI_PROVIDER_ID
} from './providers/pi-cli-runtime'
import {
  planProviderReasoning,
  readReasoningPlan,
  reasoningAuditMetadata,
  sanitizeReasoningRequest,
  settleReasoningDecision,
  withReasoningDecision,
  withReasoningPlan
} from './reasoning-effort-runtime'

function provider(overrides: Partial<IntelligenceProviderConfig>): IntelligenceProviderConfig {
  return {
    id: 'openai-default',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI',
    enabled: true,
    ...overrides
  }
}

describe('the shared table names the CLIs the way main registers them', () => {
  // The renderer can only tell the four local CLIs apart by these; if main renamed one, the menu
  // would plan an effort for a row main no longer sends it to.
  it('matches every id and origin in pi-cli-runtime', () => {
    expect(REASONING_CLI_ROUTES).toEqual({
      pi: { id: PI_CLI_PROVIDER_ID, origin: PI_CLI_ORIGIN },
      omp: { id: OMP_CLI_PROVIDER_ID, origin: OMP_CLI_ORIGIN },
      codex: { id: CODEX_CLI_PROVIDER_ID, origin: CODEX_CLI_ORIGIN },
      claude: { id: CLAUDE_CLI_PROVIDER_ID, origin: CLAUDE_CLI_ORIGIN }
    })
  })
})

describe('sanitizeReasoningRequest', () => {
  it('keeps a known level and strips a plan main never made', () => {
    const forged = {
      reasoningEffort: 'high' as const,
      reasoningPlan: { wire: 'openai-reasoning-effort', decision: {} },
      metadata: { caller: 'plugin:x' }
    }
    expect(sanitizeReasoningRequest(forged)).toEqual({
      reasoningEffort: 'high',
      metadata: { caller: 'plugin:x' }
    })
  })

  it('drops an unknown level instead of forwarding it', () => {
    const options = { reasoningEffort: 'ultra' } as unknown as Parameters<
      typeof sanitizeReasoningRequest
    >[0]
    expect(sanitizeReasoningRequest(options)).toEqual({})
    expect(sanitizeReasoningRequest({ timeout: 5 })).toEqual({ timeout: 5 })
  })
})

describe('planProviderReasoning', () => {
  it('plans nothing when nothing was asked for', () => {
    expect(planProviderReasoning({}, provider({}), 'gpt-5.5')).toBeUndefined()
  })

  it('plans against the provider the attempt runs on, origin included', () => {
    expect(planProviderReasoning({ reasoningEffort: 'high' }, provider({}), 'gpt-5.5')).toEqual({
      wire: 'openai-reasoning-effort',
      decision: { requested: 'high', applied: 'high', status: 'applied' }
    })
    // A CLI provider registered under another id is still found by its origin.
    const renamedCodex = provider({
      id: 'codex-copy',
      type: IntelligenceProviderType.LOCAL,
      metadata: { origin: CODEX_CLI_ORIGIN }
    })
    expect(planProviderReasoning({ reasoningEffort: 'max' }, renamedCodex, 'gpt-5.6-sol')).toEqual({
      wire: 'codex-config',
      decision: { requested: 'max', applied: 'max', status: 'applied' }
    })
  })
})

describe('withReasoningPlan / readReasoningPlan', () => {
  it('attaches a copy and leaves the options alone without a plan', () => {
    const options = { timeout: 1 }
    expect(withReasoningPlan(options, undefined)).toBe(options)

    const plan = planProviderReasoning({ reasoningEffort: 'low' }, provider({}), 'o3')
    const planned = withReasoningPlan(options, plan)
    expect(planned).not.toBe(options)
    expect(readReasoningPlan(planned)).toBe(plan)
    expect(readReasoningPlan(options)).toBeUndefined()
  })
})

describe('settleReasoningDecision', () => {
  const reported: IntelligenceReasoningEffortDecision = {
    requested: 'high',
    applied: 'high',
    status: 'applied'
  }

  it('lets a routed backend replace only a forwarded decision', () => {
    const nexusPlan = planProviderReasoning(
      { reasoningEffort: 'high' },
      provider({ id: 'tuff-nexus-default', type: IntelligenceProviderType.CUSTOM }),
      'gpt-4o-mini'
    )
    expect(settleReasoningDecision(nexusPlan, undefined)).toEqual({
      requested: 'high',
      applied: null,
      status: 'forwarded'
    })
    expect(settleReasoningDecision(nexusPlan, reported)).toBe(reported)
    // A report about another level answers some other request: the placeholder stands.
    expect(
      settleReasoningDecision(nexusPlan, { requested: 'low', applied: 'low', status: 'applied' })
    ).toEqual({ requested: 'high', applied: null, status: 'forwarded' })

    const directPlan = planProviderReasoning({ reasoningEffort: 'high' }, provider({}), 'gpt-4o')
    expect(settleReasoningDecision(directPlan, reported)).toEqual({
      requested: 'high',
      applied: null,
      status: 'unsupported-model'
    })
    expect(settleReasoningDecision(undefined, reported)).toBeUndefined()
  })

  it('stamps a result only when something was planned', () => {
    const result: { result: string; reasoningEffort?: IntelligenceReasoningEffortDecision } = {
      result: 'ok'
    }
    expect(withReasoningDecision(result, undefined)).toBe(result)
    const plan = planProviderReasoning({ reasoningEffort: 'medium' }, provider({}), 'o4-mini')
    expect(withReasoningDecision(result, plan)).toEqual({
      result: 'ok',
      reasoningEffort: { requested: 'medium', applied: 'medium', status: 'applied' }
    })
  })
})

describe('reasoning audit metadata', () => {
  it('passes the three keys through the audit whitelist', () => {
    const metadata = {
      operation: 'home-conversation',
      ...reasoningAuditMetadata({ requested: 'max', applied: 'xhigh', status: 'applied' })
    }
    expect(sanitizeIntelligenceAuditMetadata(metadata)).toEqual({
      operation: 'home-conversation',
      reasoningEffort: 'max',
      reasoningApplied: 'xhigh',
      reasoningStatus: 'applied'
    })
  })

  it('overwrites a caller-claimed level when main resolved none', () => {
    const forged = { operation: 'x', reasoningEffort: 'max', reasoningStatus: 'applied' }
    expect(
      sanitizeIntelligenceAuditMetadata({ ...forged, ...reasoningAuditMetadata(undefined) })
    ).toEqual({ operation: 'x' })
  })

  it('records a decision that sent nothing without an applied level', () => {
    expect(
      sanitizeIntelligenceAuditMetadata(
        reasoningAuditMetadata({ requested: 'high', applied: null, status: 'unsupported-provider' })
      )
    ).toEqual({ reasoningEffort: 'high', reasoningStatus: 'unsupported-provider' })
  })
})
