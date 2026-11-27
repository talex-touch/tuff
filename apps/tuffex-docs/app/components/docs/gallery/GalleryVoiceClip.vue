<script setup lang="ts">
import type { VoiceClipSample } from '../../content/demos/voice-clip-sample'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { createVoiceClipSample, releaseVoiceClipSample } from '../../content/demos/voice-clip-sample'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const labels = computed(() => zh.value
  ? { play: '播放语音', pause: '暂停语音', seek: '播放位置' }
  : { play: 'Play voice message', pause: 'Pause voice message', seek: 'Playback position' })

// The recording is made in the page on mount, so a reset remounts it with a fresh object URL.
// The gallery loads this file asynchronously: TxVoiceClip resolves from the tuffex dist, and a dev
// server restarted before the dist is rebuilt then loses this one cell, not every suite's gallery.
const sample = shallowRef<VoiceClipSample | null>(null)

onMounted(() => {
  sample.value = createVoiceClipSample(6.2, 17)
})

onBeforeUnmount(() => releaseVoiceClipSample(sample.value))
</script>

<template>
  <TxVoiceClip
    v-if="sample"
    :src="sample.src"
    :duration-ms="sample.durationMs"
    :play-label="labels.play"
    :pause-label="labels.pause"
    :seek-label="labels.seek"
  />
</template>
