<script lang="ts" name="ComposerToolbar" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { WorkspaceQueueDeliveryMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { SendState } from './send-state'
import type { DictationOutcome, DictationState } from './useComposerDictation'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { vTdsLiveAnimation } from '~/modules/style/live-animation-clock'
import HomeModelMenu from '../HomeModelMenu.vue'
import HomePermissionMenu from '../HomePermissionMenu.vue'
import ComposerControl from './ComposerControl.vue'
import ComposerMic from './ComposerMic.vue'
import ComposerModelPill from './ComposerModelPill.vue'
import ComposerSendIsland from './ComposerSendIsland.vue'
import { isCapsuleSendState } from './send-state'

/**
 * The composer's tool row (`home-composer` › 工具条与胶囊): attachments and permission on the left;
 * the model pill (which also names the scheduler), microphone and send on the right. 32px
 * controls, no strokes; the chips are one quiet material.
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
    model: { label: string; icon?: ITuffIcon; effort?: string; scheduler?: string }
    sendState: SendState
    sendQueues?: boolean
    /** A reply is currently streaming; keeps a compact Stop key reachable while drafting a steer/queue message. */
    live?: boolean
    /** Active Agent run supports mid-turn steer delivery at the next tool/step boundary. */
    canSteer?: boolean
    /** Selected mid-run delivery mode (`'steer'` vs `'queue'`). */
    deliveryMode?: WorkspaceQueueDeliveryMode
    micState: DictationState
    /** This build cannot capture audio: the entry is withheld instead of failing on press. */
    micBlocked?: boolean
    micElapsedMs?: number
    micOutcome?: DictationOutcome | null
    /** Hide Tuff's local tool-permission menu for external hosts (e.g. Herdr CLI sessions). */
    hidePermissionMenu?: boolean
    /** Show the model/provider pill as a non-interactive read-only badge (no model picker popover). */
    readonlyModel?: boolean
  }>(),
  {
    sendQueues: false,
    live: false,
    canSteer: false,
    deliveryMode: 'queue',
    micBlocked: false,
    micElapsedMs: 0,
    micOutcome: null,
    hidePermissionMenu: false,
    readonlyModel: false
  }
)

