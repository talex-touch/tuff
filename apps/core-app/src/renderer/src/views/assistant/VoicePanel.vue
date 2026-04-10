<script lang="ts" setup name="VoicePanel">
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
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
const inputText = ref('')
const interimText = ref('')
const errorMessage = ref('')
const sourceText = ref('')

let recognition: SpeechRecognitionLike | null = null
let restartTimer: ReturnType<typeof setTimeout> | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null

const mergedText = computed(() => {
  const finalText = inputText.value.trim()
  const interim = interimText.value.trim()
  return interim ? `${finalText} ${interim}`.trim() : finalText
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

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  sourceText.value = payload?.source || ''
  inputText.value = ''
  interimText.value = ''
  errorMessage.value = ''
  await loadRuntimeConfig()
  keepListening = true
  startRecognition()
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
            {{
              listening ? t('assistant.voicePanel.listening') : t('assistant.voicePanel.waiting')
            }}
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
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </main>

      <footer class="voice-panel-footer">
        <button class="secondary-btn" type="button" @click="startRecognition">
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

.voice-panel-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.secondary-btn,
.primary-btn {
  border: none;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.82);
  color: #9a3412;
}

.primary-btn {
  background: #ea580c;
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
