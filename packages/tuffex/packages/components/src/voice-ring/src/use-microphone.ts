// Vue composable port of voice-ring/src/useMicrophone.ts
// (https://github.com/Jakubantalik/Libraries.dev — MIT © 2026 Jakub Antalik).
import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { getAudioContext } from './audio'

export type VoiceRingMicrophoneState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported' | 'error'

export interface UseVoiceRingMicrophoneOptions {
  /** Extra getUserMedia audio constraints merged over raw-dynamics defaults. */
  constraints?: MediaTrackConstraints
  /** Request microphone access automatically on mount. */
  autoStart?: boolean
}

export interface UseVoiceRingMicrophoneResult {
  stream: Ref<MediaStream | null>
  state: Ref<VoiceRingMicrophoneState>
  error: Ref<Error | null>
  supported: boolean
  start: () => Promise<MediaStream | null>
  stop: () => void
}

const DEFAULT_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

function isMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices !== 'undefined'
    && typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

export function useVoiceRingMicrophone(options: UseVoiceRingMicrophoneOptions = {}): UseVoiceRingMicrophoneResult {
  const supported = isMediaSupported()
  const stream = shallowRef<MediaStream | null>(null)
  const state = ref<VoiceRingMicrophoneState>(supported ? 'idle' : 'unsupported')
  const error = shallowRef<Error | null>(null)

  function stop(): void {
    const current = stream.value
    stream.value = null
    if (current) {
      for (const track of current.getTracks()) track.stop()
    }
    state.value = isMediaSupported() ? 'idle' : 'unsupported'
  }

  async function start(): Promise<MediaStream | null> {
    if (!isMediaSupported()) {
      state.value = 'unsupported'
      return null
    }
    if (stream.value) return stream.value

    getAudioContext()
    state.value = 'requesting'
    error.value = null
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: { ...DEFAULT_CONSTRAINTS, ...(options.constraints ?? {}) },
      })
      stream.value = next
      state.value = 'live'
      const onEnded = () => {
        if (stream.value !== next) return
        stream.value = null
        state.value = 'idle'
      }
      for (const track of next.getAudioTracks()) {
        track.addEventListener('ended', onEnded)
      }
      return next
    }
    catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      error.value = err
      state.value = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : 'error'
      return null
    }
  }

  onMounted(() => {
    if (options.autoStart) void start()
  })

  onBeforeUnmount(stop)

  return { stream, state, error, supported, start, stop }
}
