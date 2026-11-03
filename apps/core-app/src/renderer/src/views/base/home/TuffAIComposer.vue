<script lang="ts" name="TuffAIComposer" setup>
import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { ITuffIcon } from '@talex-touch/utils'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { SendState } from './composer/send-state'
import type { useComposerDictation } from './composer/useComposerDictation'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { TxVoiceBeam } from '@talex-touch/tuffex/voice-beam'
import { usePreferredReducedMotion } from '@vueuse/core'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolvedTheme } from '~/modules/storage/theme-style'
import ComposerToolbar from './composer/ComposerToolbar.vue'
import { voiceGlowDriveLevel, voiceGlowLobes, voiceGlowResponse } from './composer/voice-glow'

/**
 * The Home composer: the box a message is written in. The beam on its edge, the dictation glow under
 * its content, the attachment tray, the field, the tool row (`composer/`) and the draft ghost a send
 * fades out.
 *
 * It owns the box's look and nothing about what a send *does*: the draft, attachments, dictation
 * session and send state come in; every press goes back out as an event. The three elements the
 * page's send choreography and dictation measure (`box`, `input`, `ghost`) and the send key's
 * `launch()` are exposed, so the page keeps reading the same nodes it always did.
 */
interface Props {
  /** Field placeholder; doubles as its accessible name. */
  placeholder: string
  attachments: AiAttachment[]
  /** Label formatter for a tray image's open button (`useHomeAttachments`). */
  attachOpenLabel: (name: string) => string
  /** Viewer labels handed to the tray's preview (`useHomeAttachments`). */
  attachPreviewProps: Record<string, unknown>
  /** The field is inert (a browser navigation is in flight). */
  inputDisabled?: boolean
  /** Files are being dragged over the box. */
  dragover?: boolean
  /** A reply is streaming: gates the send key's stop ring. */
  live?: boolean
  /** The sent text is still lifting off the box. */
  lifting?: boolean
  /** The border beam runs (untouched Home only). */
  beamActive?: boolean
  dictation: ReturnType<typeof useComposerDictation>
  model: { label: string; icon?: ITuffIcon; effort?: string }
  sendState: SendState
  sendQueues?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  inputDisabled: false,
  dragover: false,
  live: false,
  lifting: false,
  beamActive: false,
  sendQueues: false
})

const draft = defineModel<string>('draft', { required: true })
const permissionMode = defineModel<AgentToolsMode>('permissionMode', { required: true })

const emit = defineEmits<{
  (event: 'input'): void
  (event: 'input-keydown', e: KeyboardEvent): void
  (event: 'box-keydown', e: KeyboardEvent): void
  (event: 'paste', e: ClipboardEvent): void
  (event: 'dragenter' | 'dragover' | 'dragleave' | 'drop', e: DragEvent): void
  (event: 'remove', id: string): void
  (event: 'files', files: File[]): void
  (event: 'send'): void
  (event: 'stop'): void
  (event: 'mic'): void
  (event: 'reset-approvals'): void
}>()

const { t } = useI18n()

const boxRef = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const ghostEl = ref<HTMLElement | null>(null)
const toolbarRef = ref<InstanceType<typeof ComposerToolbar> | null>(null)

/**
 * The dictation glow's level, sampled by TxVoiceBeam once per frame: the newest of the session's
 * ~10 Hz level frames while it listens, silence otherwise. A getter, so the frames never re-render
 * the page; the glow's own attack and release smooth between them (`voice-glow.ts` sets both, and
 * maps the level onto the beam's range).
 */
function dictationLevel(): number {
  if (props.dictation.state.value !== 'listening') return 0
  return voiceGlowDriveLevel(props.dictation.levels.value.at(-1) ?? 0)
}

/** The glow's envelope: quick enough to follow words, the beam's own calmer one under reduced motion. */
const reducedMotion = usePreferredReducedMotion()

/**
 * The glow's lobes, read off the composer's live rim (`--home-live-stops`) once the box is mounted.
 * Until then the beam keeps its own palette, which nothing shows: dictation starts in that box.
 */
const voiceGlowColors = ref<string[]>([])
onMounted(() => {
  const box = boxRef.value
  if (box) {
    voiceGlowColors.value = voiceGlowLobes(
      getComputedStyle(box).getPropertyValue('--home-live-stops')
    )
  }
})

