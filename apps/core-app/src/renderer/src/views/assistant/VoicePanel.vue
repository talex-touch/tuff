<script lang="ts" setup name="VoicePanel">
import type {
  AssistantClipboardImageTranslateErrorCode,
  AssistantRuntimeConfig,
  AssistantScreenshotCaptureErrorCode,
  AssistantScreenshotCapturePayload,
  AssistantScreenshotCaptureTarget,
  AssistantScreenshotDisplay,
  AssistantScreenshotSaveErrorCode,
  AssistantScreenshotRegionSelectionErrorCode,
  AssistantScreenshotTranslateErrorCode,
  AssistantScreenshotFallbackStageMetadata,
  AssistantScreenshotTextFallbackMetadata
} from '@talex-touch/utils/transport/events/assistant'
import type {
  CoreBoxImageTranslateRouteMetadata,
  IntelligenceErrorCode,
  CoreBoxImageTranslateRouteStage
} from '@talex-touch/utils/transport/events/types'
import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { defineEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { useI18n } from 'vue-i18n'
import { resolveIntelligenceErrorRecovery } from '../../modules/intelligence/ai-error-recovery'

const CLIPBOARD_IMAGE_TRANSLATE_ERROR_KEYS: Record<
  Exclude<AssistantClipboardImageTranslateErrorCode, IntelligenceErrorCode>,
  string
> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.imageTranslateAssistantDisabled',
  IMAGE_UNAVAILABLE: 'assistant.voicePanel.clipboardImageTranslateImageUnavailable',
  SCENE_UNAVAILABLE: 'assistant.voicePanel.imageTranslateProviderUnavailable'
}

const SCREENSHOT_TRANSLATE_ERROR_KEYS: Record<
  Exclude<AssistantScreenshotTranslateErrorCode, IntelligenceErrorCode>,
  string
> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.imageTranslateAssistantDisabled',
  IMAGE_UNAVAILABLE: 'assistant.voicePanel.screenshotTranslateImageUnavailable',
  SCENE_UNAVAILABLE: 'assistant.voicePanel.imageTranslateProviderUnavailable',
  SCREENSHOT_PERMISSION_DENIED: 'assistant.voicePanel.screenshotPermissionDenied',
  SCREENSHOT_UNSUPPORTED: 'assistant.voicePanel.screenshotUnsupported',
  SCREENSHOT_UNAVAILABLE: 'assistant.voicePanel.screenshotTranslateUnavailable',
  OCR_UNAVAILABLE: 'assistant.voicePanel.screenshotOcrUnavailable',
  TEXT_TRANSLATE_UNAVAILABLE: 'assistant.voicePanel.screenshotTextTranslateUnavailable'
}

const SCREENSHOT_CAPTURE_ERROR_KEYS: Record<AssistantScreenshotCaptureErrorCode, string> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.screenshotCaptureAssistantDisabled',
  SCREENSHOT_PERMISSION_DENIED: 'assistant.voicePanel.screenshotPermissionDenied',
  SCREENSHOT_UNSUPPORTED: 'assistant.voicePanel.screenshotUnsupported',
  SCREENSHOT_UNAVAILABLE: 'assistant.voicePanel.screenshotCaptureUnavailable'
}

const SCREENSHOT_SAVE_ERROR_KEYS: Record<AssistantScreenshotSaveErrorCode, string> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.screenshotCaptureAssistantDisabled',
  SCREENSHOT_PERMISSION_DENIED: 'assistant.voicePanel.screenshotPermissionDenied',
  SCREENSHOT_UNSUPPORTED: 'assistant.voicePanel.screenshotUnsupported',
  SCREENSHOT_UNAVAILABLE: 'assistant.voicePanel.screenshotCaptureUnavailable',
  SAVE_FAILED: 'assistant.voicePanel.screenshotSaveFailed'
}

const SCREENSHOT_REGION_SELECTION_ERROR_KEYS: Record<
  AssistantScreenshotRegionSelectionErrorCode,
  string
> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.screenshotCaptureAssistantDisabled',
  SCREENSHOT_UNSUPPORTED: 'assistant.voicePanel.screenshotUnsupported',
  REGION_SELECTION_UNAVAILABLE: 'assistant.voicePanel.screenshotRegionSelectionUnavailable'
}

function requiresIntelligenceSettingsRecovery(
  code?: AssistantScreenshotTranslateErrorCode
): boolean {
  if (isIntelligenceErrorCode(code)) {
    return code !== 'INVALID_REQUEST' && code !== 'UNKNOWN'
  }

  return (
    code === 'SCENE_UNAVAILABLE' ||
    code === 'OCR_UNAVAILABLE' ||
    code === 'TEXT_TRANSLATE_UNAVAILABLE'
  )
}

function formatIntelligenceError(code: IntelligenceErrorCode, fallback?: string): string {
  const recovery = resolveIntelligenceErrorRecovery({ errorCode: code, error: fallback }, t)
  return `${recovery.title}: ${recovery.detail}`
}

const props = withDefaults(
  defineProps<{
    managedByDock?: boolean
  }>(),
  { managedByDock: false }
)
const emit = defineEmits<{
  completed: []
}>()

const systemPermissionRequestEvent = defineEvent('system')
  .module('permission')
  .event('request')
  .define<'microphone' | 'screenRecording', boolean>()

const transport = useTuffTransport()
const { t } = useI18n()
const runtimeConfig = ref<AssistantRuntimeConfig>({
  enabled: false,
  language: 'zh-CN',
  wakeWords: ['阿洛', 'aler'],
  cooldownMs: 2200,
  continuous: true,
  assistantName: '阿洛 aler',
  openPanelOnWake: true
})

