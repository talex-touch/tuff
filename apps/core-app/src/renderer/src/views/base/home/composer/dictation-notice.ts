import { toast } from 'vue-sonner'

/**
 * What the composer's dictation has to tell the user, and how. The session reports a kind; the page
 * turns it into a toast with the one action that fixes it. No retry and no undo: main's recovery
 * slot is global and does not know sessions, so it may hold the Fn HUD's recording instead.
 */
export type DictationNoticeKind =
  | 'recognition-not-configured'
  | 'recognition-unavailable'
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

const DEVICE_MISSING =
  /CANNOT_?FIND|NO_?(INPUT_?)?DEVICE|DEVICE_?NOT_?FOUND|NO_?MICROPHONE|CAPTURE_?UNAVAILABLE|(?:MICROPHONE|INPUT|CAPTURE|AUDIO).{0,80}UNSUPPORTED|UNSUPPORTED.{0,80}(?:MICROPHONE|INPUT|CAPTURE|AUDIO)/
const CONGESTED =
  /RATE_?LIMIT|TOO_?MANY_?REQUESTS|OVERLOAD|HIGH_?DEMAND|BUSY|\b429\b|\b503\b|\b529\b/

/**
 * A stream failure sorted by its stable code and text, the Assistant VoicePanel's classification.
 * Reads only `code` and the message — the plain `Error` and the newer `VoiceApiError` both carry
 * them. `null` for a cancellation, which says nothing.
 */
export function classifyDictationFailure(error: unknown): DictationNoticeKind | null {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const haystack = `${code} ${raw}`.toUpperCase()

  if (/VOICE_OPERATION_CANCELLED/.test(haystack)) return null
  if (/PERMISSION|DENIED|NOT_?AUTHORIZ|UNAUTHORIZED/.test(haystack)) return 'microphone-denied'
  if (DEVICE_MISSING.test(haystack)) return 'microphone-missing'
  if (/VOICE_ASR_NOT_CONFIGURED/.test(haystack)) return 'recognition-not-configured'
  if (/VOICE_ASR_(?:PROVIDER|CREDENTIAL)_UNAVAILABLE/.test(haystack))
    return 'recognition-unavailable'
  if (/QUOTA|CREDIT|INSUFFICIENT_BALANCE/.test(haystack)) return 'quota'
  if (CONGESTED.test(haystack)) return 'busy'
  return 'failed'
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

/** The toast for one notice, with its fixing action when the platform offers one. */
export function showDictationNotice(
  kind: DictationNoticeKind,
  context: DictationNoticeContext
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
  const show = copy.tone === 'error' ? toast.error : toast.warning
  show(context.t(copy.message), action ? { action } : undefined)
}
