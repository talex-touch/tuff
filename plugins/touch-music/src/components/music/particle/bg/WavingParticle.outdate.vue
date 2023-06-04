<template>
  <div class="WavingParticle-Container" ref="container">
  </div>
</template>

<script>
export default {
  name: "WavingParticle"
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import WaveSurfer from 'wavesurfer.js'

const props = defineProps(['song'])

const audio = ref()
const container = ref()

onBeforeUnmount(() => {
  if( audio.value )
    audio.value.destroy()
})

onMounted(() => {

  watch(() => props.song.url.url, (value) => {
    if( audio.value )
      audio.value.destroy()

    console.log( props.song, value )

    const progress = props.song.progress

    audio.value = WaveSurfer.create({
      backend: 'MediaElement',
      container: container.value,
      waveColor: 'violet',
      progressColor: 'purple',
      pixelRatio: 1
    })

    audio.value.on('ready', () => {
      audio.value.setMute(true)
      audio.value.zoom(10)
      // audio.value.play(Math.round(progress.current))
      watch(() => props.song._flag, (flag) => {
        if( flag === 2 ) audio.value.pause()
        else audio.value.play(Math.round(progress.current))
      }, { immediate: true })
    })

    audio.value.load(value)
    //props.song.audio._sounds[0]._node.src

  }, { immediate: true })

})
</script>

<style lang="scss" scoped>
.WavingParticle-Container {
  z-index: -1;
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  pointer-events: none;
}
</style>