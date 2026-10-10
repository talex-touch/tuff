<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()
const colorMode = useColorMode()

const beamTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))

const copy = computed(() => (locale.value === 'zh'
  ? {
      plain: '默认：一起缩放',
      organic: 'organic = 1：各自起伏',
      hint: '同一段电平驱动两个辉光；organic 只在有声音时起作用，停顿时两者一样安静。',
    }
  : {
      plain: 'Default: scales as one',
      organic: 'organic = 1: moves on its own',
      hint: 'One level drives both glows; organic only acts while a voice is heard, and both rest in the pauses.',
    }))

// A synthetic voice, so the demo does not ask for the microphone: syllables at
// about 4.5 Hz, each at its own loudness, with a pause at the end of every phrase.
const level = ref(0)
let raf = 0

function tick(now: number) {
  const t = now / 1000
  const syllable = Math.floor(t / 0.22)
  const loudness = 0.55 + 0.45 * Math.abs(Math.sin(syllable * 2.3))
  level.value = t % 4.2 < 3.2 ? loudness * Math.sin(Math.PI * ((t % 0.22) / 0.22)) ** 0.6 : 0
  raf = requestAnimationFrame(tick)
}

raf = requestAnimationFrame(tick)

onBeforeUnmount(() => cancelAnimationFrame(raf))

const getLevel = () => level.value
</script>

<template>
  <TxFlex direction="column" gap="20px" class="voice-beam-organic-demo">
    <TxFlex direction="column" gap="8px">
      <span class="voice-beam-organic-demo__label">{{ copy.plain }}</span>
      <TxVoiceBeam :theme="beamTheme" :level="getLevel" :border-radius="16">
        <TxCard :radius="16" :padding="24" shadow="none" class="voice-beam-organic-demo__host">
          <span>Ask anything…</span>
        </TxCard>
      </TxVoiceBeam>
    </TxFlex>

    <TxFlex direction="column" gap="8px">
      <span class="voice-beam-organic-demo__label">{{ copy.organic }}</span>
      <TxVoiceBeam :theme="beamTheme" :level="getLevel" :organic="1" :border-radius="16">
        <TxCard :radius="16" :padding="24" shadow="none" class="voice-beam-organic-demo__host">
          <span>Ask anything…</span>
        </TxCard>
      </TxVoiceBeam>
    </TxFlex>

    <p class="voice-beam-organic-demo__hint">
      {{ copy.hint }}
    </p>
  </TxFlex>
</template>

<style scoped>
.voice-beam-organic-demo {
  padding: 24px 8px;
}

.voice-beam-organic-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--tx-text-color-secondary);
}

.voice-beam-organic-demo__host {
  width: 320px;
}

.voice-beam-organic-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
