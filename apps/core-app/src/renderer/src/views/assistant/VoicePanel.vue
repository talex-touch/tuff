<script lang="ts" setup name="VoicePanel">
import type {
  AssistantClipboardImageTranslateErrorCode,
  AssistantRuntimeConfig,
  AssistantScreenshotCaptureErrorCode,
  AssistantScreenshotTranslateErrorCode
} from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useI18n } from 'vue-i18n'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
      }) => void)
    | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

const CLIPBOARD_IMAGE_TRANSLATE_ERROR_KEYS: Record<
  AssistantClipboardImageTranslateErrorCode,
  string
> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.imageTranslateAssistantDisabled',
  IMAGE_UNAVAILABLE: 'assistant.voicePanel.clipboardImageTranslateImageUnavailable',
  SCENE_UNAVAILABLE: 'assistant.voicePanel.imageTranslateProviderUnavailable'
}

const SCREENSHOT_TRANSLATE_ERROR_KEYS: Record<AssistantScreenshotTranslateErrorCode, string> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.imageTranslateAssistantDisabled',
  IMAGE_UNAVAILABLE: 'assistant.voicePanel.screenshotTranslateImageUnavailable',
  SCENE_UNAVAILABLE: 'assistant.voicePanel.imageTranslateProviderUnavailable',
  SCREENSHOT_UNAVAILABLE: 'assistant.voicePanel.screenshotTranslateUnavailable'
}

const SCREENSHOT_CAPTURE_ERROR_KEYS: Record<AssistantScreenshotCaptureErrorCode, string> = {
  ASSISTANT_DISABLED: 'assistant.voicePanel.screenshotCaptureAssistantDisabled',
  SCREENSHOT_UNAVAILABLE: 'assistant.voicePanel.screenshotCaptureUnavailable'
}

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
const submitting = ref(false)
const translatingClipboardImage = ref(false)
const translatingScreenshot = ref(false)
const capturingScreenshot = ref(false)
const inputText = ref('')
const interimText = ref('')
const errorMessage = ref('')
const statusMessage = ref('')
const sourceText = ref('')
const screenshotPreview = ref<{
  dataUrl: string
  width: number
  height: number
  displayName: string
  wroteClipboard: boolean
} | null>(null)

let recognition: SpeechRecognitionLike | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null

const mergedText = computed(() => {
  const finalText = inputText.value.trim()
  const interim = interimText.value.trim()
  return interim ? `${finalText} ${interim}`.trim() : finalText
})
const voiceWakeEnabled = computed(() => runtimeConfig.value.enabled)
const panelStatusText = computed(() => {
  if (voiceWakeEnabled.value) {
    return listening.value ? t('assistant.voicePanel.listening') : t('assistant.voicePanel.waiting')
  }
  return t('assistant.voicePanel.textOnly')
})

function resolveSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const target = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null
}

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

function stopRecognition(): void {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (!recognition) {
    listening.value = false
    return
  }
  const activeRecognition = recognition
  recognition = null
  listening.value = false
  try {
    activeRecognition.onend = null
    activeRecognition.stop()
  } catch {
    // ignore stop errors
  }
}

function scheduleRestart(): void {
  if (!keepListening) return
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    startRecognition()
  }, 400)
}

function startRecognition(): void {
  if (!voiceWakeEnabled.value) {
    errorMessage.value = t('assistant.voicePanel.voiceWakeDisabled')
    return
  }
  if (!keepListening || recognition) return

  const SpeechRecognitionCtor = resolveSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) {
    errorMessage.value = t('assistant.voicePanel.unsupported')
    listening.value = false
    return
  }

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  errorMessage.value = ''
  instance.lang = runtimeConfig.value.language
  instance.continuous = true
  instance.interimResults = true
  instance.onstart = () => {
    listening.value = true
  }
  instance.onerror = (event) => {
    const errorType = String(event?.error || 'unknown')
    if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
      errorMessage.value = t('assistant.voicePanel.permissionDenied')
      keepListening = false
      stopRecognition()
      return
    }
    errorMessage.value = t('assistant.voicePanel.recognitionError', { error: errorType })
  }
  instance.onresult = (event) => {
    const finals: string[] = []
    const interims: string[] = []
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const current = event.results[i]
      const transcript = current?.[0]?.transcript
      if (typeof transcript !== 'string') continue
      const trimmed = transcript.trim()
      if (!trimmed) continue
      if (current.isFinal) {
        finals.push(trimmed)
      } else {
        interims.push(trimmed)
      }
    }
    if (finals.length) {
      inputText.value = [inputText.value.trim(), finals.join(' ')].filter(Boolean).join(' ')
    }
    interimText.value = interims.join(' ')
  }
  instance.onend = () => {
    recognition = null
    listening.value = false
    scheduleRestart()
  }

  try {
    instance.start()
  } catch (error) {
    recognition = null
    listening.value = false
    errorMessage.value = error instanceof Error ? error.message : String(error)
    scheduleRestart()
  }
}

function formatClipboardImageTranslateError(
  code?: AssistantClipboardImageTranslateErrorCode,
  fallback?: string
): string {
  if (code) {
    return t(CLIPBOARD_IMAGE_TRANSLATE_ERROR_KEYS[code])
  }
  return fallback || t('assistant.voicePanel.clipboardImageTranslateFailed')
}

function formatScreenshotTranslateError(
  code?: AssistantScreenshotTranslateErrorCode,
  fallback?: string
): string {
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

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  sourceText.value = payload?.source || ''
  inputText.value = ''
  interimText.value = ''
  errorMessage.value = ''
  statusMessage.value = ''
  screenshotPreview.value = null
  await loadRuntimeConfig()
  keepListening = voiceWakeEnabled.value
  if (keepListening) {
    startRecognition()
  } else {
    stopRecognition()
  }
}

