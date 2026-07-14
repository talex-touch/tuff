import type { Ref } from 'vue'
import { throttleRef } from '@modules/utils'
import { onUnmounted, watch } from 'vue'

/**
 * Drives lyric emphasis from the currently playing song while owning the
 * Web Audio graph and its animation frame for the component using it.
 */
export function useLyricAudioShine(song: Ref<any>) {
  const shine = throttleRef(false, 2400)

  let animationFrame: number | undefined
  let analyser: AnalyserNode | undefined
  let audioContext: AudioContext | undefined
  let audioSource: MediaElementAudioSourceNode | undefined
  let running = false

  function releaseAudioResources() {
    running = false

    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame)
      animationFrame = undefined
    }

    audioSource?.disconnect()
    analyser?.disconnect()
    audioContext?.close()

    audioSource = undefined
    analyser = undefined
    audioContext = undefined
  }

  function startAudioAnalysis(audioNode: HTMLMediaElement | undefined) {
    if (!audioNode || typeof AudioContext === 'undefined')
      return

    audioContext = new AudioContext()
    audioSource = audioContext.createMediaElementSource(audioNode)
    analyser = audioContext.createAnalyser()

    audioSource.connect(analyser)
    analyser.connect(audioContext.destination)

    const data = new Uint8Array(analyser.frequencyBinCount)
    running = true

    const draw = () => {
      if (!running || !analyser)
        return

      animationFrame = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(data)

      let sum = 0
      for (const sample of data)
        sum += sample

      shine.value = sum / data.length > 100
    }

    draw()
  }

  watch(song, (currentSong) => {
    releaseAudioResources()
    shine.value = false
    startAudioAnalysis(currentSong?.audio?._sounds?.[0]?._node)
  }, { immediate: true })

  onUnmounted(releaseAudioResources)

  return { shine }
}
