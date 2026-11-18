<script setup lang="ts">
import type { TxAiVoiceDraftProps } from '../../types'
import { TxVoiceBeam } from '@talex-touch/tuffex/voice-beam'
import { computed } from 'vue'
import { formatAiElapsed, voiceGlowDriveLevel } from '../../utils/composer-state'

defineOptions({ name: 'TxAiVoiceDraft' })

const props = withDefaults(defineProps<TxAiVoiceDraftProps>(), {
  active: false,
  state: 'idle',
  elapsedMs: 0,
  statusText: 'Listening…',
  escHint: 'Esc to cancel',
  cancelLabel: 'Cancel dictation',
  level: 0,
})

const emit = defineEmits<{
  cancel: []
}>()

const visible = computed(() => props.active || props.state !== 'idle')
const elapsedText = computed(() => formatAiElapsed(props.elapsedMs))
const beamLevel = computed(() => {
  if (typeof props.level === 'function') {
    const fn = props.level
    return () => voiceGlowDriveLevel(fn())
  }
  return voiceGlowDriveLevel(props.level)
})
</script>

<template>
  <div v-if="visible" class="tx-ai-voice-draft" role="status" aria-live="polite">
    <div class="tx-ai-voice-draft__beam-wrap" aria-hidden="true">
      <TxVoiceBeam
        class="tx-ai-voice-draft__beam"
        type="pill"
        theme="auto"
        :scale="0.6"
        :active="visible"
        :level="beamLevel"
      />
    </div>
    <span class="tx-ai-voice-draft__dot" aria-hidden="true" />
    <span class="tx-ai-voice-draft__status">{{ statusText }}</span>
    <span v-if="elapsedMs > 0" class="tx-ai-voice-draft__timer">{{ elapsedText }}</span>
    <span v-if="escHint" class="tx-ai-voice-draft__hint">{{ escHint }}</span>
    <button
      type="button"
      class="tx-ai-voice-draft__cancel"
      :aria-label="cancelLabel"
      @click="emit('cancel')"
    >
      {{ cancelLabel }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.tx-ai-voice-draft {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter, rgba(148, 163, 184, 0.1));
  color: var(--tx-text-color-primary, #0f172a);
  font-size: 12px;
  overflow: hidden;
}

.tx-ai-voice-draft__beam-wrap {
  position: relative;
  flex: none;
  width: 28px;
  height: 16px;
  overflow: hidden;
  border-radius: 999px;
}

.tx-ai-voice-draft__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-color-danger, #ef4444);
}

.tx-ai-voice-draft__status {
  font-weight: 500;
  white-space: nowrap;
}

.tx-ai-voice-draft__timer {
  color: var(--tx-text-color-secondary, #64748b);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tx-ai-voice-draft__hint {
  margin-left: auto;
  color: var(--tx-text-color-placeholder, #94a3b8);
  font-size: 11px;
}

.tx-ai-voice-draft__cancel {
  flex: none;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 999px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-regular, #334155);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 1px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-voice-draft__dot {
    animation: tx-ai-voice-dot 1.2s ease-in-out infinite;
  }
}

@keyframes tx-ai-voice-dot {
  0%, 100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
</style>
