<script setup lang="ts">
import type { VoiceClipSample } from './voice-clip-sample'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { createVoiceClipSample, releaseVoiceClipSample } from './voice-clip-sample'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      peaks: '宿主传入的波形',
      unavailable: '没有录音',
      disabled: '禁用',
      play: '播放语音',
      pause: '暂停语音',
      seek: '播放位置',
      missing: '录音不可用',
    }
  : {
      peaks: 'Peaks from the host',
      unavailable: 'No recording',
      disabled: 'Disabled',
      play: 'Play voice message',
      pause: 'Pause voice message',
      seek: 'Playback position',
      missing: 'Recording unavailable',
    })

// A level history the host already has — what a dictation session hands over — so the clip
// draws it at once instead of decoding the file.
const levels = [0.05, 0.3, 0.72, 0.9, 0.48, 0.12, 0.08, 0.55, 0.86, 1, 0.64, 0.2, 0.06, 0.4, 0.78, 0.5, 0.18, 0.04]

const sample = shallowRef<VoiceClipSample | null>(null)

onMounted(() => {
  sample.value = createVoiceClipSample(5.6, 23)
})

onBeforeUnmount(() => releaseVoiceClipSample(sample.value))
</script>

<template>
  <div class="voice-clip-states-demo not-prose">
    <template v-if="sample">
      <div class="voice-clip-states-demo__row">
        <span class="voice-clip-states-demo__label">{{ copy.peaks }}</span>
        <TxVoiceClip
          :src="sample.src"
          :duration-ms="sample.durationMs"
          :peaks="levels"
          :play-label="copy.play"
          :pause-label="copy.pause"
          :seek-label="copy.seek"
          :unavailable-label="copy.missing"
        />
      </div>
      <div class="voice-clip-states-demo__row">
        <span class="voice-clip-states-demo__label">{{ copy.unavailable }}</span>
        <TxVoiceClip
          :duration-ms="4200"
          :play-label="copy.play"
          :unavailable-label="copy.missing"
        />
      </div>
      <div class="voice-clip-states-demo__row">
        <span class="voice-clip-states-demo__label">{{ copy.disabled }}</span>
        <TxVoiceClip
          :src="sample.src"
          :duration-ms="sample.durationMs"
          :peaks="levels"
          disabled
          :play-label="copy.play"
          :seek-label="copy.seek"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.voice-clip-states-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 128px;
}

.voice-clip-states-demo__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.voice-clip-states-demo__label {
  width: 120px;
  flex: none;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
