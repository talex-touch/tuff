import type { VoiceCaptureUnavailableCode } from '@talex-touch/utils/transport/sdk/domains/voice'
import {
  isVoiceCaptureUnavailableCode,
  VOICE_CAPTURE_UNAVAILABLE_CODES
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { toast } from 'vue-sonner'

/**
 * What the composer's dictation has to tell the user, and how. The session reports a kind; the page
 * turns it into a toast with the one action that fixes it. No retry and no undo: main's recovery
 * slot is global and does not know sessions, so it may hold the Fn HUD's recording instead.
 */
export type DictationNoticeKind =
  | 'recognition-not-configured'
  | 'recognition-unavailable'
  | 'capture-component-missing'
  | 'capture-platform-unsupported'
  | 'capture-unavailable'
  | 'microphone-denied'
  | 'microphone-missing'
  | 'microphone-unresponsive'
  | 'quota'
  | 'busy'
  | 'failed'
  | 'empty'

/** `getRecognitionStatus().asr.reason` when the route is not ready — before any capture starts. */
export function notReadyNotice(reason: string | undefined): DictationNoticeKind {
  return reason === 'VOICE_ASR_NOT_CONFIGURED'
    ? 'recognition-not-configured'
    : 'recognition-unavailable'
}

/**
 * What a build that cannot capture audio should say.
 *
 * The three codes that are about the machine's hardware map onto the classes that already exist
 * and already know their own remedies (the Settings pane for a device, nothing for a platform
 * with no backend). The rest — the component absent, the route missing the export it needs, a
 * reason this build does not know — are one class: something about this install. `disabled` is
 * folded into it on purpose; a user who set `TUFF_DISABLE_NATIVE_AUDIO` still needs to read that
 * capture is off, and the sentence says which build lost it.
 *
 * `capture-component-missing` is also the code the UI withholds the microphone entry for: it is
 * the only one where no user action in this app can succeed, so offering the button would be
 * offering a failure with extra steps.
 */
export function captureNoticeKind(
  reason: VoiceCaptureUnavailableCode | undefined
): DictationNoticeKind {
  switch (reason) {
    case VOICE_CAPTURE_UNAVAILABLE_CODES.deviceUnavailable:
      return 'microphone-missing'
    case VOICE_CAPTURE_UNAVAILABLE_CODES.platformUnsupported:
      return 'capture-platform-unsupported'
    case VOICE_CAPTURE_UNAVAILABLE_CODES.componentMissing:
    case VOICE_CAPTURE_UNAVAILABLE_CODES.drainUnavailable:
      return 'capture-component-missing'
    default:
      return 'capture-unavailable'
  }
}

const DEVICE_MISSING =
  /CANNOT_?FIND|NO_?(INPUT_?)?DEVICE|DEVICE_?NOT_?FOUND|NO_?MICROPHONE|CAPTURE_?UNAVAILABLE|(?:MICROPHONE|INPUT|CAPTURE|AUDIO).{0,80}UNSUPPORTED|UNSUPPORTED.{0,80}(?:MICROPHONE|INPUT|CAPTURE|AUDIO)/
const CONGESTED =
  /RATE_?LIMIT|TOO_?MANY_?REQUESTS|OVERLOAD|HIGH_?DEMAND|BUSY|\b429\b|\b503\b|\b529\b/
/**
 * The audio component cannot capture, matched by its stable code set. A code, not a sentence —
 * the missing addon says "Cannot find module .../tuff_native_audio.node", and no wording heuristic
 * catches that without also catching a provider that merely mentions a file.
 */
const CAPTURE_UNAVAILABLE =
  /VOICE_ASR_CAPTURE_UNAVAILABLE|VOICE_ASR_CAPTURE_DRAIN_UNAVAILABLE|ERR_NATIVE_AUDIO_(?:UNAVAILABLE|DISABLED)/
/** The addon itself is the problem: it is not there, or not the build the route needs. */
const CAPTURE_COMPONENT_GONE =
  /VOICE_ASR_CAPTURE_DRAIN_UNAVAILABLE|CANNOT FIND MODULE|DLOPEN|BINDING-UNAVAILABLE|NATIVE-MODULE-NOT-LOADED|NATIVE AUDIO MODULE IS UNAVAILABLE|MISSING EXPORT/
/** The reason `assertSupported` appended: `Voice capture is unavailable: <reason>`. */
const CAPTURE_DEVICE =
  /NO-INPUT-DEVICE|INPUT-?PROBE-?FAILED|NO-?(?:INPUT_?)?DEVICE|INPUT_?DEVICE_?UNAVAILABLE/
const CAPTURE_PLATFORM = /PLATFORM-NOT-SUPPORTED|UNSUPPORTED PLATFORM/

/** Longest the underlying sentence may take in a toast description; the rest is cut. */
const DETAIL_LIMIT = 160

/**
 * The failure's own sentence, for the toast's description. First line only — a native module
 * failure appends a require stack — and capped, so a provider's paragraph cannot push the
 * headline out of the toast.
 */
function failureDetail(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const line = message.split('\n', 1)[0]?.trim() ?? ''
  if (!line) return undefined
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT - 1)}…` : line
}

/** The notice for one failure, plus the sentence it came from. */
export interface DictationFailureNotice {
  kind: DictationNoticeKind
  /** The failure's own words, when they say more than the notice's own copy. */
  detail?: string
}

/**
 * A stream failure sorted by its stable code and text, the Assistant VoicePanel's classification.
 * Reads only `code` and the message — the plain `Error` and the newer `VoiceApiError` both carry
 * them. `null` for a cancellation, which says nothing.
 *
 * The kind picks the headline; the detail rides along for the failures whose own sentence says
 * more than a class can. A capture failure is split further, because "no microphone is attached"
 * and "this build has no audio component" are the same null from the component's side and two
 * different sentences to a user — one is their hardware, the other is our build.
 */
export function classifyDictationFailure(error: unknown): DictationFailureNotice | null {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const haystack = `${code} ${raw}`.toUpperCase()
  const detail = failureDetail(error)

  const withDetail = (kind: DictationNoticeKind): DictationFailureNotice => ({
    kind,
    ...(detail ? { detail } : {})
  })
  /** Where the notice's own copy is the whole sentence: the component's words add nothing. */
  const bare = (kind: DictationNoticeKind): DictationFailureNotice => ({ kind })

  if (/VOICE_OPERATION_CANCELLED/.test(haystack)) return null
  // The code decides which capture class this is; the text is the fallback for an error that
  // carries only a sentence (an older host, a wrapper) or a generic code with a specific reason.
  if (isVoiceCaptureUnavailableCode(code) || CAPTURE_UNAVAILABLE.test(haystack)) {
    if (
      code === VOICE_CAPTURE_UNAVAILABLE_CODES.componentMissing ||
      code === VOICE_CAPTURE_UNAVAILABLE_CODES.drainUnavailable ||
      CAPTURE_COMPONENT_GONE.test(haystack)
    )
      return bare('capture-component-missing')
    // A device's own reason, from the component or the sentence that quotes it.
    if (code === VOICE_CAPTURE_UNAVAILABLE_CODES.deviceUnavailable || CAPTURE_DEVICE.test(haystack))
      return withDetail('microphone-missing')
    if (
      code === VOICE_CAPTURE_UNAVAILABLE_CODES.platformUnsupported ||
      CAPTURE_PLATFORM.test(haystack)
    )
      return bare('capture-platform-unsupported')
    // `disabled`, a reason we do not know yet, or a bare generic code: keep the component's words.
    return withDetail('capture-unavailable')
  }
  if (/PERMISSION|DENIED|NOT_?AUTHORIZ|UNAUTHORIZED/.test(haystack))
    return withDetail('microphone-denied')
  if (DEVICE_MISSING.test(haystack)) return withDetail('microphone-missing')
  if (/VOICE_ASR_NOT_CONFIGURED/.test(haystack)) return withDetail('recognition-not-configured')
  if (/VOICE_ASR_(?:PROVIDER|CREDENTIAL)_UNAVAILABLE/.test(haystack))
    return withDetail('recognition-unavailable')
  if (/QUOTA|CREDIT|INSUFFICIENT_BALANCE/.test(haystack)) return withDetail('quota')
  if (CONGESTED.test(haystack)) return withDetail('busy')
  return withDetail('failed')
}

export interface DictationNoticeContext {
  t: (key: string) => string
  /** Opens the OS microphone pane; absent where the platform has none (Linux). */
  openMicrophoneSettings?: () => void
  /** Where recognition is set up (`/setting/intelligence/capabilities`). */
  openRecognitionSettings: () => void
}

interface NoticeCopy {
  message: string
  tone: 'warning' | 'error'
  action?: 'microphone' | 'recognition'
}

const COPY: Record<DictationNoticeKind, NoticeCopy> = {
  'recognition-not-configured': {
    message: 'assistant.voicePanel.voiceRecognitionNotConfigured',
    tone: 'warning',
    action: 'recognition'
  },
  'recognition-unavailable': {
    message: 'assistant.voicePanel.voiceRecognitionUnavailable',
    tone: 'warning',
    action: 'recognition'
  },
  // Nothing to open and nothing to retry: this build has no audio component at all. The tone is
  // error for the same reason an unknown failure is — it will not resolve on its own.
  'capture-component-missing': {
    message: 'assistant.voicePanel.voiceCaptureComponentMissing',
    tone: 'error'
  },
  // The platform has no capture backend. Also not the user's doing, also not self-healing, but
  // it is a fact about their OS rather than about this install.
  'capture-platform-unsupported': {
    message: 'assistant.voicePanel.voiceCapturePlatformUnsupported',
    tone: 'error'
  },
  // A reason we do not recognise yet: the component's own words are the description.
  'capture-unavailable': {
    message: 'assistant.voicePanel.voiceCaptureUnavailable',
    tone: 'error'
  },
  'microphone-denied': {
    message: 'assistant.voicePanel.microphoneDenied',
    tone: 'warning',
    action: 'microphone'
  },
  'microphone-missing': {
    message: 'assistant.voicePanel.microphoneMissing',
    tone: 'warning',
    action: 'microphone'
  },
  'microphone-unresponsive': {
    message: 'assistant.voicePanel.microphoneUnresponsive',
    tone: 'warning',
    action: 'microphone'
  },
  quota: { message: 'assistant.voicePanel.quotaExhausted', tone: 'warning' },
  busy: { message: 'assistant.voicePanel.serviceBusy', tone: 'warning' },
  failed: { message: 'assistant.voicePanel.voiceTranscribeFailed', tone: 'error' },
  empty: { message: 'assistant.voicePanel.voiceTranscribeEmpty', tone: 'warning' }
}

/**
 * The toast for one notice, with its fixing action when the platform offers one.
 *
 * `detail` becomes the toast's description: the headline names the class of problem and its
 * action, the description is the failure's own words. It is the difference between "voice
 * transcription failed" and knowing that the audio component is missing from this build.
 */
export function showDictationNotice(
  kind: DictationNoticeKind,
  context: DictationNoticeContext,
  detail?: string
): void {
  const copy = COPY[kind]
  const action =
    copy.action === 'recognition'
      ? {
          label: context.t('assistant.voicePanel.openRecognitionSettings'),
          onClick: context.openRecognitionSettings
        }
      : copy.action === 'microphone' && context.openMicrophoneSettings
        ? {
            label: context.t('assistant.voicePanel.openMicrophoneSettings'),
            onClick: context.openMicrophoneSettings
          }
        : undefined
  const options = { ...(action ? { action } : {}), ...(detail ? { description: detail } : {}) }
  const show = copy.tone === 'error' ? toast.error : toast.warning
  show(context.t(copy.message), Object.keys(options).length ? options : undefined)
}
