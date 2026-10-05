import type { VoiceCaptureUnavailableCode } from '@talex-touch/utils/transport/sdk/domains/voice'
import { VOICE_CAPTURE_UNAVAILABLE_CODES } from '@talex-touch/utils/transport/sdk/domains/voice'
import { describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

const { captureNoticeKind, classifyDictationFailure, notReadyNotice, showDictationNotice } =
  await import('./dictation-notice')
const { formatUsageLimitResetTime } = await import('~/modules/intelligence/ai-error-recovery')

/** `assertSupported` rethrows the component's failure with this code and this sentence. */
const CAPTURE_REASON = (reason: string): Error =>
  Object.assign(new Error(`Voice capture is unavailable: ${reason}`), {
    code: 'VOICE_ASR_CAPTURE_UNAVAILABLE'
  })

/**
 * The production failure the capture classification exists for: the packaged build whose native
 * audio addon is absent. This is the message the addon's loader throws, require stack and all.
 * Its wording is a sentence ("Cannot find module ..."), so no text heuristic can catch it without
 * also catching a provider that merely mentions a missing file — the code is what makes it a
 * class, and the addon name is what splits it from a capture the OS or the user can fix.
 */
const NATIVE_ADDON_MISSING = Object.assign(
  new Error(
    "Voice capture is unavailable: Cannot find module '/Applications/Tuff.app/Contents/Resources/app.asar/node_modules/@talex-touch/tuff-native/build/Release/tuff_native_audio.node'\nRequire stack:\n- /Applications/Tuff.app/Contents/Resources/app.asar/node_modules/@talex-touch/tuff-native/native-loader.js"
  ),
  { code: 'VOICE_ASR_CAPTURE_UNAVAILABLE' }
)

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
    expect(classifyDictationFailure(error)?.kind).toBe(kind)
  })

  it('says nothing for a cancellation', () => {
    expect(classifyDictationFailure(new Error('VOICE_OPERATION_CANCELLED'))).toBeNull()
  })

  it('reads the missing native addon as a build problem, not an unclassified failure', () => {
    // The regression: this used to land in `failed`, whose toast says only that transcription
    // failed — hiding the one actionable fact, that this install has no audio component at all.
    // `toEqual` on the whole notice, not just the kind: nothing of the require stack may ride
    // into the toast as a description.
    expect(classifyDictationFailure(NATIVE_ADDON_MISSING)).toEqual({
      kind: 'capture-component-missing'
    })
  })

  it.each([
    // The addon is there but the machine has no input: the user's hardware, not our install.
    ['no-input-device', 'microphone-missing', 'Voice capture is unavailable: no-input-device'],
    // A reason we do not know yet: the component's own words are the whole description.
    ['disabled-by-env', 'capture-unavailable', 'Voice capture is unavailable: disabled-by-env'],
    // The OS has no capture backend: a fact about the platform, and its own headline.
    ['platform-not-supported', 'capture-platform-unsupported', undefined]
  ] as const)('splits a %s capture reason into %s', (reason, kind, detail) => {
    expect(classifyDictationFailure(CAPTURE_REASON(reason))).toEqual({
      kind,
      ...(detail ? { detail } : {})
    })
  })

  it.each([
    [{ code: 'VOICE_ASR_CAPTURE_DRAIN_UNAVAILABLE' }, 'capture-component-missing'],
    [{ code: 'VOICE_ASR_NOT_CONFIGURED' }, 'recognition-not-configured']
  ])('%o → %s, with nothing to describe', (error, kind) => {
    expect(classifyDictationFailure(error)).toEqual({ kind })
  })

  it('lets the exact code outrank a message the text heuristics would claim', () => {
    // Both a denial and a congestion are in the sentence; the code is the only exact signal, and
    // reading it as a permission problem would send the user to a pane that cannot fix this.
    expect(
      classifyDictationFailure(
        Object.assign(new Error('permission denied; upstream returned 429'), {
          code: 'VOICE_ASR_CAPTURE_UNAVAILABLE'
        })
      )
    ).toEqual({ kind: 'capture-unavailable', detail: 'permission denied; upstream returned 429' })
  })

  it('describes a failing capture with its first line alone', () => {
    // Short enough that the cap cannot hide a leak: only the first line may survive, so a stack
    // the component appended never becomes the toast's one visible sentence.
    const notice = classifyDictationFailure(
      Object.assign(new Error('disabled-by-env\nRequire stack:\n- loader.js'), {
        code: 'VOICE_ASR_CAPTURE_UNAVAILABLE'
      })
    )
    expect(notice?.detail).toBe('disabled-by-env')
    expect(notice?.detail).not.toMatch(/\n/)
  })

  it('keeps a sentence at the limit whole and caps the one that runs past it', () => {
    const atLimit = 'x'.repeat(160)
    expect(classifyDictationFailure(new Error(atLimit))?.detail).toBe(atLimit)

    const over = classifyDictationFailure(new Error('y'.repeat(161)))
    expect(over?.detail).toBe(`${'y'.repeat(159)}…`)
    expect(over?.detail).toHaveLength(160)
  })
})

describe('notReadyNotice', () => {
  it('names an unconfigured route apart from an unavailable one', () => {
    expect(notReadyNotice('VOICE_ASR_NOT_CONFIGURED')).toBe('recognition-not-configured')
    expect(notReadyNotice('VOICE_ASR_PACK_EXPIRED')).toBe('recognition-unavailable')
    expect(notReadyNotice(undefined)).toBe('recognition-unavailable')
  })
})

