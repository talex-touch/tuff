<script setup lang="ts">
import type { VoiceClipSample } from './voice-clip-sample'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { createVoiceClipSample, releaseVoiceClipSample } from './voice-clip-sample'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const labels = computed(() => zh.value
  ? { play: '播放语音', pause: '暂停语音', seek: '播放位置', unavailable: '录音不可用' }
  : { play: 'Play voice message', pause: 'Pause voice message', seek: 'Playback position', unavailable: 'Recording unavailable' })

// Two lengths: the clip widens with its recording. Starting one pauses the other.
const clips = shallowRef<VoiceClipSample[]>([])

onMounted(() => {
  clips.value = [createVoiceClipSample(3.2, 7), createVoiceClipSample(14.5, 11)]
})

onBeforeUnmount(() => {
  clips.value.forEach(releaseVoiceClipSample)
})
</script>

<template>
  <div class="voice-clip-basic-demo not-prose">
    <TxVoiceClip
      v-for="clip in clips"
      :key="clip.src"
      :src="clip.src"
      :duration-ms="clip.durationMs"
      :play-label="labels.play"
      :pause-label="labels.pause"
      :seek-label="labels.seek"
      :unavailable-label="labels.unavailable"
    />
  </div>
</template>

<style scoped>
.voice-clip-basic-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  min-height: 82px;
}
</style>
