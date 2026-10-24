<script setup lang="ts">
import type { AiAttachment } from '../../ai-elements/src/types'
import { computed } from 'vue'
import { BrokenImageIcon } from '../../../../utils/broken-image-icon'

// Internal: the image cell of TxAttachmentTray, the counterpart of TxAttachmentChip.
// Not exported — the tray owns the viewer and the failed-URL set it reads from.
defineOptions({ name: 'TxAttachmentThumb' })

const props = defineProps<{
  attachment: AiAttachment & { kind: 'image' }
  removable: boolean
  /** The image failed to load: draw the placeholder instead. */
  broken: boolean
  openLabel: string
  removeLabel: string
  cancelLabel: string
}>()

const emit = defineEmits<{
  open: []
  remove: [id: string]
  cancel: [id: string]
  error: []
}>()

const RING_RADIUS = 8
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const ringOffset = computed(() => {
  const clamped = Math.min(1, Math.max(0, props.attachment.progress ?? 0))
  return RING_CIRCUMFERENCE * (1 - clamped)
})

// The viewer gives focus back to whatever held it when it opened, and WebKit does not focus
// a clicked button: hand it the thumbnail first.
function onOpen(event: MouseEvent): void {
  (event.currentTarget as HTMLButtonElement).focus()
  emit('open')
}

// One button for both: when an upload finishes in removable mode it stays in place and
// only its label changes, so keyboard focus on it survives.
function onAction(): void {
  if (props.attachment.uploading)
    emit('cancel', props.attachment.id)
  else
    emit('remove', props.attachment.id)
}
</script>

<template>
  <div
    class="tx-attachment-tray__cell"
    :class="{ 'is-uploading': attachment.uploading }"
    :data-id="attachment.id"
  >
    <button
      type="button"
      class="tx-attachment-tray__thumb"
      :aria-label="openLabel"
      @click="onOpen"
    >
      <BrokenImageIcon v-if="broken" class="tx-attachment-tray__broken" :size="20" :stroke-width="2" />
      <img
        v-else
        :src="attachment.url"
        :alt="attachment.name ?? ''"
        loading="lazy"
        @error="emit('error')"
      >
    </button>

    <span v-if="attachment.uploading" class="tx-attachment-tray__progress" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke-width="2.5">
        <circle cx="10" cy="10" :r="RING_RADIUS" stroke="#fff" stroke-opacity="0.55" />
        <circle
          class="tx-attachment-tray__progress-arc"
          cx="10"
          cy="10"
          :r="RING_RADIUS"
          stroke="currentColor"
          stroke-linecap="round"
          transform="rotate(-90 10 10)"
          :stroke-dasharray="RING_CIRCUMFERENCE"
          :stroke-dashoffset="ringOffset"
        />
      </svg>
    </span>

    <button
      v-if="attachment.uploading || removable"
      type="button"
      class="tx-attachment-tray__remove"
      :aria-label="attachment.uploading ? cancelLabel : removeLabel"
      @click="onAction"
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<style lang="scss">
.tx-attachment-tray__cell {
  position: relative;
}

.tx-attachment-tray__thumb {
  display: grid;
  // One cell the size of the tile. An auto row would grow to a portrait's own height, which the
  // picture's 100% height then resolves against, and the tile would show the picture's top two
  // thirds instead of its middle; the preview, flying from the picture's box, would start below it.
  grid-template: 100% / 100%;
  place-items: center;
  width: var(--tx-attachment-tray-thumb-size, 72px);
  height: var(--tx-attachment-tray-thumb-size, 72px);
  padding: 0;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 12px;
  background: var(--tx-fill-color, #f0f2f5);
  color: var(--tx-text-color-secondary, #6b7280);
  overflow: hidden;
  cursor: zoom-in;
}

// (0,2,1) outranks host typography such as `.prose img` margins, whatever order the
// sheets load in; a margin there pushes the picture down inside the clipped tile.
.tx-attachment-tray .tx-attachment-tray__thumb img {
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
}

.tx-attachment-tray__cell.is-uploading img {
  opacity: 0.55;
}

.tx-attachment-tray__progress {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--tx-color-primary, #409eff);
  pointer-events: none;
}

// Inside the tile corner, concentric with it (12px radius - 4px inset).
.tx-attachment-tray__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 8px;
  // Not `--tx-fill-color-blank`, which is transparent in the dark theme.
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;
  opacity: 0;

  &:hover {
    color: var(--tx-color-danger, #f56c6c);
  }
}

// Revealed by hover, by keyboard focus anywhere in the cell so a tabbed-to button is
// never invisible, and always where there is no hover.
.tx-attachment-tray__cell:is(:hover, :focus-within) .tx-attachment-tray__remove {
  opacity: 1;
}

@media (hover: none) {
  .tx-attachment-tray__remove {
    opacity: 1;
  }
}

:is(.tx-attachment-tray__thumb, .tx-attachment-tray__remove):focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-attachment-tray__remove {
    transition: opacity 0.15s;
  }

  .tx-attachment-tray__progress-arc {
    transition: stroke-dashoffset 0.2s;
  }
}
</style>
