<script setup lang="ts">
import type { VoiceRingEmotion, VoiceRingState, VoiceRingType } from '@talex-touch/tuffex/voice-ring'
import { useVoiceRingMicrophone } from '@talex-touch/tuffex/voice-ring'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TxButton, TxVoiceRing } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      type: '形态',
      state: '对话状态',
      emotion: '情绪色调',
      source: '音频驱动',
      types: { ring: '光环 Ring', mono: '双环 Mono' },
      states: { idle: '静息', listening: '倾听', speaking: '播报', processing: '思考' },
      emotions: { none: '默认光谱', positive: '积极', negative: '警示', calm: '沉静' },
      demoVoice: '模拟语音',
      micStart: '开启麦克风',
      micStop: '关闭麦克风',
      hoverBend: '悬停膜形变',
    }
  : {
      type: 'Variant',
      state: 'State',
      emotion: 'Emotion',
      source: 'Source',
      types: { ring: 'Ring', mono: 'Mono' },
      states: { idle: 'Idle', listening: 'Listening', speaking: 'Speaking', processing: 'Processing' },
      emotions: { none: 'Spectrum', positive: 'Positive', negative: 'Negative', calm: 'Calm' },
      demoVoice: 'Demo voice',
      micStart: 'Microphone',
      micStop: 'Stop mic',
      hoverBend: 'Hover bend',
    })

const ringType = ref<VoiceRingType>('ring')
const ringState = ref<VoiceRingState>('listening')
const emotion = ref<VoiceRingEmotion | null>(null)
const hoverBend = ref(true)
const mic = useVoiceRingMicrophone()

const states: VoiceRingState[] = ['idle', 'listening', 'speaking', 'processing']
const emotionItems: Array<{ key: 'none' | VoiceRingEmotion, value: VoiceRingEmotion | null }> = [
  { key: 'none', value: null },
  { key: 'positive', value: 'positive' },
  { key: 'negative', value: 'negative' },
  { key: 'calm', value: 'calm' },
]

// Synthesized realistic conversational cadence when microphone is off.
let simTime = 0
let raf = 0
let last = 0
function getSimulatedLevel(): number {
  if (ringState.value !== 'listening' && ringState.value !== 'speaking') return 0
  const phrase = 0.5 + 0.5 * Math.sin(simTime * 1.45)
  const syllable = 0.5 + 0.5 * Math.sin(simTime * 7.8 + Math.sin(simTime * 2.7))
  const gate = phrase > 0.25 ? 1 : 0.12
  return Math.min(1, Math.max(0, gate * (0.28 + 0.58 * syllable * phrase)))
}

function tick(now: number): void {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
  last = now
  simTime += dt
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  mic.stop()
})

async function toggleMic(): Promise<void> {
  if (mic.stream.value) mic.stop()
  else await mic.start()
}
</script>

<template>
  <div class="vr-demo not-prose">
    <div class="vr-demo__stage">
      <TxVoiceRing
        :type="ringType"
        :state="ringState"
        :size="220"
        :stream="mic.stream.value"
        :level="mic.stream.value ? undefined : getSimulatedLevel"
        :emotion="emotion"
        :hover-bend="hoverBend"
        theme="dark"
      />
      <span class="vr-demo__caption">{{ copy.states[ringState] }}</span>
    </div>

    <div class="vr-demo__panel">
      <div class="vr-demo__row">
        <span class="vr-demo__label">{{ copy.type }}</span>
        <div class="vr-demo__pills">
          <TxButton size="sm" :variant="ringType === 'ring' ? 'primary' : 'secondary'" @click="ringType = 'ring'">
            {{ copy.types.ring }}
          </TxButton>
          <TxButton size="sm" :variant="ringType === 'mono' ? 'primary' : 'secondary'" @click="ringType = 'mono'">
            {{ copy.types.mono }}
          </TxButton>
        </div>
      </div>

      <div class="vr-demo__row">
        <span class="vr-demo__label">{{ copy.state }}</span>
        <div class="vr-demo__pills">
          <TxButton
            v-for="s in states"
            :key="s"
            size="sm"
            :variant="ringState === s ? 'primary' : 'secondary'"
            @click="ringState = s"
          >
            {{ copy.states[s] }}
          </TxButton>
        </div>
      </div>

      <div class="vr-demo__row">
        <span class="vr-demo__label">{{ copy.emotion }}</span>
        <div class="vr-demo__pills">
          <TxButton
            v-for="item in emotionItems"
            :key="item.key"
            size="sm"
            :variant="emotion === item.value ? 'primary' : 'secondary'"
            @click="emotion = item.value"
          >
            {{ copy.emotions[item.key] }}
          </TxButton>
        </div>
      </div>

      <div class="vr-demo__row">
        <span class="vr-demo__label">{{ copy.source }}</span>
        <div class="vr-demo__pills">
          <TxButton size="sm" :variant="!mic.stream.value ? 'primary' : 'secondary'" @click="mic.stop()">
            {{ copy.demoVoice }}
          </TxButton>
          <TxButton
            size="sm"
            :variant="mic.stream.value ? 'primary' : 'secondary'"
            :disabled="!mic.supported"
            @click="toggleMic"
          >
            {{ mic.stream.value ? copy.micStop : copy.micStart }}
          </TxButton>
          <TxButton size="sm" :variant="hoverBend ? 'primary' : 'secondary'" @click="hoverBend = !hoverBend">
            {{ copy.hoverBend }}
          </TxButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vr-demo {
  display: grid;
  gap: 16px;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.vr-demo__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 290px;
  padding: 24px 16px;
  border-radius: 18px;
  background: #0b0c0f;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.vr-demo__caption {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.vr-demo__panel {
  display: grid;
  gap: 10px;
}

.vr-demo__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.vr-demo__label {
  min-width: 68px;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.vr-demo__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
