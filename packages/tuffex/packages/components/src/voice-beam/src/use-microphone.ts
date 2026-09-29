// Vue port of `useMicrophone` from voice-glow/src/useMicrophone.ts
// (https://github.com/Jakubantalik/Libraries — MIT © 2026 Jakub Antalik).
// Behavior mirrors the upstream hook 1:1 (same constraints, same state
// machine, same teardown); only the React state/effect plumbing becomes Vue
// refs + lifecycle hooks.

import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { getAudioContext } from './audio'

export type MicrophoneState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported' | 'error'

export interface UseMicrophoneOptions {
  /**
   * Extra `getUserMedia` audio constraints. The defaults turn the browser's
   * voice processing off so the beam reacts to the raw signal; pass your own
   * to override (e.g. `{ echoCancellation: true }`).
   */
  constraints?: MediaTrackConstraints
  /** Ask for the microphone on mount rather than waiting for `start()`. */
  autoStart?: boolean
}

export interface UseMicrophoneResult {
  /** The live stream to hand to `<TxVoiceBeam :stream="…">`, or null. */
  stream: Ref<MediaStream | null>
  state: Ref<MicrophoneState>
  /** The error behind a 'denied' / 'error' state, if any. */
  error: Ref<Error | null>
  /** True when this browser can capture audio at all. */
  supported: Ref<boolean>
  /** Request the microphone. Call it from a click so Safari lets audio start. */
  start: () => Promise<MediaStream | null>
  /** Stop every track and drop the stream. */
  stop: () => void
}

const DEFAULT_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

function isSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/**
 * Microphone access for TxVoiceBeam.
 *
 * ```vue
 * <script setup lang="ts">
 * const mic = useMicrophone()
 * </script>
 * <template>
 *   <button @click="mic.start()">Listen</button>
 *   <TxVoiceBeam :stream="mic.stream.value">…</TxVoiceBeam>
 * </template>
 * ```
 *
 * The stream is stopped on unmount, and when the browser ends the track
 * (device unplugged, permission revoked) the state falls back to 'idle'.
 */
export function useMicrophone(options: UseMicrophoneOptions = {}): UseMicrophoneResult {
  // `stream`/`error` are platform objects: a deep ref would wrap them in a
  // reactive proxy, which breaks identity (the driver's WeakMap is keyed by
  // the stream) for no gain.
  const stream = shallowRef<MediaStream | null>(null)
  const state = ref<MicrophoneState>(isSupported() ? 'idle' : 'unsupported')
  const error = shallowRef<Error | null>(null)
  const supported = ref(isSupported())
  // Mirrors upstream's `streamRef`: the truth for start/stop, so a stale
  // render value can never be handed back twice. A plain local, not a ref —
  // nothing renders from it.
  let streamRef: MediaStream | null = null

  const stop = (): void => {
    const current = streamRef
    streamRef = null
    if (current) current.getTracks().forEach((t) => t.stop())
    stream.value = null
    state.value = isSupported() ? 'idle' : 'unsupported'
  }

  const start = async (): Promise<MediaStream | null> => {
    if (!isSupported()) {
      state.value = 'unsupported'
      return null
    }
    if (streamRef) return streamRef

    // Create (and resume) the shared context inside the gesture that
    // triggered this, while the browser still allows it.
    getAudioContext()

    state.value = 'requesting'
    error.value = null
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: { ...DEFAULT_CONSTRAINTS, ...(options.constraints ?? {}) },
      })
      streamRef = next
      stream.value = next
      state.value = 'live'
      const onEnded = (): void => {
        if (streamRef !== next) return
        streamRef = null
        stream.value = null
        state.value = 'idle'
      }
      next.getAudioTracks().forEach((t) => t.addEventListener('ended', onEnded))
      return next
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      error.value = err
      state.value = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : 'error'
      return null
    }
  }

  if (options.autoStart) onMounted(() => void start())

  onBeforeUnmount(() => {
    const current = streamRef
    streamRef = null
    if (current) current.getTracks().forEach((t) => t.stop())
  })

  return { stream, state, error, supported, start, stop }
}