const listening = ref(false)
const transcribingVoice = ref(false)
const startingVoiceCapture = ref(false)
const submitting = ref(false)
const closingPanel = ref(false)
const translatingClipboardImage = ref(false)
const translatingScreenshot = ref(false)
const capturingScreenshot = ref(false)
const savingScreenshot = ref(false)
const openingScreenshotSettings = ref(false)
const openingMicrophoneSettings = ref(false)
const openingIntelligenceSettings = ref(false)
const screenshotCaptureMode = ref<AssistantScreenshotCaptureTarget>('cursor-display')
const screenshotDisplays = ref<AssistantScreenshotDisplay[]>([])
const selectedScreenshotDisplayId = ref('')
const voiceSdk = createVoiceSdk(transport)
const selectedScreenshotRegionDisplayId = ref('')
const inputArea = ref<HTMLTextAreaElement | null>(null)
const inputText = ref('')
const interimText = ref('')
const hasVoiceInput = ref(false)
const errorMessage = ref('')
const screenshotPermissionDenied = ref(false)
const microphonePermissionDenied = ref(false)
const microphoneSettingsOpened = ref(false)
const intelligenceSettingsRecoveryVisible = ref(false)
const statusMessage = ref('')
const sourceText = ref('')
const screenshotPreview = ref<{
  tfileUrl: string
  width: number
  height: number
  displayName: string
  wroteClipboard: boolean
  saved: boolean
} | null>(null)
const screenshotTextFallback = ref<{
  sourceText: string
  targetText: string
  metadata: AssistantScreenshotTextFallbackMetadata
} | null>(null)
const imageTranslateRoute = ref<CoreBoxImageTranslateRouteMetadata | null>(null)

let voiceStreamController: StreamController | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null

const mergedText = computed(() => {
  const finalText = inputText.value.trim()
  const interim = interimText.value.trim()
  return interim ? `${finalText} ${interim}`.trim() : finalText
})
const voiceWakeEnabled = computed(() => runtimeConfig.value.enabled)
const screenshotActionBusy = computed(
  () =>
    translatingClipboardImage.value ||
    translatingScreenshot.value ||
    capturingScreenshot.value ||
    savingScreenshot.value
)
const screenshotCapturePayload = computed<AssistantScreenshotCapturePayload>(() => {
  const displayId = selectedScreenshotDisplayId.value.trim()
  if (screenshotCaptureMode.value === 'display' && displayId) {
    return { target: 'display', displayId }
  }
  return { target: 'cursor-display' }
})
const panelStatusText = computed(() => {
  if (transcribingVoice.value) return t('assistant.voicePanel.voiceTranscribing')
  if (voiceWakeEnabled.value) {
    return listening.value ? t('assistant.voicePanel.listening') : t('assistant.voicePanel.waiting')
  }
  return t('assistant.voicePanel.textOnly')
})

