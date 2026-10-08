<script lang="ts" name="ComposerToolbar" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { SendState } from './send-state'
import type { DictationOutcome, DictationState } from './useComposerDictation'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HomeModelMenu from '../HomeModelMenu.vue'
import HomePermissionMenu from '../HomePermissionMenu.vue'
import ComposerControl from './ComposerControl.vue'
import ComposerMic from './ComposerMic.vue'
import ComposerModelPill from './ComposerModelPill.vue'
import ComposerSendIsland from './ComposerSendIsland.vue'
import { isCapsuleSendState } from './send-state'

/**
 * The composer's tool row (`home-composer` › 工具条与胶囊): attachments, permission and mode on the
 * left; model, microphone and send on the right. 32px controls, no strokes; the chips are one quiet
 * material.
 *
 * The microphone and the send key live in fixed 32×32 slots, and the send key's stop capsule grows
 * left over the microphone's slot while a reply runs, so nothing in the row reflows. While a
 * dictation session runs (`home-composer` › 语音听写态) the row keeps only what the session needs:
 * the left cluster and the model pill step out — hidden, inert, out of the tab order — and the left
 * side shows the session's status instead. The negative margins put every control's outer edge 8px
 * from the composer's, where a 16px radius is concentric with its 24px corner.
 */
const props = withDefaults(
  defineProps<{
    permissionMode: AgentToolsMode
    model: { label: string; icon?: ITuffIcon; effort?: string }
    sendState: SendState
    micState: DictationState
    /** This build cannot capture audio: the entry is withheld instead of failing on press. */
    micBlocked?: boolean
    micElapsedMs?: number
    micOutcome?: DictationOutcome | null
  }>(),
  { micBlocked: false, micElapsedMs: 0, micOutcome: null }
)

const emit = defineEmits<{
  (event: 'update:permissionMode', mode: AgentToolsMode): void
  (event: 'files', files: File[]): void
  (event: 'send'): void
  (event: 'stop'): void
  (event: 'mic'): void
  (event: 'reset-approvals'): void
}>()

const { t } = useI18n()

const fileInputRef = ref<HTMLInputElement | null>(null)
const islandRef = ref<InstanceType<typeof ComposerSendIsland> | null>(null)

/** The stop capsule covers the microphone's slot (the island says when). */
const micYielded = ref(isCapsuleSendState(props.sendState))

const dictating = computed(() => props.micState !== 'idle')

