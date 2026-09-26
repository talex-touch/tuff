import type { ConversationTurnMeta } from './useHomeConversation'
import { describe, expect, it } from 'vitest'
import { buildTurnInfoRows } from './turn-info-rows'

/** Keys through unchanged: these tests assert which rows appear, not their wording. */
const t = (key: string): string => key

function rows(
  turn: ConversationTurnMeta | undefined,
  messageCount = 12
): ReturnType<typeof buildTurnInfoRows> {
  return buildTurnInfoRows({ turn, messageCount, t })
}

function keys(turn: ConversationTurnMeta | undefined): string[] {
  return rows(turn).map((row) => row.key)
}

function valueOf(turn: ConversationTurnMeta | undefined, key: string): string | undefined {
  return rows(turn).find((row) => row.key === key)?.value
}

describe('buildTurnInfoRows', () => {
  it('reports only the message count before the first reply', () => {
    expect(keys(undefined)).toEqual(['messages'])
    expect(valueOf(undefined, 'messages')).toBe('12')
  })

  it('omits provider and model when the turn did not report them', () => {
    expect(keys({})).toEqual(['messages'])
    // An empty string is as absent as undefined — a blank row reads as a bug.
    expect(keys({ provider: '', model: '' })).toEqual(['messages'])
  })

  it('lists provider and model in order once reported', () => {
    expect(keys({ provider: 'codex', model: 'gpt-5.6-terra' })).toEqual([
      'messages',
      'provider',
      'model'
    ])
    expect(valueOf({ provider: 'codex' }, 'provider')).toBe('codex')
  })

  it('splits the token total into prompt and completion', () => {
    expect(valueOf({ totalTokens: 30, promptTokens: 10, completionTokens: 20 }, 'tokens')).toBe(
      '30 (10 + 20)'
    )
  })

  it('defaults a missing side of the token split to zero rather than dropping the row', () => {
    expect(valueOf({ totalTokens: 30 }, 'tokens')).toBe('30 (0 + 0)')
  })

  it('hides the token row when the stream reported no usage', () => {
    expect(keys({ totalTokens: 0 })).toEqual(['messages'])
    expect(keys({ promptTokens: 10, completionTokens: 20 })).toEqual(['messages'])
  })

  it('renders latency in seconds to one decimal', () => {
    expect(valueOf({ latencyMs: 22200 }, 'latency')).toBe('22.2s')
  })

  it('keeps a zero-latency row: zero is a measurement, not an absence', () => {
    expect(valueOf({ latencyMs: 0 }, 'latency')).toBe('0.0s')
  })

  it('shows compactions only when the provider actually compacted', () => {
    expect(keys({ compactions: 0 })).toEqual(['messages'])
    expect(valueOf({ compactions: 2 }, 'compactions')).toBe('×2')
  })

  it('orders a fully populated turn the way the panel read it', () => {
    expect(
      keys({
        provider: 'codex',
        model: 'gpt-5.6-terra',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        latencyMs: 22200,
        compactions: 1
      })
    ).toEqual(['messages', 'provider', 'model', 'tokens', 'latency', 'compactions'])
  })
})

describe('buildTurnInfoRows reasoning', () => {
  /** Renders keys with their parameters, so the branch taken is visible in the value. */
  const tWithParams = (key: string, params?: Record<string, unknown>): string =>
    params ? `${key}(${Object.values(params).join(',')})` : key

  function reasoningOf(turn: ConversationTurnMeta): string | undefined {
    return buildTurnInfoRows({ turn, messageCount: 2, t: tWithParams }).find(
      (row) => row.key === 'reasoning'
    )?.value
  }

  it('has no row on auto, where nothing was asked for', () => {
    expect(keys({ provider: 'openai', model: 'gpt-5.5' })).not.toContain('reasoning')
  })

  it('sits after the model, labelled as the effort', () => {
    const turn: ConversationTurnMeta = {
      provider: 'openai',
      model: 'gpt-5.5',
      reasoningRequested: 'high',
      reasoningApplied: 'high',
      reasoningStatus: 'applied',
      latencyMs: 1000
    }
    expect(keys(turn)).toEqual(['messages', 'provider', 'model', 'reasoning', 'latency'])
    expect(rows(turn).find((row) => row.key === 'reasoning')?.label).toBe('home.reasoning.label')
  })

  it('names what was asked for and what ran', () => {
    expect(
      reasoningOf({
        reasoningRequested: 'high',
        reasoningApplied: 'high',
        reasoningStatus: 'applied'
      })
    ).toBe('home.reasoning.level.high')
    expect(
      reasoningOf({
        reasoningRequested: 'max',
        reasoningApplied: 'xhigh',
        reasoningStatus: 'applied'
      })
    ).toBe('home.reasoning.turnTop(home.reasoning.level.max,home.reasoning.level.xhigh)')
    expect(
      reasoningOf({
        reasoningRequested: 'low',
        reasoningApplied: 'high',
        reasoningStatus: 'clamped'
      })
    ).toBe('home.reasoning.turnClamped(home.reasoning.level.low,home.reasoning.level.high)')
  })

  it('says plainly when nothing was applied, and why', () => {
    expect(reasoningOf({ reasoningRequested: 'high', reasoningStatus: 'unsupported-model' })).toBe(
      'home.reasoning.turnUnsupportedModel(home.reasoning.level.high)'
    )
    expect(
      reasoningOf({ reasoningRequested: 'high', reasoningStatus: 'unsupported-provider' })
    ).toBe('home.reasoning.turnUnsupportedProvider(home.reasoning.level.high)')
    expect(reasoningOf({ reasoningRequested: 'medium', reasoningStatus: 'forwarded' })).toBe(
      'home.reasoning.turnForwarded(home.reasoning.level.medium)'
    )
  })

  it('stays silent on a stored record that does not add up', () => {
    // Stored meta is read back from disk; a half-written or hand-edited record claims nothing.
    const broken = [
      { reasoningRequested: 'high', reasoningStatus: 'applied' },
      { reasoningRequested: 'turbo', reasoningApplied: 'high', reasoningStatus: 'applied' },
      { reasoningRequested: 'high', reasoningApplied: 'high', reasoningStatus: 'made-up' }
    ] as unknown as ConversationTurnMeta[]
    for (const turn of broken) expect(keys(turn)).not.toContain('reasoning')
  })
})