describe('captureNoticeKind', () => {
  it.each([
    // The addon is absent: the one class the UI acts on structurally, by withholding the entry.
    [VOICE_CAPTURE_UNAVAILABLE_CODES.componentMissing, 'capture-component-missing'],
    // Present, but without the export the buffered route needs — the same install, one code over.
    [VOICE_CAPTURE_UNAVAILABLE_CODES.drainUnavailable, 'capture-component-missing'],
    // A capture the machine's own hardware explains: the pane that can fix it is offered.
    [VOICE_CAPTURE_UNAVAILABLE_CODES.deviceUnavailable, 'microphone-missing'],
    [VOICE_CAPTURE_UNAVAILABLE_CODES.platformUnsupported, 'capture-platform-unsupported'],
    // Switched off on purpose, and the catch-all code: one notice here — this build cannot
    // capture — with the distinction left to the sentence in the log.
    [VOICE_CAPTURE_UNAVAILABLE_CODES.disabled, 'capture-unavailable'],
    [VOICE_CAPTURE_UNAVAILABLE_CODES.unavailable, 'capture-unavailable'],
    // A code from a host newer than this renderer, and a host that sent no code at all.
    ['VOICE_ASR_CAPTURE_SOMETHING_ELSE' as VoiceCaptureUnavailableCode, 'capture-unavailable'],
    [undefined, 'capture-unavailable']
  ] as const)('%s → %s', (reason, kind) => {
    expect(captureNoticeKind(reason)).toBe(kind)
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

  it.each([
    ['capture-component-missing', 'assistant.voicePanel.voiceCaptureComponentMissing'],
    ['capture-platform-unsupported', 'assistant.voicePanel.voiceCapturePlatformUnsupported'],
    ['capture-unavailable', 'assistant.voicePanel.voiceCaptureUnavailable']
  ] as const)('shows %s as its own error with nothing to open', (kind, key) => {
    // Each capture kind is a different fact — this install, this OS, or an unnamed reason — and
    // none of them is fixed by a settings pane, so the toast is an error with no action.
    showDictationNotice(kind, { t, openRecognitionSettings: vi.fn() })
    expect(toast.error).toHaveBeenLastCalledWith(key, undefined)
  })

  it('puts the failure’s own words under the headline without dropping the action', () => {
    const openRecognitionSettings = vi.fn()
    showDictationNotice(
      'recognition-not-configured',
      { t, openRecognitionSettings },
      'the route is gone'
    )
    const [message, options] = toast.warning.mock.calls.at(-1)!
    expect(message).toBe('assistant.voicePanel.voiceRecognitionNotConfigured')
    expect(options.description).toBe('the route is gone')
    options.action.onClick()
    expect(openRecognitionSettings).toHaveBeenCalledOnce()
  })
})

describe('the global usage limit the user set in Audit', () => {
  const resetsAtIso = '2026-10-03T16:00:00.000Z'
  const refusal = Object.assign(
    new Error(
      `[USAGE_LIMIT_REACHED] Usage limit reached: requestsPerDay; resets at ${resetsAtIso}`
    ),
    { code: 'USAGE_LIMIT_REACHED' }
  )
  /** Echoes interpolation so the reset time shows in the headline. */
  const tNamed = (key: string, params?: Record<string, unknown>): string =>
    params ? `${key} ${JSON.stringify(params)}` : key

  it('is its own kind, ahead of the quota rule, carrying only the reset time', () => {
    expect(classifyDictationFailure(refusal)).toEqual({ kind: 'usage-limit', detail: resetsAtIso })
    // Only the code (beside quota wording): still the usage limit, nothing to carry.
    expect(
      classifyDictationFailure(
        Object.assign(new Error('quota exceeded'), { code: 'USAGE_LIMIT_REACHED' })
      )
    ).toEqual({ kind: 'usage-limit' })
    // The quota rule is untouched for everything else.
    expect(classifyDictationFailure(new Error('QUOTA_EXHAUSTED'))?.kind).toBe('quota')
  })

  it('names the local reset time and opens Audit when the page can', () => {
    const openUsageLimits = vi.fn()
    showDictationNotice(
      'usage-limit',
      { t: tNamed, openRecognitionSettings: vi.fn(), openUsageLimits },
      resetsAtIso
    )
    const [message, options] = toast.warning.mock.calls.at(-1)!
    expect(message).toBe(
      `assistant.voicePanel.usageLimitReached ${JSON.stringify({
        time: formatUsageLimitResetTime(Date.parse(resetsAtIso))
      })}`
    )
    // The ISO instant is folded into the headline, never shown as a raw description.
    expect(options.description).toBeUndefined()
    expect(options.action.label).toBe('assistant.voicePanel.openUsageLimits')
    options.action.onClick()
    expect(openUsageLimits).toHaveBeenCalledOnce()
  })

  it('falls back to the copy without a time, and no button where Audit cannot be opened', () => {
    showDictationNotice('usage-limit', { t: tNamed, openRecognitionSettings: vi.fn() })
    expect(toast.warning).toHaveBeenLastCalledWith(
      'assistant.voicePanel.usageLimitReachedNoTime',
      undefined
    )
  })
})