async function loadRuntimeConfig(): Promise<void> {
  try {
    runtimeConfig.value = await transport.send(
      AssistantEvents.floatingBall.getRuntimeConfig,
      undefined
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function appendVoiceText(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  inputText.value = [inputText.value.trim(), trimmed].filter(Boolean).join(' ')
  interimText.value = ''
  hasVoiceInput.value = true
}

function stopVoiceSession(): void {
  keepListening = false
  listening.value = false
  transcribingVoice.value = false
  interimText.value = ''
  const controller = voiceStreamController
  voiceStreamController = null
  controller?.cancel()
}

function handleVoiceSessionEvent(event: VoiceAsrStreamEvent): void {
  if (event.type === 'partial') {
    interimText.value = event.text
    hasVoiceInput.value = true
    statusMessage.value = t('assistant.voicePanel.voiceTranscribing')
    return
  }
  if (event.type === 'final') {
    interimText.value = ''
    appendVoiceText(event.text)
    statusMessage.value =
      event.delivery?.method === 'none'
        ? t('assistant.voicePanel.submitFailed')
        : t('assistant.voicePanel.voiceTranscribed')
    return
  }
  listening.value = false
  transcribingVoice.value = false
  voiceStreamController = null
  keepListening = false
}
function isVoicePermissionFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /(microphone|permission|denied|not[- ]allowed|accessibility)/i.test(message)
}

function showVoiceSessionError(error: unknown): void {
  const permissionDenied = isVoicePermissionFailure(error)
  microphonePermissionDenied.value = permissionDenied
  errorMessage.value = permissionDenied
    ? t('assistant.voicePanel.permissionDenied')
    : error instanceof Error && error.message
      ? error.message
      : t('assistant.voicePanel.voiceTranscribeFailed')
}

async function startVoiceSession(): Promise<void> {
  if (!voiceWakeEnabled.value) {
    errorMessage.value = t('assistant.voicePanel.voiceWakeDisabled')
    return
  }
  if (voiceStreamController || startingVoiceCapture.value || transcribingVoice.value) return

  keepListening = true
  startingVoiceCapture.value = true
  listening.value = true
  errorMessage.value = ''
  microphonePermissionDenied.value = false
  intelligenceSettingsRecoveryVisible.value = false
  statusMessage.value = t('assistant.voicePanel.voicePreparing')
  try {
    const controller = await voiceSdk.asrStream(
      { language: runtimeConfig.value.language, cleanup: true, delivery: 'none' },
      {
        onData: handleVoiceSessionEvent,
        onError: (error) => {
          if (!keepListening) return
          showVoiceSessionError(error)
          listening.value = false
          transcribingVoice.value = false
          voiceStreamController = null
          keepListening = false
        },
        onEnd: () => {
          listening.value = false
          transcribingVoice.value = false
          voiceStreamController = null
          keepListening = false
        }
      }
    )
    if (keepListening) {
      voiceStreamController = controller
    } else {
      controller.cancel()
    }
  } catch (error) {
    listening.value = false
    keepListening = false
    showVoiceSessionError(error)
  } finally {
    startingVoiceCapture.value = false
  }
}

function toggleVoiceInput(): void {
  if (startingVoiceCapture.value || transcribingVoice.value) return
  if (voiceStreamController) {
    stopVoiceSession()
    return
  }
  void startVoiceSession()
}
function formatClipboardImageTranslateError(
  code?: AssistantClipboardImageTranslateErrorCode,
  fallback?: string
): string {
  if (isIntelligenceErrorCode(code)) return formatIntelligenceError(code, fallback)
  if (code) {
    return t(CLIPBOARD_IMAGE_TRANSLATE_ERROR_KEYS[code])
  }
  return fallback || t('assistant.voicePanel.clipboardImageTranslateFailed')
}

function formatScreenshotTranslateError(
  code?: AssistantScreenshotTranslateErrorCode,
  fallback?: string
): string {
  if (isIntelligenceErrorCode(code)) return formatIntelligenceError(code, fallback)
  if (code) {
    return t(SCREENSHOT_TRANSLATE_ERROR_KEYS[code])
  }
  return fallback || t('assistant.voicePanel.screenshotTranslateFailed')
}

function formatScreenshotCaptureError(
  code?: AssistantScreenshotCaptureErrorCode,
  fallback?: string
): string {
  if (code) {
    return t(SCREENSHOT_CAPTURE_ERROR_KEYS[code])
  }
  return fallback || t('assistant.voicePanel.screenshotCaptureFailed')
}

function formatScreenshotSaveError(
  code?: AssistantScreenshotSaveErrorCode,
  fallback?: string
): string {
  if (code) {
    return t(SCREENSHOT_SAVE_ERROR_KEYS[code])
  }
  return fallback || t('assistant.voicePanel.screenshotSaveFailed')
}

function formatScreenshotDisplayLabel(display: AssistantScreenshotDisplay): string {
  const name = display.friendlyName?.trim() || display.name
  const primary = display.isPrimary
    ? ` · ${t('assistant.voicePanel.screenshotDisplayPrimary')}`
    : ''
  return `${name} · ${display.width} × ${display.height}${primary}`
}

function formatScreenshotRegionSelectionError(
  code?: AssistantScreenshotRegionSelectionErrorCode,
  fallback?: string
): string {
  if (code) return t(SCREENSHOT_REGION_SELECTION_ERROR_KEYS[code])
  return fallback || t('assistant.voicePanel.screenshotRegionSelectionUnavailable')
}

function formatFallbackProvider(stage: AssistantScreenshotFallbackStageMetadata): string {
  const provider = typeof stage.provider === 'string' ? stage.provider.trim() : ''
  const model = typeof stage.model === 'string' ? stage.model.trim() : ''
  return (
    [provider, model].filter(Boolean).join(' / ') ||
    t('assistant.voicePanel.screenshotFallbackProviderUnknown')
  )
}

function formatImageTranslateRouteStage(stage: CoreBoxImageTranslateRouteStage): string {
  const providerId = stage.providerId.trim()
  const providerName = stage.providerName?.trim()
  const provider =
    providerName && providerName !== providerId ? `${providerName} (${providerId})` : providerId
  const route = [provider, stage.model?.trim()].filter(Boolean).join(' / ')
  const formatted = t('assistant.voicePanel.screenshotImageTranslateRouteStage', {
    capability: stage.capability,
    route
  })
  return typeof stage.latencyMs === 'number' && Number.isFinite(stage.latencyMs)
    ? t('assistant.voicePanel.screenshotImageTranslateRouteStageLatency', {
        stage: formatted,
        latency: String(stage.latencyMs)
      })
    : formatted
}

async function resolveScreenshotActionPayload(): Promise<AssistantScreenshotCapturePayload | null> {
  if (screenshotCaptureMode.value !== 'region') {
    return screenshotCapturePayload.value
  }

  statusMessage.value = t('assistant.voicePanel.screenshotRegionSelecting')
  const displayId = selectedScreenshotRegionDisplayId.value.trim()
  const response = await transport.send(AssistantEvents.voice.selectScreenshotRegion, {
    target: displayId ? 'display' : 'cursor-display',
    ...(displayId ? { displayId } : {})
  })
  if (response?.canceled) {
    statusMessage.value = ''
    return null
  }
  if (!response?.success || !response.resource?.tfileUrl) {
    statusMessage.value = ''
    errorMessage.value = formatScreenshotRegionSelectionError(response?.code, response?.error)
    return null
  }
  return {
    target: 'resource',
    tfileUrl: response.resource.tfileUrl,
    resource: response.resource
  }
}
async function loadScreenshotDisplays(): Promise<void> {
  try {
    const displays = await transport.send(AssistantEvents.voice.listScreenshotDisplays, undefined)
    screenshotDisplays.value = Array.isArray(displays)
      ? displays.filter((display) => typeof display?.id === 'string' && display.id.trim())
      : []

    const selectedExists = screenshotDisplays.value.some(
      (display) => display.id === selectedScreenshotDisplayId.value
    )
    if (!selectedExists) {
      selectedScreenshotDisplayId.value =
        screenshotDisplays.value.find((display) => display.isPrimary)?.id ||
        screenshotDisplays.value[0]?.id ||
        ''
    }
    if (!selectedScreenshotDisplayId.value && screenshotCaptureMode.value === 'display') {
      screenshotCaptureMode.value = 'cursor-display'
    }
  } catch {
    screenshotDisplays.value = []
    selectedScreenshotDisplayId.value = ''
    screenshotCaptureMode.value = 'cursor-display'
  }
}

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  stopVoiceSession()
  sourceText.value = payload?.source || ''
  inputText.value = ''
  interimText.value = ''
  hasVoiceInput.value = false
  errorMessage.value = ''
  statusMessage.value = ''
  screenshotPreview.value = null
  screenshotPermissionDenied.value = false
  microphonePermissionDenied.value = false
  microphoneSettingsOpened.value = false
  intelligenceSettingsRecoveryVisible.value = false
  screenshotTextFallback.value = null
  imageTranslateRoute.value = null
  selectedScreenshotRegionDisplayId.value = ''
  await nextTick()
  inputArea.value?.focus({ preventScroll: true })
  await Promise.all([loadRuntimeConfig(), loadScreenshotDisplays()])
  keepListening = voiceWakeEnabled.value
  if (keepListening) void startVoiceSession()
}
defineExpose({
  openPanel: (source?: string): Promise<void> => handlePanelOpened({ source })
})

async function submitText(): Promise<void> {
  if (submitting.value) return
  const content = mergedText.value.trim()
  if (!content) {
    errorMessage.value = t('assistant.voicePanel.emptyInput')
    return
  }

  submitting.value = true
  try {
    const response = await transport.send(AssistantEvents.voice.submitText, {
      text: content,
      source: hasVoiceInput.value ? 'voice' : 'manual'
    })
    if (!response?.accepted) {
      errorMessage.value = t('assistant.voicePanel.submitFailed')
      return
    }
    emit('completed')
    keepListening = false
    stopVoiceSession()
    inputText.value = ''
    interimText.value = ''
    hasVoiceInput.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return

  event.preventDefault()
  void submitText()
}

async function translateClipboardImage(): Promise<void> {
  if (screenshotActionBusy.value) return

  keepListening = false
  stopVoiceSession()
  translatingClipboardImage.value = true
  errorMessage.value = ''
  intelligenceSettingsRecoveryVisible.value = false
  imageTranslateRoute.value = null
  statusMessage.value = t('assistant.voicePanel.clipboardImageTranslating')

  try {
    const response = await transport.send(AssistantEvents.voice.translateClipboardImage, {
      targetLang: 'zh'
    })
    if (!response?.success) {
      statusMessage.value = ''
      intelligenceSettingsRecoveryVisible.value = requiresIntelligenceSettingsRecovery(
        response?.code
      )
      errorMessage.value = formatClipboardImageTranslateError(
        response?.code,
        response?.reason || response?.error
      )
      return
    }
    imageTranslateRoute.value = response.metadata ?? null
    statusMessage.value = t('assistant.voicePanel.clipboardImageTranslateReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    translatingClipboardImage.value = false
  }
}

async function translateScreenshot(): Promise<void> {
  if (screenshotActionBusy.value) return

  keepListening = false
  stopVoiceSession()
  translatingScreenshot.value = true
  errorMessage.value = ''
  screenshotPermissionDenied.value = false
  intelligenceSettingsRecoveryVisible.value = false
  statusMessage.value = t('assistant.voicePanel.screenshotTranslating')
  screenshotPreview.value = null
  screenshotTextFallback.value = null
  imageTranslateRoute.value = null

  try {
    const capturePayload = await resolveScreenshotActionPayload()
    if (!capturePayload) return
    statusMessage.value = t('assistant.voicePanel.screenshotTranslating')
    const response = await transport.send(AssistantEvents.voice.translateScreenshot, {
      targetLang: 'zh',
      ...capturePayload
    })
    if (!response?.success) {
      statusMessage.value = ''
      screenshotPermissionDenied.value = response?.code === 'SCREENSHOT_PERMISSION_DENIED'
      intelligenceSettingsRecoveryVisible.value = requiresIntelligenceSettingsRecovery(
        response?.code
      )
      errorMessage.value = formatScreenshotTranslateError(
        response?.code,
        response?.reason || response?.error
      )
      return
    }
    if (response.mode === 'ocr-text') {
      const source = response.sourceText?.trim()
      const target = response.targetText?.trim()
      if (!source || !target || !response.fallback) {
        statusMessage.value = ''
        intelligenceSettingsRecoveryVisible.value = true
        errorMessage.value = t('assistant.voicePanel.screenshotTextTranslateUnavailable')
        return
      }
      screenshotTextFallback.value = {
        sourceText: source,
        targetText: target,
        metadata: response.fallback
      }
      statusMessage.value = t('assistant.voicePanel.screenshotTextFallbackReady')
      return
    }
    imageTranslateRoute.value = response.metadata ?? null
    statusMessage.value = t('assistant.voicePanel.screenshotTranslateReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    translatingScreenshot.value = false
  }
}

async function captureScreenshot(): Promise<void> {
  if (screenshotActionBusy.value) return

  keepListening = false
  stopVoiceSession()
  capturingScreenshot.value = true
  errorMessage.value = ''
  screenshotPermissionDenied.value = false
  intelligenceSettingsRecoveryVisible.value = false
  statusMessage.value = t('assistant.voicePanel.screenshotCapturing')
  screenshotPreview.value = null
  screenshotTextFallback.value = null
  imageTranslateRoute.value = null

  try {
    const capturePayload = await resolveScreenshotActionPayload()
    if (!capturePayload) return
    statusMessage.value = t('assistant.voicePanel.screenshotCapturing')
    const response = await transport.send(AssistantEvents.voice.captureScreenshot, capturePayload)
    if (!response?.success || !response.tfileUrl) {
      statusMessage.value = ''
      screenshotPermissionDenied.value = response?.code === 'SCREENSHOT_PERMISSION_DENIED'
      errorMessage.value = formatScreenshotCaptureError(response?.code, response?.error)
      return
    }

    screenshotPreview.value = {
      tfileUrl: response.tfileUrl,
      width: response.width ?? 0,
      height: response.height ?? 0,
      displayName: response.displayName || '',
      wroteClipboard: response.wroteClipboard === true,
      saved: false
    }
    statusMessage.value = t('assistant.voicePanel.screenshotCaptureReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    capturingScreenshot.value = false
  }
}

async function saveScreenshot(): Promise<void> {
  if (screenshotActionBusy.value) return

  keepListening = false
  stopVoiceSession()
  savingScreenshot.value = true
  errorMessage.value = ''
  screenshotPermissionDenied.value = false
  intelligenceSettingsRecoveryVisible.value = false
  statusMessage.value = t('assistant.voicePanel.screenshotSaving')

  try {
    const capturePayload = await resolveScreenshotActionPayload()
    if (!capturePayload) return
    statusMessage.value = t('assistant.voicePanel.screenshotSaving')
    const response = await transport.send(AssistantEvents.voice.saveScreenshot, capturePayload)
    if (response?.canceled) {
      statusMessage.value = ''
      return
    }
    if (!response?.success) {
      screenshotPermissionDenied.value = response?.code === 'SCREENSHOT_PERMISSION_DENIED'
      statusMessage.value = ''
      errorMessage.value = formatScreenshotSaveError(response?.code, response?.error)
      return
    }

    if (screenshotPreview.value) {
      screenshotPreview.value = {
        ...screenshotPreview.value,
        width: response.width ?? screenshotPreview.value.width,
        height: response.height ?? screenshotPreview.value.height,
        displayName: response.displayName || screenshotPreview.value.displayName,
        saved: true
      }
    }
    statusMessage.value = t('assistant.voicePanel.screenshotSaveReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    savingScreenshot.value = false
  }
}

async function openScreenshotPermissionSettings(): Promise<void> {
  if (openingScreenshotSettings.value) return

  openingScreenshotSettings.value = true
  statusMessage.value = ''
  try {
    const opened = await transport.send(systemPermissionRequestEvent, 'screenRecording')
    if (!opened) {
      errorMessage.value = t('assistant.voicePanel.screenshotPermissionSettingsUnavailable')
      return
    }

    errorMessage.value = ''
    statusMessage.value = t('assistant.voicePanel.screenshotPermissionSettingsOpened')
  } catch {
    errorMessage.value = t('assistant.voicePanel.screenshotPermissionSettingsUnavailable')
  } finally {
    openingScreenshotSettings.value = false
  }
}

async function recoverMicrophonePermission(): Promise<void> {
  if (openingMicrophoneSettings.value) return

  if (microphoneSettingsOpened.value) {
    statusMessage.value = ''
    errorMessage.value = ''
    microphonePermissionDenied.value = false
    keepListening = true
    void startVoiceSession()
    return
  }

  openingMicrophoneSettings.value = true
  statusMessage.value = ''
  try {
    const opened = await transport.send(systemPermissionRequestEvent, 'microphone')
    if (!opened) {
      errorMessage.value = t('assistant.voicePanel.microphonePermissionSettingsUnavailable')
      return
    }

    microphoneSettingsOpened.value = true
    errorMessage.value = ''
    statusMessage.value = t('assistant.voicePanel.microphonePermissionSettingsOpened')
  } catch {
    errorMessage.value = t('assistant.voicePanel.microphonePermissionSettingsUnavailable')
  } finally {
    openingMicrophoneSettings.value = false
  }
}

async function openIntelligenceSettings(): Promise<void> {
  if (openingIntelligenceSettings.value) return

  openingIntelligenceSettings.value = true
  statusMessage.value = ''
  try {
    const opened = await transport.send(AssistantEvents.voice.openIntelligenceSettings, undefined)
    if (!opened) {
      errorMessage.value = t('assistant.voicePanel.intelligenceSettingsUnavailable')
      return
    }

    intelligenceSettingsRecoveryVisible.value = false
    errorMessage.value = ''
    statusMessage.value = t('assistant.voicePanel.intelligenceSettingsOpened')
  } catch {
    errorMessage.value = t('assistant.voicePanel.intelligenceSettingsUnavailable')
  } finally {
    openingIntelligenceSettings.value = false
  }
}

async function closePanel(): Promise<void> {
  if (closingPanel.value) return

  closingPanel.value = true
  keepListening = false
  stopVoiceSession()
  try {
    await transport.send(AssistantEvents.voice.closePanel, undefined)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    closingPanel.value = false
  }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return

  event.preventDefault()
  void closePanel()
}

onMounted(() => {
  if (!props.managedByDock) {
    disposePanelOpen = transport.on(AssistantEvents.voice.panelOpened, async (payload) => {
      await handlePanelOpened(payload)
    })
  }
  window.addEventListener('keydown', handleWindowKeydown)
  void Promise.all([loadRuntimeConfig(), loadScreenshotDisplays()])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  keepListening = false
  stopVoiceSession()
  disposePanelOpen?.()
  disposePanelOpen = null
})
</script>

<template>
  <div class="voice-panel-root">
    <div
      class="voice-panel"
      :class="{ 'voice-panel--active': listening || transcribingVoice || startingVoiceCapture }"
    >
      <header class="voice-panel-header">
        <div class="voice-panel-heading">
          <span
            class="voice-panel-mark"
            :class="{
              active: listening || transcribingVoice || startingVoiceCapture,
              error: !!errorMessage
            }"
            aria-hidden="true"
          >
            <span class="i-carbon-microphone-filled" />
          </span>
          <div class="title-wrap">
            <p class="title">{{ runtimeConfig.assistantName }}</p>
            <p class="subtitle">
              {{ panelStatusText }}
              <span v-if="sourceText"> · {{ sourceText }}</span>
            </p>
          </div>
        </div>
        <div class="voice-panel-actions">
          <div
            class="voice-signal"
            :class="{ active: listening || transcribingVoice || startingVoiceCapture }"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <button
            class="close-btn"
            type="button"
            :disabled="closingPanel"
            aria-keyshortcuts="Escape"
            @click="closePanel"
          >
            {{ t('assistant.voicePanel.close') }}
          </button>
        </div>
      </header>

      <main class="voice-panel-body">
        <div class="screenshot-target-controls">
          <label class="screenshot-target-field">
            <span>{{ t('assistant.voicePanel.screenshotMode') }}</span>
            <select v-model="screenshotCaptureMode" :disabled="screenshotActionBusy">
              <option value="cursor-display">
                {{ t('assistant.voicePanel.screenshotModeCursorDisplay') }}
              </option>
              <option value="display" :disabled="!screenshotDisplays.length">
                {{ t('assistant.voicePanel.screenshotModeSelectedDisplay') }}
              </option>
              <option value="region" :disabled="!screenshotDisplays.length">
                {{ t('assistant.voicePanel.screenshotModeRegion') }}
              </option>
            </select>
          </label>
          <label v-if="screenshotCaptureMode === 'display'" class="screenshot-target-field">
            <span>{{ t('assistant.voicePanel.screenshotDisplay') }}</span>
            <select v-model="selectedScreenshotDisplayId" :disabled="screenshotActionBusy">
              <option v-for="display in screenshotDisplays" :key="display.id" :value="display.id">
                {{ formatScreenshotDisplayLabel(display) }}
              </option>
            </select>
          </label>
          <label
            v-if="screenshotCaptureMode === 'region'"
            class="screenshot-target-field screenshot-region-display-field"
          >
            <span>{{ t('assistant.voicePanel.screenshotRegionDisplay') }}</span>
            <select v-model="selectedScreenshotRegionDisplayId" :disabled="screenshotActionBusy">
              <option value="">
                {{ t('assistant.voicePanel.screenshotRegionDisplayCursor') }}
              </option>
              <option v-for="display in screenshotDisplays" :key="display.id" :value="display.id">
                {{ formatScreenshotDisplayLabel(display) }}
              </option>
            </select>
          </label>
        </div>
        <textarea
          ref="inputArea"
          v-model="inputText"
          class="input-area"
          :placeholder="t('assistant.voicePanel.placeholder')"
          enterkeyhint="send"
          aria-keyshortcuts="Enter"
          @keydown="handleInputKeydown"
        />
        <p v-if="interimText" class="interim-text">{{ interimText }}</p>
        <div v-if="screenshotPreview" class="screenshot-preview">
          <img
            class="screenshot-preview-image"
            :src="screenshotPreview.tfileUrl"
            :alt="t('assistant.voicePanel.screenshotPreviewAlt')"
          />
          <p class="screenshot-preview-meta">
            {{
              t('assistant.voicePanel.screenshotPreviewMeta', {
                width: screenshotPreview.width,
                height: screenshotPreview.height,
                display:
                  screenshotPreview.displayName ||
                  t('assistant.voicePanel.screenshotDisplayUnknown')
              })
            }}
          </p>
          <p v-if="screenshotPreview.wroteClipboard" class="screenshot-preview-copy">
            {{ t('assistant.voicePanel.screenshotCopied') }}
          </p>
          <p v-if="screenshotPreview.saved" class="screenshot-preview-save">
            {{ t('assistant.voicePanel.screenshotSavedPath') }}
          </p>
        </div>
        <section v-if="screenshotTextFallback" class="screenshot-text-fallback" aria-live="polite">
          <p class="screenshot-text-fallback-title">
            {{ t('assistant.voicePanel.screenshotTextFallbackTitle') }}
          </p>
          <div class="screenshot-text-fallback-row">
            <span>{{ t('assistant.voicePanel.screenshotTextFallbackSource') }}</span>
            <p>{{ screenshotTextFallback.sourceText }}</p>
          </div>
          <div class="screenshot-text-fallback-row">
            <span>{{ t('assistant.voicePanel.screenshotTextFallbackTarget') }}</span>
            <p>{{ screenshotTextFallback.targetText }}</p>
          </div>
          <p class="screenshot-text-fallback-meta">
            {{
              t('assistant.voicePanel.screenshotTextFallbackMetadata', {
                ocr: formatFallbackProvider(screenshotTextFallback.metadata.ocr),
                translation: formatFallbackProvider(screenshotTextFallback.metadata.translation)
              })
            }}
          </p>
        </section>
        <section
          v-if="imageTranslateRoute"
          class="screenshot-image-translate-route"
          aria-live="polite"
        >
          <p class="screenshot-image-translate-route-title">
            {{ t('assistant.voicePanel.screenshotImageTranslateRouteTitle') }}
          </p>
          <ul
            v-if="imageTranslateRoute.stages.length"
            class="screenshot-image-translate-route-list"
          >
            <li
              v-for="stage in imageTranslateRoute.stages"
              :key="`${stage.capability}:${stage.providerId}`"
            >
              {{ formatImageTranslateRouteStage(stage) }}
            </li>
          </ul>
          <p class="screenshot-image-translate-route-summary">
            {{
              t('assistant.voicePanel.screenshotImageTranslateRouteSummary', {
                duration: String(imageTranslateRoute.durationMs),
                runId: imageTranslateRoute.runId
              })
            }}
          </p>
        </section>
        <p v-if="statusMessage" class="status-text">{{ statusMessage }}</p>
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        <button
          v-if="microphonePermissionDenied"
          class="secondary-btn permission-recovery-btn"
          type="button"
          :disabled="openingMicrophoneSettings"
          @click="recoverMicrophonePermission"
        >
          {{
            openingMicrophoneSettings
              ? t('assistant.voicePanel.openingMicrophonePermissionSettings')
              : microphoneSettingsOpened
                ? t('assistant.voicePanel.retryVoiceInput')
                : t('assistant.voicePanel.openMicrophonePermissionSettings')
          }}
        </button>
        <button
          v-if="screenshotPermissionDenied"
          class="secondary-btn permission-recovery-btn"
          type="button"
          :disabled="openingScreenshotSettings"
          @click="openScreenshotPermissionSettings"
        >
          {{
            openingScreenshotSettings
              ? t('assistant.voicePanel.openingScreenshotPermissionSettings')
              : t('assistant.voicePanel.openScreenshotPermissionSettings')
          }}
        </button>
        <button
          v-if="intelligenceSettingsRecoveryVisible"
          class="secondary-btn intelligence-recovery-btn"
          type="button"
          :disabled="openingIntelligenceSettings"
          @click="openIntelligenceSettings"
        >
          {{
            openingIntelligenceSettings
              ? t('assistant.voicePanel.openingIntelligenceSettings')
              : t('assistant.voicePanel.openIntelligenceSettings')
          }}
        </button>
      </main>

      <footer class="voice-panel-footer">
        <div class="voice-panel-tools">
          <button
            class="secondary-btn"
            type="button"
            :disabled="screenshotActionBusy || transcribingVoice || startingVoiceCapture"
            @click="translateClipboardImage"
          >
            {{
              translatingClipboardImage
                ? t('assistant.voicePanel.imageTranslatingShort')
                : t('assistant.voicePanel.translateClipboardImage')
            }}
          </button>
          <button
            class="secondary-btn"
            type="button"
            :disabled="screenshotActionBusy || transcribingVoice || startingVoiceCapture"
            @click="translateScreenshot"
          >
            {{
              translatingScreenshot
                ? t('assistant.voicePanel.imageTranslatingShort')
                : t('assistant.voicePanel.translateScreenshot')
            }}
          </button>
          <button
            class="secondary-btn"
            type="button"
            :disabled="screenshotActionBusy || transcribingVoice || startingVoiceCapture"
            @click="captureScreenshot"
          >
            {{
              capturingScreenshot
                ? t('assistant.voicePanel.screenshotCapturingShort')
                : t('assistant.voicePanel.captureScreenshot')
            }}
          </button>
          <button
            class="secondary-btn"
            type="button"
            :disabled="screenshotActionBusy || transcribingVoice || startingVoiceCapture"
            @click="saveScreenshot"
          >
            {{
              savingScreenshot
                ? t('assistant.voicePanel.screenshotSavingShort')
                : t('assistant.voicePanel.saveScreenshot')
            }}
          </button>
          <button
            class="secondary-btn"
            type="button"
            :disabled="!voiceWakeEnabled || startingVoiceCapture || transcribingVoice"
            @click="toggleVoiceInput"
          >
            {{
              startingVoiceCapture
                ? t('assistant.voicePanel.voicePreparing')
                : transcribingVoice
                  ? t('assistant.voicePanel.voiceTranscribingShort')
                  : listening
                    ? t('assistant.voicePanel.stopListening')
                    : t('assistant.voicePanel.startListening')
            }}
          </button>
        </div>
        <button
          class="primary-btn"
          type="button"
          :disabled="submitting || transcribingVoice || startingVoiceCapture"
          @click="submitText"
        >
          {{
            submitting
              ? t('assistant.voicePanel.submitting')
              : t('assistant.voicePanel.sendToCoreBox')
          }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.voice-panel-root {
  width: 100%;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}

.voice-panel {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  padding: 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, rgba(255, 251, 235, 0.92), rgba(255, 237, 213, 0.92));
  border: 1px solid rgba(251, 191, 36, 0.35);
  box-shadow: 0 16px 36px rgba(124, 45, 18, 0.18);
}

.voice-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title-wrap {
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 700;
  color: #7c2d12;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.3;
  color: #9a3412;
}

.close-btn {
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
  color: #9a3412;
  font-size: 12px;
  line-height: 1;
  padding: 8px 10px;
  cursor: pointer;
}

.voice-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.screenshot-target-controls {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.screenshot-target-field {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10px;
  color: #9a3412;
}

.screenshot-target-field select {
  min-width: 0;
  width: 100%;
  height: 28px;
  border: 1px solid rgba(180, 83, 9, 0.25);
  border-radius: 8px;
  padding: 0 8px;
  color: #7c2d12;
  background: rgba(255, 255, 255, 0.85);
}

.input-area {
  flex: 1;
  resize: none;
  border: 1px solid rgba(180, 83, 9, 0.25);
  border-radius: 10px;
  padding: 10px;
  line-height: 1.5;
  font-size: 13px;
  color: #431407;
  background: rgba(255, 255, 255, 0.85);
  outline: none;
}

.input-area:focus {
  border-color: rgba(249, 115, 22, 0.65);
}

.interim-text {
  margin: 0;
  font-size: 12px;
  color: #9a3412;
  opacity: 0.85;
}

.error-text {
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}

.status-text {
  margin: 0;
  font-size: 12px;
  color: #047857;
}

.permission-recovery-btn {
  align-self: flex-start;
}

.intelligence-recovery-btn {
  align-self: flex-start;
}

.screenshot-preview {
  border: 1px solid rgba(180, 83, 9, 0.22);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.82);
}

.screenshot-preview-image {
  display: block;
  width: 100%;
  max-height: 82px;
  object-fit: contain;
  border-radius: 7px;
  background: rgba(67, 20, 7, 0.06);
}

.screenshot-preview-meta,
.screenshot-preview-copy,
.screenshot-preview-save {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.3;
  color: #9a3412;
}

.screenshot-preview-copy {
  color: #047857;
}

.screenshot-preview-save {
  word-break: break-all;
}

.screenshot-text-fallback,
.screenshot-image-translate-route {
  max-height: 132px;
  overflow: auto;
  border: 1px solid rgba(180, 83, 9, 0.22);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.82);
}

.screenshot-text-fallback-title,
.screenshot-text-fallback-row p,
.screenshot-text-fallback-meta {
  margin: 0;
}

.screenshot-text-fallback-title {
  font-size: 12px;
  font-weight: 700;
  color: #7c2d12;
}

.screenshot-text-fallback-row {
  margin-top: 6px;
}

.screenshot-text-fallback-row span,
.screenshot-text-fallback-meta {
  font-size: 10px;
  color: #9a3412;
}

.screenshot-text-fallback-row p {
  margin-top: 2px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 11px;
  line-height: 1.35;
  color: #431407;
}

.screenshot-text-fallback-meta {
  margin-top: 7px;
  line-height: 1.3;
}

.screenshot-image-translate-route-title,
.screenshot-image-translate-route-list,
.screenshot-image-translate-route-summary {
  margin: 0;
}

.screenshot-image-translate-route-title {
  font-size: 12px;
  font-weight: 700;
  color: #7c2d12;
}

.screenshot-image-translate-route-list {
  padding: 0;
  list-style: none;
}

.screenshot-image-translate-route-list li,
.screenshot-image-translate-route-summary {
  margin-top: 6px;
  font-size: 10px;
  line-height: 1.3;
  color: #9a3412;
}

.voice-panel-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.secondary-btn,
.primary-btn {
  border: none;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  min-height: 32px;
  max-width: 150px;
  white-space: normal;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.82);
  color: #9a3412;
}

.primary-btn {
  background: #ea580c;
  color: #fff;
}

.secondary-btn:disabled,
.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.voice-panel {
  background:
    radial-gradient(circle at 86% 8%, var(--shell-primary-soft), transparent 32%),
    linear-gradient(145deg, var(--shell-surface), var(--shell-surface-2));
  border-color: var(--shell-border);
  box-shadow:
    0 18px 40px rgb(0 0 0 / 0.2),
    0 0 0 1px rgb(255 255 255 / 0.08);
}

.title {
  color: var(--shell-text-primary);
}

.subtitle,
.screenshot-target-field,
.interim-text,
.screenshot-preview-meta,
.screenshot-preview-save,
.screenshot-text-fallback-row span,
.screenshot-text-fallback-meta,
.screenshot-image-translate-route-list li,
.screenshot-image-translate-route-summary {
  color: var(--shell-text-secondary);
}

.close-btn,
.secondary-btn,
.screenshot-target-field select,
.input-area,
.screenshot-preview,
.screenshot-text-fallback,
.screenshot-image-translate-route {
  border-color: var(--shell-border);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
}

.input-area {
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.input-area:focus {
  border-color: var(--shell-primary);
  box-shadow: 0 0 0 3px var(--shell-primary-soft);
}

.primary-btn {
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  box-shadow: 0 8px 16px var(--shell-primary-soft);
}

.status-text,
.screenshot-preview-copy {
  color: var(--shell-success);
}

.error-text {
  color: var(--shell-danger);
}

.voice-signal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 42px;
  height: 24px;
  margin-left: auto;
  margin-right: 2px;
  opacity: 0.45;
}

.voice-signal span {
  width: 3px;
  height: 6px;
  border-radius: 3px;
  background: var(--shell-primary);
  transform-origin: center;
}

.voice-signal span:nth-child(2) {
  height: 11px;
}

.voice-signal span:nth-child(3) {
  height: 17px;
}

.voice-signal span:nth-child(4) {
  height: 12px;
}

.voice-signal span:nth-child(5) {
  height: 8px;
}

.voice-signal.active {
  opacity: 1;
}

.voice-signal.active span {
  animation: voice-signal-pulse 620ms ease-in-out infinite alternate;
}

.voice-signal.active span:nth-child(2) {
  animation-delay: -180ms;
}

.voice-signal.active span:nth-child(3) {
  animation-delay: -320ms;
}

.voice-signal.active span:nth-child(4) {
  animation-delay: -100ms;
}

@keyframes voice-signal-pulse {
  from {
    transform: scaleY(0.55);
  }
  to {
    transform: scaleY(1.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-signal.active span {
    animation: none;
  }
}
.voice-panel-root {
  padding: 8px 10px 12px;
}

.voice-panel {
  position: relative;
  overflow: hidden;
  border-radius: var(--shell-radius-xl);
  padding: 16px;
  background:
    radial-gradient(circle at 88% 0%, var(--shell-primary-soft), transparent 34%),
    var(--shell-surface);
  border: 1px solid var(--shell-border);
  box-shadow: 0 8px 14px var(--shell-shadow);
}

.voice-panel::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: calc(var(--shell-radius-xl) - 1px);
  border: 1px solid rgb(255 255 255 / 0.08);
  pointer-events: none;
}

.voice-panel > * {
  position: relative;
  z-index: 1;
}

.voice-panel-header {
  align-items: center;
  gap: 12px;
}

.voice-panel-heading,
.voice-panel-actions {
  display: flex;
  align-items: center;
}

.voice-panel-heading {
  min-width: 0;
  gap: 10px;
}

.voice-panel-actions {
  flex-shrink: 0;
  gap: 10px;
}

.voice-panel-mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-size: 15px;
}

.voice-panel-mark.active {
  animation: voice-panel-mark-pulse 1.4s ease-out infinite;
}

.voice-panel-mark.error {
  border-color: var(--shell-danger-border);
  background: var(--shell-danger-soft);
  color: var(--shell-danger);
}

.title {
  font-size: var(--shell-fs-md);
  letter-spacing: -0.01em;
}

.subtitle {
  margin-top: 3px;
  font-size: var(--shell-fs-caption);
}

.voice-signal {
  width: 48px;
  margin: 0;
}

.close-btn {
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  padding: 7px 10px;
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  transition:
    border-color 160ms ease-out,
    color 160ms ease-out,
    transform 160ms ease-out;
}

.close-btn:hover {
  border-color: var(--shell-primary-border);
  color: var(--shell-text-primary);
}

.close-btn:active,
.secondary-btn:active,
.primary-btn:active {
  transform: scale(0.98);
}

.voice-panel-body {
  margin-top: 12px;
  gap: 8px;
}

.screenshot-target-controls {
  gap: 8px;
}

.screenshot-target-field {
  gap: 4px;
  color: var(--shell-text-secondary);
}

.screenshot-target-field select,
.input-area {
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-regular);
}

.screenshot-target-field select {
  height: 30px;
  padding: 0 9px;
}

.input-area {
  min-height: 72px;
  padding: 11px 12px;
  font-size: var(--shell-fs-body);
  line-height: 1.45;
  box-shadow: none;
  transition:
    border-color 160ms ease-out,
    box-shadow 160ms ease-out;
}

.input-area::placeholder {
  color: var(--shell-text-muted);
}

.input-area:focus {
  border-color: var(--shell-primary);
  box-shadow: 0 0 0 3px var(--shell-primary-soft);
}

.interim-text {
  padding: 6px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
}

.voice-panel-footer {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: 10px;
}

.voice-panel-tools {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.secondary-btn,
.primary-btn {
  min-width: 0;
  max-width: none;
  border-radius: var(--shell-radius-md);
  padding: 8px 9px;
  font-size: var(--shell-fs-caption);
  font-weight: 600;
  transition:
    border-color 160ms ease-out,
    background-color 160ms ease-out,
    color 160ms ease-out,
    transform 160ms ease-out;
}

.secondary-btn {
  overflow: hidden;
  border: 1px solid var(--shell-border);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.secondary-btn:hover {
  border-color: var(--shell-primary-border);
  background: var(--shell-primary-soft);
  color: var(--shell-text-primary);
}

.primary-btn {
  align-self: flex-end;
  min-width: 136px;
  border: 1px solid var(--shell-primary);
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  box-shadow: none;
}

.primary-btn:hover {
  filter: brightness(1.06);
}

.secondary-btn:disabled,
.primary-btn:disabled,
.close-btn:disabled {
  opacity: 0.52;
}

@keyframes voice-panel-mark-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--shell-primary-soft);
  }
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}

.voice-panel-tools .secondary-btn {
  padding-inline: 4px;
  font-size: 10px;
  letter-spacing: -0.01em;
}

@media (max-width: 410px) {
  .voice-panel-tools {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .primary-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-panel-mark.active {
    animation: none;
  }

  .close-btn,
  .secondary-btn,
  .primary-btn,
  .input-area {
    transition: none;
  }
}
</style>
