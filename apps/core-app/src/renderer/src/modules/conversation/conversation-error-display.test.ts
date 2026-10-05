import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import { resolveIntelligenceErrorRecovery } from '../intelligence/ai-error-recovery'
import {
  CONVERSATION_ERROR_USAGE_LIMIT_REACHED,
  resolveConversationError
} from './conversation-error-display'

const resetsAt = Date.parse('2026-10-03T16:00:00.000Z')
const sentence = 'Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z'

describe('resolveConversationError', () => {
  it('reads the usage limit and its reset time from main’s invoke prefix', () => {
    expect(
      resolveConversationError(new Error(`[USAGE_LIMIT_REACHED:text.chat] ${sentence}`))
    ).toEqual({ code: CONVERSATION_ERROR_USAGE_LIMIT_REACHED, detail: sentence, resetsAt })
  })

  it('reads it from a failed stream’s prefix, and from the bare code', () => {
    expect(resolveConversationError(new Error(`[USAGE_LIMIT_REACHED] ${sentence}`))).toEqual({
      code: 'USAGE_LIMIT_REACHED',
      detail: sentence,
      resetsAt
    })
    // A failed stream with nothing more to say carries the code alone.
    expect(resolveConversationError(new Error('USAGE_LIMIT_REACHED'))).toEqual({
      code: 'USAGE_LIMIT_REACHED',
      detail: ''
    })
  })

  it('leaves every other failure as it was', () => {
    expect(
      resolveConversationError(new Error('[PROVIDER_UNAVAILABLE:text.chat] No enabled providers'))
    ).toEqual({ code: 'PROVIDER_UNAVAILABLE', detail: 'No enabled providers' })
    expect(resolveConversationError(new Error('PROVIDER_UNAVAILABLE'))).toEqual({
      code: 'UNKNOWN',
      detail: 'PROVIDER_UNAVAILABLE'
    })
  })

  it('hands the Home page the local usage-limit copy, not the Nexus credits one', () => {
    const t = ((key: string, second?: unknown) =>
      typeof second === 'string' ? second : key) as ComposerTranslation
    const error = resolveConversationError(new Error(`[USAGE_LIMIT_REACHED:text.chat] ${sentence}`))

    expect(
      resolveIntelligenceErrorRecovery({ errorCode: error.code, error: error.detail }, t)
    ).toMatchObject({
      code: 'usage-limit',
      title: 'AI usage limit reached',
      action: { path: '/setting/intelligence/audit' }
    })
  })
})