const emit = defineEmits<{
  (event: 'update:permissionMode', mode: AgentToolsMode): void
  (event: 'update:deliveryMode', mode: WorkspaceQueueDeliveryMode): void
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
const steerActive = computed(
  () => props.sendQueues && props.canSteer && props.deliveryMode === 'steer'
)
/** While streaming with a draft in the field, keep a compact 32px Stop button in the mic slot. */
const showCompactStop = computed(
  () => props.live && !isCapsuleSendState(props.sendState) && !dictating.value
)
const showSteerToggle = computed(
  () => props.canSteer && props.sendQueues && props.sendState === 'ready' && !dictating.value
)

function toggleDeliveryMode(): void {
  emit('update:deliveryMode', props.deliveryMode === 'steer' ? 'queue' : 'steer')
}

const timerText = computed(() => {
  const seconds = Math.max(0, Math.floor(props.micElapsedMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

const sendLabel = computed(() => {
  if (steerActive.value) return t('home.workspace.queue.steerAdd')
  if (props.sendQueues) return t('home.workspace.queue.add')
  return props.micState === 'idle' ? t('home.send') : t('home.composer.finishAndSend')
})

const sendTitle = computed(() => {
  if (steerActive.value) return t('home.workspace.queue.steerAddHint')
  if (props.sendQueues) return t('home.workspace.queue.addHint')
  return undefined
})

const sendIcon = computed(() => {
  if (steerActive.value) return 'i-ri-corner-down-right-line'
  if (props.sendQueues) return 'i-ri-play-list-add-line'
  return 'i-ri-arrow-up-line'
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
      <div v-if="!hidePermissionMenu || $slots.mode" class="ComposerToolbar-Badges">
        <HomePermissionMenu
          v-if="!hidePermissionMenu"
          :mode="permissionMode"
          @update:mode="emit('update:permissionMode', $event)"
          @reset="emit('reset-approvals')"
        />
        <!-- Surface-specific mode controls (the browser landing's Browse / Ask). The scheduler is
             not here: it lives in the model pill's popover. -->
        <slot name="mode" />
      </div>
    </div>

    <!-- The session's state where the left cluster was. Drawn for the eye only: the timer ticks
         every second, so the screen reader gets the state alone, below. -->
    <div class="ComposerToolbar-Status" :data-state="micState" aria-hidden="true">
      <template v-if="micState === 'listening'">
        <span v-tds-live-animation="'pulse'" class="ComposerToolbar-RecDot" />
        <span>{{ t('home.composer.dictationListening') }}</span>
        <span class="ComposerToolbar-Timer">{{ timerText }}</span>
        <span class="ComposerToolbar-EscHint">· {{ t('home.composer.dictationEscHint') }}</span>
      </template>
      <template v-else-if="dictating">
        <span v-tds-live-animation="'spin'" class="ComposerToolbar-Spinner i-ri-loader-4-line" />
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
        <!-- Scheduler and model are one control: the pill names both (「Tuff Pi › model · 档位」)
             and its one popover carries the scheduler row above the reasoning effort. External
             runtimes (e.g. Herdr sessions) pass `readonlyModel` to show host identity without
             offering a misleading local model picker. -->
        <span
          v-if="readonlyModel"
          class="ComposerToolbar-ReadonlyModel"
          data-testid="composer-readonly-model"
        >
          <span v-if="model.scheduler" class="ComposerToolbar-ReadonlyPrefix">
            <span>{{ model.scheduler }}</span>
            <span class="ComposerToolbar-ReadonlySep i-ri-arrow-right-s-line" aria-hidden="true" />
          </span>
          <TxIcon
            v-if="model.icon"
            class="ComposerToolbar-ReadonlyIcon"
            :icon="model.icon"
            :size="14"
          />
          <span class="ComposerToolbar-ReadonlyLabel">{{ model.label }}</span>
          <span v-if="model.effort" class="ComposerToolbar-ReadonlySuffix"
            >· {{ model.effort }}</span
          >
        </span>
        <HomeModelMenu v-else placement="top-end">
          <template #trigger="{ open }">
            <ComposerModelPill
              :label="model.label"
              :icon="model.icon"
              :effort="model.effort"
              :scheduler="$slots.scheduler ? model.scheduler : undefined"
              :open="open"
            />
          </template>
          <template v-if="$slots.scheduler" #foot-lead>
            <slot name="scheduler" />
          </template>
        </HomeModelMenu>
      </div>
      <button
        v-if="showSteerToggle"
        type="button"
        class="ComposerToolbar-SteerToggle"
        :class="{ 'is-steer': steerActive }"
        :aria-pressed="steerActive"
        :title="
          steerActive
            ? t('home.workspace.queue.switchToQueue')
            : t('home.workspace.queue.switchToSteer')
        "
        @click="toggleDeliveryMode"
      >
        <span
          :class="steerActive ? 'i-ri-corner-down-right-line' : 'i-ri-play-list-2-line'"
          aria-hidden="true"
        />
        <span>{{
          steerActive ? t('home.workspace.queue.steerMode') : t('home.workspace.queue.queueMode')
        }}</span>
      </button>
      <!--
        Withheld, not disabled, when this build has no audio component: the slot is removed so the
        send key takes its place. While a reply streams and the user types a steer/queue draft,
        this fixed 32×32 slot hosts the compact Stop button so stopping stays one click away.
      -->
      <div v-if="!micBlocked || showCompactStop" class="ComposerToolbar-MicSlot">
        <ComposerMic
          v-if="!micBlocked"
          :state="micState"
          :yielded="micYielded || showCompactStop"
          @toggle="emit('mic')"
        />
        <button
          v-if="showCompactStop"
          type="button"
          class="ComposerToolbar-StopKey"
          :aria-label="t('home.stop')"
          :title="t('home.stop')"
          @click="emit('stop')"
        >
          <span class="ComposerToolbar-StopSquare" aria-hidden="true" />
        </button>
      </div>
      <div class="ComposerToolbar-SendSlot">
        <ComposerSendIsland
          ref="islandRef"
          :state="sendState"
          :send-label="sendLabel"
          :send-title="sendTitle"
          :send-icon="sendIcon"
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
  gap: 8px;
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
.ComposerToolbar-Badges {
  display: flex;
  gap: 8px;
  align-items: center;
  opacity: 0;
  transform: translateX(-4px);
  pointer-events: none;

  @media (prefers-reduced-motion: no-preference) {
    transition:
      opacity 0.25s cubic-bezier(0.2, 0, 0, 1),
      transform 0.25s cubic-bezier(0.2, 0, 0, 1);
  }

  .ComposerToolbar:hover &,
  &:focus-within,
  &.is-active {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    transform: none;
  }
}

.ComposerToolbar-Right {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
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
  flex: none;
  transform-origin: left center;
}

.ComposerToolbar-ModelSlot {
  display: flex;
  align-items: center;
  height: 32px;
  flex: 0 1 auto;
  min-width: 0;
  transform-origin: right center;

  // Let the popover reference wrappers shrink with the slot so a long model name ellipsizes
  // instead of pushing the microphone and send keys past the composer's right edge.
  :deep(.tx-base-anchor__reference),
  :deep(.tx-tooltip__reference),
  :deep(.tx-popover__reference) {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
  }
}

.ComposerToolbar-ReadonlyModel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(320px, 100%);
  height: 32px;
  padding: 0 10px;
  border-radius: var(--shell-radius-full);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  user-select: none;
}

.ComposerToolbar-ReadonlyPrefix {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 1px;
  margin-right: -2px;
  color: var(--shell-text-muted);
  font-weight: 400;
}

.ComposerToolbar-ReadonlySep {
  width: 14px;
  height: 14px;
  color: var(--shell-text-muted);
}

.ComposerToolbar-ReadonlyIcon {
  flex: none;
}

.ComposerToolbar-ReadonlyLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--shell-text-regular);
}

.ComposerToolbar-ReadonlySuffix {
  flex: none;
  color: var(--shell-text-muted);
  font-weight: 400;
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

.ComposerToolbar-SteerToggle {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 14px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  appearance: none;

  &:hover {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &.is-steer {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &.is-steer:hover {
    background: color-mix(in srgb, var(--shell-primary) 18%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }
}

.ComposerToolbar-StopKey {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: var(--shell-text-primary);
  color: var(--shell-bg);
  cursor: pointer;
  appearance: none;

  &:hover {
    background: color-mix(in srgb, var(--shell-text-primary) 86%, var(--shell-bg));
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }
}

.ComposerToolbar-StopSquare {
  width: 10px;
  height: 10px;
  border-radius: 2.5px;
  background: currentColor;
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
    animation: composer-rec-breathe 1440ms steps(16, end) infinite;
  }

  .ComposerToolbar-Spinner {
    animation: composer-status-spin 1080ms steps(12, end) infinite;
  }

  html[data-live-anim-clock='active'] .ComposerToolbar-RecDot,
  html[data-live-anim-clock='active'] .ComposerToolbar-Spinner,
  html.tds-reduced-motion .ComposerToolbar-RecDot,
  html.tds-reduced-motion .ComposerToolbar-Spinner,
  html[data-live-anim-state='suppressed'] .ComposerToolbar-RecDot,
  html[data-live-anim-state='suppressed'] .ComposerToolbar-Spinner {
    animation: none;
  }

  html.is-window-moving .ComposerToolbar-RecDot,
  html.is-window-moving .ComposerToolbar-Spinner,
  html[data-live-anim-state='paused'] .ComposerToolbar-RecDot,
  html[data-live-anim-state='paused'] .ComposerToolbar-Spinner {
    animation-play-state: paused;
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
