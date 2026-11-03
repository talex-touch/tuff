import { describe, expect, it } from 'vitest'
import {
  rollNextThinkingVerb,
  rollThinkingVerb,
  THINKING_VERBS
} from '../utils/thinking-words'

describe('thinking-words', () => {
  it('contains at least 50 thinking verbs in english including core verbs', () => {
    expect(THINKING_VERBS.en.length).toBeGreaterThanOrEqual(50)
    expect(THINKING_VERBS.en).toContain('Thinking')
    expect(THINKING_VERBS.en).toContain('Capsuling')
    expect(THINKING_VERBS.en).toContain('Resolving')
    expect(THINKING_VERBS.en).toContain('Reasoning')
    expect(THINKING_VERBS.en).toContain('Synthesizing')
  })

  it('contains at least 50 thinking verbs in chinese', () => {
    expect(THINKING_VERBS.zh.length).toBeGreaterThanOrEqual(50)
    expect(THINKING_VERBS.zh).toContain('思考')
    expect(THINKING_VERBS.zh).toContain('解析')
    expect(THINKING_VERBS.zh).toContain('胶囊化')
  })

  it('rolls non-empty verbs', () => {
    const verbEn = rollThinkingVerb('en')
    expect(verbEn).toBeTruthy()
    expect(THINKING_VERBS.en).toContain(verbEn)

    const verbZh = rollThinkingVerb('zh')
    expect(verbZh).toBeTruthy()
    expect(THINKING_VERBS.zh).toContain(verbZh)
  })

  it('rolls consecutive distinct verbs for morphing ticker', () => {
    let current = 'Thinking'
    for (let i = 0; i < 20; i++) {
      const next = rollNextThinkingVerb(current, 'en')
      expect(next).toBeTruthy()
      expect(next).not.toBe(current)
      current = next
    }
  })
})