const timerText = computed(() => {
  const seconds = Math.max(0, Math.floor(props.micElapsedMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

/** What a screen reader hears, once per state — never the ticking timer. */
const liveStatus = computed(() => {
  switch (props.micState) {
    case 'starting':
      return t('assistant.voicePanel.voicePreparing')
    case 'listening':
      return t('home.composer.dictationListening')
    case 'finishing':
      return t('home.composer.dictationFinishing')
    default:
      return props.micOutcome === 'inserted' ? t('home.composer.dictationInserted') : ''
  }
})

function onFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('files', Array.from(input.files ?? []))
  // Clearing lets the same file be picked twice in a row.
  input.value = ''
}

/** T3, at the press — `submit()` calls it right after its guard. */
function launch(): void {
  islandRef.value?.launch()
}

defineExpose({ launch })
</script>

<template>
  <div class="ComposerToolbar" :class="{ 'is-dictating': dictating }">
    <div
      class="ComposerToolbar-Left"
      :inert="dictating || undefined"
      :aria-hidden="dictating || undefined"
    >
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="ComposerToolbar-FileInput"
        tabindex="-1"
        :aria-label="t('home.attach')"
        @change="onFilePick"
      />
      <!-- Usable while a reply streams: attachments wait in the tray for the next send. -->
      <ComposerControl :label="t('home.attach')" @click="fileInputRef?.click()">
        <span class="i-ri-add-line" />
      </ComposerControl>
      <HomePermissionMenu
        :mode="permissionMode"
        @update:mode="emit('update:permissionMode', $event)"
        @reset="emit('reset-approvals')"
      />
      <!-- The host's execution controls: Chat / Agent and its profile, and the queue key while Main
           is busy. Left of the model so the row reads "how" before "with what". -->
      <slot name="mode" />
    </div>

    <!-- The session's state where the left cluster was. Drawn for the eye only: the timer ticks
         every second, so the screen reader gets the state alone, below. -->
    <div class="ComposerToolbar-Status" :data-state="micState" aria-hidden="true">
      <template v-if="micState === 'listening'">
        <span class="ComposerToolbar-RecDot" />
        <span>{{ t('home.composer.dictationListening') }}</span>
        <span class="ComposerToolbar-Timer">{{ timerText }}</span>
        <span class="ComposerToolbar-EscHint">· {{ t('home.composer.dictationEscHint') }}</span>
      </template>
      <template v-else-if="dictating">
        <span class="ComposerToolbar-Spinner i-ri-loader-4-line" />
        <span>{{
          micState === 'finishing'
            ? t('home.composer.dictationFinishing')
            : t('assistant.voicePanel.voicePreparing')
        }}</span>
      </template>
    </div>
    <span class="ComposerToolbar-LiveStatus" role="status" aria-live="polite">{{
      liveStatus
    }}</span>

    <div class="ComposerToolbar-Right">
      <div
        class="ComposerToolbar-ModelSlot"
        :class="{ 'is-yielded': dictating }"
        :inert="dictating || undefined"
        :aria-hidden="dictating || undefined"
      >
        <HomeModelMenu placement="top-end">
          <template #trigger="{ open }">
            <ComposerModelPill
              :label="model.label"
              :icon="model.icon"
              :effort="model.effort"
              :open="open"
            />
          </template>
        </HomeModelMenu>
      </div>
      <!--
        Withheld, not disabled, when this build has no audio component: the slot is removed so the
        send key takes its place. A disabled button would pose a question the app already knows the
        answer to, and the status read that decided this is the same one a session would fail on.
      -->
      <div v-if="!micBlocked" class="ComposerToolbar-MicSlot">
        <ComposerMic :state="micState" :yielded="micYielded" @toggle="emit('mic')" />
      </div>
      <div class="ComposerToolbar-SendSlot">
        <ComposerSendIsland
          ref="islandRef"
          :state="sendState"
          :send-label="micState === 'idle' ? t('home.send') : t('home.composer.finishAndSend')"
          :stop-label="t('home.stop')"
          :stop-text="t('home.composer.stop')"
          @send="emit('send')"
          @stop="emit('stop')"
          @yield="micYielded = $event"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ComposerToolbar {
  // HomePermissionMenu's and the mode menu's chips fold to icon keys through this container, not
  // the viewport.
  container: home-composer-tools / inline-size;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  // The composer pads 16 / 16 / 12 inside a 1px border; pulling the row out 9px sideways and 5px
  // down puts the controls' outer edges 8px from the composer's: 16 + 8 = 24, its corner radius.
  margin: 0 -9px -5px;
}

.ComposerToolbar-Left,
.ComposerToolbar-Right {
  display: flex;
  // The stop capsule's 72px is the microphone's 32 + this gap + the send key's 32.
  gap: 8px;
  align-items: center;
}

.ComposerToolbar-Right {
  position: relative;
}

// The picker is reached through `+`; the input itself never shows.
.ComposerToolbar-FileInput {
  display: none;
}

// While dictating: gone from sight and the pointer (`inert` takes it out of focus).
.ComposerToolbar.is-dictating .ComposerToolbar-Left,
.ComposerToolbar-ModelSlot.is-yielded {
  opacity: 0;
  scale: 0.96;
  pointer-events: none;
}

.ComposerToolbar-Left {
  transform-origin: left center;
}

.ComposerToolbar-ModelSlot {
  flex: none;
  transform-origin: right center;
}

.ComposerToolbar-Status {
  position: absolute;
  top: 0;
  left: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  height: 32px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  white-space: nowrap;
  // The glow rises behind this line at full voice, and muted ink drowned in it (the timer and the
  // hint fell to ~1.3:1 at the peak). The whole line keeps the secondary ink, and a halo in the
  // composer's own surface holds the glow off the letters; the hint stays smaller instead.
  text-shadow:
    0 0 3px var(--shell-bg),
    0 0 8px var(--shell-bg),
    0 0 14px var(--shell-bg);
  opacity: 0;
  pointer-events: none;

  .ComposerToolbar.is-dictating & {
    opacity: 1;
  }
}

.ComposerToolbar-RecDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--shell-danger);
}

.ComposerToolbar-Timer {
  font-variant-numeric: tabular-nums;
}

.ComposerToolbar-EscHint {
  font-size: var(--shell-fs-sm);
}

.ComposerToolbar-Spinner {
  width: 13px;
  height: 13px;
  color: var(--shell-text-muted);
  font-size: 13px;
}

.ComposerToolbar-LiveStatus {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

// Fixed 32×32 at every state: the stop capsule grows over the microphone's slot, never into the row.
.ComposerToolbar-MicSlot,
.ComposerToolbar-SendSlot {
  position: relative;
  flex: none;
  width: 32px;
  height: 32px;
}

// Stacked so the capsule paints over the slot it covers.
.ComposerToolbar-MicSlot {
  z-index: 1;
}

.ComposerToolbar-SendSlot {
  z-index: 2;
}

@media (prefers-reduced-motion: no-preference) {
  .ComposerToolbar-Left,
  .ComposerToolbar-ModelSlot {
    transition:
      opacity 160ms cubic-bezier(0.23, 1, 0.32, 1),
      scale 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .ComposerToolbar-Status {
    transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1) 80ms;
  }

  .ComposerToolbar-RecDot {
    animation: composer-rec-breathe 1.4s ease-in-out infinite;
  }

  .ComposerToolbar-Spinner {
    animation: composer-status-spin 0.9s linear infinite;
  }
}

@keyframes composer-rec-breathe {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}

@keyframes composer-status-spin {
  to {
    rotate: 360deg;
  }
}
</style>
