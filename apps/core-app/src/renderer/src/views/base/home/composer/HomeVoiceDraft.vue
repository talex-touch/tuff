<script lang="ts" name="HomeVoiceDraft" setup>
import type { DictationClip } from './useComposerDictation'
import { TxVoiceClip } from '@talex-touch/tuffex/voice-clip'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeDictationNotice } from './dictation-notice'

/**
 * The composer's voice clip, waiting at the end of the conversation (TuffEx `TxVoiceClip` plus
 * what only the composer knows): what became of its words, and the two ways on — recognize it
 * again, or send the voice itself. It shows whatever the recognition did, success included, so the
 * audio is never lost behind a failed transcription.
 */
const props = defineProps<{
  clip: DictationClip
  /** A dictation is running: its words are landing, so the clip cannot be recognized again. */
  dictating: boolean
  /** Nothing can be sent from here right now (Main unreachable, off the Home route). */
  sendBlocked: boolean
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'send'): void
  (event: 'dismiss'): void
}>()

const { t, locale } = useI18n()

/** Main let the audio go (a restart, the backstop sweep): nothing is left to replay or send. */
const expired = computed(() => props.clip.failure?.detail === 'VOICE_RECORDING_NOT_FOUND')

const note = computed(() => {
  const { clip } = props
  if (clip.busy === 'recognizing') return t('home.voiceClip.recognizing')
  if (clip.busy === 'sending') return t('home.voiceClip.sending')
  if (expired.value) return t('home.voiceClip.expired')
  const failure = clip.failure
  // A send found no words to carry: the model reads the transcript, so nothing went out.
  if (failure?.detail === 'VOICE_NOTHING_TO_SEND') return t('home.voiceClip.nothingToSend')
  if (failure?.kind === 'empty' || (!failure && clip.outcome === 'empty'))
    return t('home.voiceClip.empty')
  if (failure)
    return describeDictationNotice(failure.kind, { t, locale: locale.value }, failure.detail)
  return t('home.voiceClip.inserted')
})

const failed = computed(
  () => !props.clip.busy && Boolean(props.clip.failure) && props.clip.failure?.kind !== 'empty'
)

/** The words are already in the draft: sending the voice is the alternative, not the fallback. */
const sendLabel = computed(() =>
  props.clip.outcome === 'inserted' ? t('home.voiceClip.send') : t('home.voiceClip.sendDirect')
)

const actionsDisabled = computed(() => props.clip.busy !== null || expired.value)
</script>

<template>
  <div
    class="HomeVoiceDraft"
    role="group"
    :aria-label="t('home.voiceClip.label')"
    :aria-busy="clip.busy !== null || undefined"
  >
    <TxVoiceClip
      class="HomeVoiceDraft-Clip"
      :src="expired ? '' : clip.recording.url"
      :duration-ms="clip.recording.durationMs"
      :peaks="clip.peaks"
      :play-label="t('home.voiceClip.play')"
      :pause-label="t('home.voiceClip.pause')"
      :seek-label="t('home.voiceClip.seek')"
      :unavailable-label="t('home.voiceClip.unavailable')"
    />
    <div class="HomeVoiceDraft-Footer">
      <p
        class="HomeVoiceDraft-Note"
        :class="{ 'is-failed': failed }"
        :title="clip.failure?.detail"
        role="status"
      >
        {{ note }}
      </p>
      <div class="HomeVoiceDraft-Actions">
        <button
          class="HomeVoiceDraft-Action"
          type="button"
          :disabled="actionsDisabled || dictating"
          @click="emit('retry')"
        >
          {{ t('home.voiceClip.retry') }}
        </button>
        <button
          class="HomeVoiceDraft-Action is-primary"
          type="button"
          :disabled="actionsDisabled || sendBlocked"
          @click="emit('send')"
        >
          {{ sendLabel }}
        </button>
        <button
          class="HomeVoiceDraft-Dismiss"
          type="button"
          :aria-label="t('home.voiceClip.dismiss')"
          :title="t('home.voiceClip.dismiss')"
          :disabled="clip.busy === 'sending'"
          @click="emit('dismiss')"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* Right-aligned like the user's own messages: it is one, not sent yet. */
.HomeVoiceDraft {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 100%;
}

.HomeVoiceDraft-Footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  justify-content: flex-end;
  max-width: 100%;
}

.HomeVoiceDraft-Note {
  min-width: 0;
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;

  &.is-failed {
    color: var(--shell-danger);
  }
}

.HomeVoiceDraft-Actions {
  display: flex;
  gap: 2px;
  align-items: center;
}

.HomeVoiceDraft-Action,
.HomeVoiceDraft-Dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-regular);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.HomeVoiceDraft-Action.is-primary {
  color: var(--shell-primary);
  font-weight: 500;
}

.HomeVoiceDraft-Dismiss {
  width: 24px;
  padding: 0;
  font-size: 14px;
}
</style>
