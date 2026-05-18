import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import {
  resolveIntelligenceMetaChips,
  resolveIntelligenceStatusHint,
  resolveIntelligenceStatusTone,
  type IntelligencePayload
} from './core-intelligence-answer'

const t = ((key: string, fallback?: string) => fallback || key) as ComposerTranslation

function payload(overrides: Partial<IntelligencePayload>): IntelligencePayload {
  return {
    requestId: 'req-1',
    prompt: 'Summarize this',
    status: 'ready',
    answer: 'Summary',
    createdAt: 1,
    ...overrides
  }
}

describe('core-intelligence-answer', () => {
  it('summarizes provider, latency, trace and input kinds for AI preview cards', () => {
    expect(
      resolveIntelligenceMetaChips(
        payload({
          provider: ' openai ',
          model: ' gpt-4.1 ',
          latency: 1234,
          traceId: ' trace-1 ',
          inputKinds: ['text', 'image', 'text', '']
        }),
        t
      )
    ).toEqual([
      { label: 'Provider', value: 'openai / gpt-4.1' },
      { label: 'Latency', value: '1.2s' },
      { label: 'Trace', value: 'trace-1' },
      { label: 'Input', value: 'text + image' }
    ])
  })

  it('ignores empty metadata and invalid latency values', () => {
    expect(
      resolveIntelligenceMetaChips(
        payload({
          provider: ' ',
          model: '',
          latency: -1,
          traceId: '',
          inputKinds: ['']
        }),
        t
      )
    ).toEqual([])
  })

  it('maps AI preview status to command-center tones and recovery hints', () => {
    expect(resolveIntelligenceStatusTone('pending')).toBe('working')
    expect(resolveIntelligenceStatusTone('ready')).toBe('success')
    expect(resolveIntelligenceStatusTone('error')).toBe('danger')

    expect(resolveIntelligenceStatusHint(payload({ status: 'pending' }), t)).toEqual({
      tone: 'working',
      label: 'Preparing AI response...',
      detail: 'Keeping CoreBox open while the provider responds.'
    })

    expect(resolveIntelligenceStatusHint(payload({ status: 'ready' }), t)).toEqual({
      tone: 'success',
      label: 'AI response ready',
      detail: 'Review the answer, metadata, and trace before copying it.'
    })

    expect(resolveIntelligenceStatusHint(payload({ status: 'error' }), t)).toEqual({
      tone: 'danger',
      label: 'Failed to retrieve AI response',
      detail: 'Use the recovery reason below before retrying this request.'
    })
  })
})
