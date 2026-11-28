<script setup lang="ts">
import { computed, type ComponentPublicInstance, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const colorMode = useColorMode()

const beamTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))

const copy = computed(() => (locale.value === 'zh'
  ? {
      manual: '手动电平',
      active: '监听中',
      processing: '转写中',
      processingToggle: '切换到转写中',
      hint: '没有麦克风时用 level 手动驱动：每帧读一次 getter，不触发重渲染。',
    }
  : {
      manual: 'Manual level',
      active: 'Listening',
      processing: 'Transcribing',
      processingToggle: 'Toggle processing',
      hint: 'Without a microphone, drive it with level: the getter is sampled once per frame, with no re-render.',
    }))

// A synthetic level so the demo does not request microphone permission.
const level = ref(0.5)
const stage = ref<ComponentPublicInstance | null>(null)
let raf = 0
let t = 0
let observer: IntersectionObserver | null = null

function tick() {
  t += 0.016
  // Slow two-part wobble so the beam visibly reacts without an audio source.
  level.value = 0.35 + 0.32 * Math.abs(Math.sin(t * 1.7)) + 0.18 * Math.abs(Math.sin(t * 4.3))
  raf = requestAnimationFrame(tick)
}

// The loop runs only while the demo is on screen; once its beams scroll away, nothing reads the level.
function startLoop() {
  if (!raf)
    raf = requestAnimationFrame(tick)
}

function stopLoop() {
  cancelAnimationFrame(raf)
  raf = 0
}

onMounted(() => {
  const el = stage.value?.$el as HTMLElement | undefined
  if (!el || typeof IntersectionObserver === 'undefined') {
    startLoop()
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting)
      startLoop()
    else
      stopLoop()
  })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  stopLoop()
})

const processing = ref(false)
const getLevel = () => level.value
</script>

<template>
  <TxFlex ref="stage" direction="column" gap="20px" class="voice-beam-demo">
    <TxFlex direction="column" gap="8px">
      <span class="voice-beam-demo__label">{{ copy.active }}</span>
      <TxVoiceBeam :theme="beamTheme" :level="getLevel" :border-radius="16">
        <TxCard :radius="16" :padding="24" shadow="none" class="voice-beam-demo__host">
          <span>Ask anything…</span>
        </TxCard>
      </TxVoiceBeam>
    </TxFlex>

    <TxFlex direction="column" gap="8px">
      <span class="voice-beam-demo__label">{{ copy.processing }}</span>
      <TxVoiceBeam :theme="beamTheme" :level="getLevel" processing :border-radius="16">
        <TxCard :radius="16" :padding="24" shadow="none" class="voice-beam-demo__host">
          <span>Transcribing…</span>
        </TxCard>
      </TxVoiceBeam>
    </TxFlex>

    <TxFlex align="center" gap="10px">
      <TxSwitch v-model="processing" />
      <span class="voice-beam-demo__hint">{{ copy.processingToggle }}</span>
    </TxFlex>

    <p class="voice-beam-demo__hint">
      {{ copy.hint }}
    </p>
  </TxFlex>
</template>

<style scoped>
.voice-beam-demo {
  padding: 24px 8px;
}

.voice-beam-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.voice-beam-demo__host {
  width: 320px;
}

.voice-beam-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
