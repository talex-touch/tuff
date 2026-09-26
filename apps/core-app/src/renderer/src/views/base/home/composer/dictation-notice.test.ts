import { describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

const { classifyDictationFailure, notReadyNotice, showDictationNotice } =
  await import('./dictation-notice')

describe('classifyDictationFailure', () => {
  it.each([
    [{ code: 'MIC_PERMISSION_DENIED', message: 'x' }, 'microphone-denied'],
    [new Error('Microphone NOT_AUTHORIZED by the OS'), 'microphone-denied'],
    [new Error('NO_INPUT_DEVICE available'), 'microphone-missing'],
    [{ code: 'VOICE_ASR_NOT_CONFIGURED' }, 'recognition-not-configured'],
    [{ code: 'VOICE_ASR_CREDENTIAL_UNAVAILABLE' }, 'recognition-unavailable'],
    [new Error('INSUFFICIENT_BALANCE'), 'quota'],
    [new Error('upstream returned 429'), 'busy'],
    [new Error('socket hang up'), 'failed']
  ])('%o → %s', (error, kind) => {
    expect(classifyDictationFailure(error)).toBe(kind)
  })

  it('says nothing for a cancellation', () => {
    expect(classifyDictationFailure(new Error('VOICE_OPERATION_CANCELLED'))).toBeNull()
  })
})

describe('notReadyNotice', () => {
  it('names an unconfigured route apart from an unavailable one', () => {
    expect(notReadyNotice('VOICE_ASR_NOT_CONFIGURED')).toBe('recognition-not-configured')
    expect(notReadyNotice('VOICE_ASR_PACK_EXPIRED')).toBe('recognition-unavailable')
    expect(notReadyNotice(undefined)).toBe('recognition-unavailable')
  })
})

describe('showDictationNotice', () => {
  const t = (key: string): string => key

  it('offers the recognition settings for a recognition problem', () => {
    const openRecognitionSettings = vi.fn()
    showDictationNotice('recognition-not-configured', { t, openRecognitionSettings })
    const [message, options] = toast.warning.mock.calls.at(-1)!
    expect(message).toBe('assistant.voicePanel.voiceRecognitionNotConfigured')
    options.action.onClick()
    expect(openRecognitionSettings).toHaveBeenCalledOnce()
  })

  it('offers the microphone pane only where the platform has one', () => {
    const openMicrophoneSettings = vi.fn()
    showDictationNotice('microphone-denied', {
      t,
      openRecognitionSettings: vi.fn(),
      openMicrophoneSettings
    })
    expect(toast.warning.mock.calls.at(-1)![1].action.label).toBe(
      'assistant.voicePanel.openMicrophoneSettings'
    )

    showDictationNotice('microphone-denied', { t, openRecognitionSettings: vi.fn() })
    expect(toast.warning.mock.calls.at(-1)![1]).toBeUndefined()
  })

  it('shows an unclassified failure as an error without an action', () => {
    showDictationNotice('failed', { t, openRecognitionSettings: vi.fn() })
    expect(toast.error).toHaveBeenLastCalledWith(
      'assistant.voicePanel.voiceTranscribeFailed',
      undefined
    )
  })
})
