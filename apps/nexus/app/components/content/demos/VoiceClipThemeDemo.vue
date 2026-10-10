<script setup lang="ts">
import type { VoiceClipSample } from './voice-clip-sample'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { createVoiceClipSample, releaseVoiceClipSample } from './voice-clip-sample'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const labels = computed(() => zh.value
  ? { play: '播放语音', pause: '暂停语音', seek: '播放位置', transcript: '帮我看看这个分支的状态' }
  : { play: 'Play voice message', pause: 'Pause voice message', seek: 'Playback position', transcript: 'Check the state of this branch for me' })

const sample = shallowRef<VoiceClipSample | null>(null)

onMounted(() => {
  sample.value = createVoiceClipSample(4.4, 31)
})

onBeforeUnmount(() => releaseVoiceClipSample(sample.value))
</script>

<template>
  <div class="voice-clip-theme-demo not-prose">
    <!-- The bubble sets the clip's colours for everything inside it. -->
    <div v-if="sample" class="voice-clip-theme-demo__bubble">
      <TxVoiceClip
        :src="sample.src"
        :duration-ms="sample.durationMs"
        :play-label="labels.play"
        :pause-label="labels.pause"
        :seek-label="labels.seek"
      />
      <p class="voice-clip-theme-demo__transcript">
        {{ labels.transcript }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.voice-clip-theme-demo {
  display: flex;
  justify-content: flex-end;
  min-height: 92px;
}

.voice-clip-theme-demo__bubble {
  --tx-voice-clip-bg: transparent;
  --tx-voice-clip-accent: var(--tx-color-success, #67c23a);

  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  padding: 6px 8px 10px;
  border-radius: 18px;
  background: var(--tx-fill-color-light, #f5f7fa);
}

.voice-clip-theme-demo__transcript {
  margin: 0 8px;
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}
</style>