/** T3, at the press — `submit()` calls it right after its guard. */
function launch(): void {
  toolbarRef.value?.launch()
}

defineExpose({ box: boxRef, input: inputEl, ghost: ghostEl, launch })
</script>

<template>
  <!-- The beam wraps rather than decorates: it draws on the composer's own edge, and
       reads that edge's 24px radius off the element in its slot. -->
  <TxBorderBeam class="TuffAIComposer" size="pulse-outside" :active="beamActive">
    <div
      ref="boxRef"
      class="TuffAIComposer-Box"
      :class="{
        'is-dragover': dragover,
        'is-live': live,
        'is-lifting': lifting
      }"
      @dragenter="emit('dragenter', $event)"
      @dragover="emit('dragover', $event)"
      @dragleave="emit('dragleave', $event)"
      @drop="emit('drop', $event)"
      @keydown="emit('box-keydown', $event)"
    >
      <!-- The dictation glow rides inside the box as an overlay rather than wrapping it:
           the beam's wrapper clips, and wrapping would cut the composer's own shadow and
           focus ring. 「正在识别」 gathers it into the travelling processing beam. -->
      <TxVoiceBeam
        class="TuffAIComposer-VoiceGlow"
        v-bind="voiceGlowResponse(reducedMotion === 'reduce')"
        :active="dictation.active.value"
        :level="dictationLevel"
        :processing="dictation.state.value === 'finishing'"
        :theme="resolvedTheme"
        :colors="voiceGlowColors"
        :border-radius="24"
        :scale="1.2"
        aria-hidden="true"
      >
        <div class="TuffAIComposer-VoiceGlowHost" />
      </TxVoiceBeam>

      <TxAttachmentTray
        v-if="attachments.length"
        class="TuffAIComposer-Tray"
        :attachments="attachments"
        removable
        :remove-label="t('home.attachRemove')"
        :cancel-label="t('home.attachCancel')"
        :preview-title="t('home.attachPreview')"
        :previous-label="t('home.attachPrevious')"
        :next-label="t('home.attachNext')"
        :previous-text="t('home.attachPreviousText')"
        :next-text="t('home.attachNextText')"
        :close-label="t('common.close')"
        :zoom-in-label="t('home.attachViewer.zoomIn')"
        :zoom-out-label="t('home.attachViewer.zoomOut')"
        :reset-label="t('home.attachViewer.reset')"
        :failed-text="t('home.attachViewer.failed')"
        :open-label-formatter="attachOpenLabel"
        :preview-props="attachPreviewProps"
        @remove="emit('remove', $event)"
      />

      <!-- Read-only while dictating: the words land at the caret, and neither a keystroke
           nor an IME can move the range under them. -->
      <textarea
        ref="inputEl"
        v-model="draft"
        class="TuffAIComposer-Input"
        rows="1"
        :aria-label="placeholder"
        :placeholder="placeholder"
        :readonly="dictation.active.value"
        :disabled="inputDisabled"
        @input="emit('input')"
        @keydown="emit('input-keydown', $event)"
        @paste="emit('paste', $event)"
      />

      <!-- One family of 32px controls (`composer/`); the send key is an island that grows
           into 「■ 停止」 over the microphone's slot without moving a neighbour. -->
      <ComposerToolbar
        ref="toolbarRef"
        v-model:permission-mode="permissionMode"
        :model="model"
        :send-state="sendState"
        :send-queues="sendQueues"
        :mic-state="dictation.state.value"
        :mic-blocked="dictation.captureBlocked.value"
        :mic-elapsed-ms="dictation.elapsedMs.value"
        :mic-outcome="dictation.outcome.value"
        @files="emit('files', $event)"
        @send="emit('send')"
        @stop="emit('stop')"
        @mic="emit('mic')"
        @reset-approvals="emit('reset-approvals')"
      >
        <template #mode>
          <slot name="mode" />
        </template>
      </ComposerToolbar>

      <!-- A wrapped draft as it sat, fading out while the lifted bubble's own lines fade in
           (~140ms); empty otherwise. -->
      <div class="TuffAIComposer-Ghost" aria-hidden="true">
        <div ref="ghostEl" class="TuffAIComposer-GhostText" />
      </div>
    </div>
  </TxBorderBeam>
</template>