async function submitText(): Promise<void> {
  const content = mergedText.value.trim()
  if (!content) {
    errorMessage.value = t('assistant.voicePanel.emptyInput')
    return
  }

  submitting.value = true
  try {
    const response = await transport.send(AssistantEvents.voice.submitText, {
      text: content,
      source: 'voice'
    })
    if (!response?.accepted) {
      errorMessage.value = t('assistant.voicePanel.submitFailed')
      return
    }
    keepListening = false
    stopRecognition()
    inputText.value = ''
    interimText.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

async function translateClipboardImage(): Promise<void> {
  if (translatingClipboardImage.value || translatingScreenshot.value || capturingScreenshot.value)
    return

  keepListening = false
  stopRecognition()
  translatingClipboardImage.value = true
  errorMessage.value = ''
  statusMessage.value = t('assistant.voicePanel.clipboardImageTranslating')

  try {
    const response = await transport.send(AssistantEvents.voice.translateClipboardImage, {
      targetLang: 'zh'
    })
    if (!response?.success) {
      statusMessage.value = ''
      errorMessage.value = formatClipboardImageTranslateError(response?.code, response?.error)
      return
    }
    statusMessage.value = t('assistant.voicePanel.clipboardImageTranslateReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    translatingClipboardImage.value = false
  }
}

async function translateScreenshot(): Promise<void> {
  if (translatingScreenshot.value || translatingClipboardImage.value || capturingScreenshot.value)
    return

  keepListening = false
  stopRecognition()
  translatingScreenshot.value = true
  errorMessage.value = ''
  statusMessage.value = t('assistant.voicePanel.screenshotTranslating')
  screenshotPreview.value = null

  try {
    const response = await transport.send(AssistantEvents.voice.translateScreenshot, {
      targetLang: 'zh'
    })
    if (!response?.success) {
      statusMessage.value = ''
      errorMessage.value = formatScreenshotTranslateError(response?.code, response?.error)
      return
    }
    statusMessage.value = t('assistant.voicePanel.screenshotTranslateReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    translatingScreenshot.value = false
  }
}

async function captureScreenshot(): Promise<void> {
  if (capturingScreenshot.value || translatingScreenshot.value || translatingClipboardImage.value)
    return

  keepListening = false
  stopRecognition()
  capturingScreenshot.value = true
  errorMessage.value = ''
  statusMessage.value = t('assistant.voicePanel.screenshotCapturing')
  screenshotPreview.value = null

  try {
    const response = await transport.send(AssistantEvents.voice.captureScreenshot, {
      target: 'cursor-display'
    })
    if (!response?.success || !response.dataUrl) {
      statusMessage.value = ''
      errorMessage.value = formatScreenshotCaptureError(response?.code, response?.error)
      return
    }

    screenshotPreview.value = {
      dataUrl: response.dataUrl,
      width: response.width ?? 0,
      height: response.height ?? 0,
      displayName: response.displayName || '',
      wroteClipboard: response.wroteClipboard === true
    }
    statusMessage.value = t('assistant.voicePanel.screenshotCaptureReady')
  } catch (error) {
    statusMessage.value = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    capturingScreenshot.value = false
  }
}

async function closePanel(): Promise<void> {
  keepListening = false
  stopRecognition()
  await transport.send(AssistantEvents.voice.closePanel, undefined)
}

onMounted(async () => {
  await loadRuntimeConfig()
  disposePanelOpen = transport.on(AssistantEvents.voice.panelOpened, async (payload) => {
    await handlePanelOpened(payload)
  })
})

onBeforeUnmount(() => {
  keepListening = false
  stopRecognition()
  disposePanelOpen?.()
  disposePanelOpen = null
})
</script>

<template>
  <div class="voice-panel-root">
    <div class="voice-panel">
      <header class="voice-panel-header">
        <div class="title-wrap">
          <p class="title">{{ runtimeConfig.assistantName }}</p>
          <p class="subtitle">
            {{ panelStatusText }}
            <span v-if="sourceText"> · {{ sourceText }}</span>
          </p>
        </div>
        <button class="close-btn" type="button" @click="closePanel">
          {{ t('assistant.voicePanel.close') }}
        </button>
      </header>

      <main class="voice-panel-body">
        <textarea
          v-model="inputText"
          class="input-area"
          :placeholder="t('assistant.voicePanel.placeholder')"
        />
        <p v-if="interimText" class="interim-text">{{ interimText }}</p>
        <div v-if="screenshotPreview" class="screenshot-preview">
          <img
            class="screenshot-preview-image"
            :src="screenshotPreview.dataUrl"
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
        </div>
        <p v-if="statusMessage" class="status-text">{{ statusMessage }}</p>
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </main>

      <footer class="voice-panel-footer">
        <button
          class="secondary-btn"
          type="button"
          :disabled="translatingClipboardImage || translatingScreenshot || capturingScreenshot"
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
          :disabled="translatingScreenshot || translatingClipboardImage || capturingScreenshot"
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
          :disabled="capturingScreenshot || translatingScreenshot || translatingClipboardImage"
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
          :disabled="!voiceWakeEnabled"
          @click="startRecognition"
        >
          {{
            listening
              ? t('assistant.voicePanel.listeningAction')
              : t('assistant.voicePanel.startListening')
          }}
        </button>
        <button class="primary-btn" type="button" :disabled="submitting" @click="submitText">
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
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.screenshot-preview-copy {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.3;
  color: #9a3412;
}

.screenshot-preview-copy {
  color: #047857;
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
</style>