<style lang="scss" scoped>
/**
 * The beam is a wrapper, so it owns the lane: the beam draws on its own border box and the composer
 * fills it. Keeping `--home-chat-lane-width` here alone is what stops the `100%` inside that token
 * from resolving against a shrink-to-fit parent.
 */
.TuffAIComposer {
  width: var(--home-chat-lane-width);
  min-width: 0;
  position: relative;
  z-index: 2;
}

.TuffAIComposer-Box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 16px 16px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-2xl);
  background: var(--shell-bg);
  /* Always on, even while the background above it is opaque and hides it:
     gaining a backdrop layer mid-dock forces a compositor re-build that can
     flash for a frame — cheaper to keep the layer and fade the paint. */
  backdrop-filter: blur(20px) saturate(180%);
  /* Layered: a tight contact shadow plus a soft ambient one reads as lift
     without the smudge a single big blur gives. */
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
    0 8px 24px var(--shell-shadow);
  box-sizing: border-box;
  --home-glow-on: 0;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    --home-glow-on 0.6s ease;

  &:focus-within {
    border-color: var(--shell-primary);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
      0 10px 30px var(--shell-shadow),
      0 0 0 3px color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }

  /* The box itself stays plain while a response runs: the border carries no light. `is-live`
     only sets the gate below, which the send key's stop ring (`composer/ComposerSendIsland.vue`)
     reads to fade in and out with the run. */
  &.is-live {
    --home-glow-on: 1;
  }

  /**
   * Floating form. The fill drops to translucent so the always-on backdrop
   * blur has something to show — the swap rides the background transition,
   * so the material change is a fade, not a cut. The shadow deepens because
   * the box now has live content sliding underneath it rather than a flat
   * page.
   */
  .HomePage.conversing & {
    background: color-mix(in srgb, var(--shell-bg) 72%, transparent);
    box-shadow: 0 6px 24px var(--shell-shadow);
    pointer-events: auto;
  }

  /* Files hovering over the box: the border switches to an invitation. */
  &.is-dragover {
    border-style: dashed;
    border-color: var(--shell-primary);
  }
}

/**
 * The dictation glow (TuffEx `TxVoiceBeam`) as an overlay on the box: its wrapper clips to the
 * composer's 24px corners and sits under everything the box holds. The beam's own stylesheet makes
 * its wrapper `position: relative`; the child selector outranks that single attribute selector.
 */
.TuffAIComposer-Box > .TuffAIComposer-VoiceGlow {
  position: absolute;
  inset: -1px;
  z-index: 0;
  pointer-events: none;
}

.TuffAIComposer-VoiceGlowHost {
  width: 100%;
  height: 100%;
}

/* The box's content paints above the glow's layers. */
.TuffAIComposer-Box > .TuffAIComposer-Tray,
.TuffAIComposer-Box > .TuffAIComposer-Input,
.TuffAIComposer-Box > .ComposerToolbar {
  position: relative;
  z-index: 1;
}

.TuffAIComposer-Box:hover :deep(.ComposerToolbar-Badges),
.TuffAIComposer-Box:focus-within :deep(.ComposerToolbar-Badges) {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.TuffAIComposer-Input {
  width: 100%;
  max-height: 200px;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-md);
  line-height: 1.5;
  resize: none;
  // The focus indicator is promoted to the whole composer via `:focus-within`, so it outlines
  // what reads as the field instead of drawing a second ring inside the card.
  outline: none;
}

textarea.TuffAIComposer-Input:focus-visible {
  outline: none;
  box-shadow: none;
}

.TuffAIComposer-Input::placeholder {
  color: var(--shell-text-muted);
  // The way back in once a lifted send has cleared the box; the way out is instant (below).
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* The sent text is still lifting off the composer: an empty field's placeholder under it would read
   as two texts at once. */
.TuffAIComposer-Box.is-lifting .TuffAIComposer-Input::placeholder {
  color: transparent;
  transition: none;
}

/**
 * A wrapped draft where it sat in the textarea (`fadeDraft`), fading out while the lifted bubble's
 * own lines fade in over it. Empty outside a send.
 */
.TuffAIComposer-Ghost {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

/* Typeset like `.TuffAIComposer-Input`, and like a textarea wraps, so the first frame is the draft. */
.TuffAIComposer-GhostText {
  position: absolute;
  margin: 0;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-md);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>
