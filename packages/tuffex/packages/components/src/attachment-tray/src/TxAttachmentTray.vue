<script setup lang="ts">
import type { AiAttachmentFile, AiAttachmentImage } from '../../ai-elements/src/types'
import type { AttachmentTrayEmits, AttachmentTrayProps } from './types'
import { computed, ref } from 'vue'
import TxModal from '../../modal/src/TxModal.vue'
import TxAttachmentChip from './TxAttachmentChip.vue'

defineOptions({ name: 'TxAttachmentTray' })

const props = withDefaults(defineProps<AttachmentTrayProps>(), {
  removable: false,
  previewTitle: 'Preview',
  previousLabel: 'Previous image',
  nextLabel: 'Next image',
  previousText: 'Prev',
  nextText: 'Next',
  removeLabel: 'Remove attachment',
  cancelLabel: 'Cancel upload',
})

const emit = defineEmits<AttachmentTrayEmits>()

type ImageAttachment = AiAttachmentImage & { progress?: number, uploading?: boolean }
type FileAttachment = AiAttachmentFile & { progress?: number, uploading?: boolean }

const images = computed(() =>
  props.attachments.filter((item): item is ImageAttachment => item.kind === 'image'),
)
const files = computed(() =>
  props.attachments.filter((item): item is FileAttachment => item.kind === 'file'),
)

// -- Broken thumbnails become a placeholder instead of a browser broken-image glyph.
const failedImages = ref(new Set<string>())

function markFailed(id: string): void {
  failedImages.value = new Set(failedImages.value).add(id)
}

// -- Preview viewer (TxModal base, same affordances as TxImageGallery) -------

const viewerOpen = ref(false)
const viewerIndex = ref(0)

const viewerItem = computed(() => images.value[viewerIndex.value] ?? null)

function openViewer(index: number): void {
  viewerIndex.value = Math.min(Math.max(0, index), Math.max(0, images.value.length - 1))
  viewerOpen.value = true
}

function viewerPrev(): void {
  if (viewerIndex.value > 0)
    viewerIndex.value -= 1
}

function viewerNext(): void {
  if (viewerIndex.value < images.value.length - 1)
    viewerIndex.value += 1
}

// -- Upload progress ring -----------------------------------------------------

const RING_RADIUS = 8
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function ringOffset(progress: number | undefined): number {
  const clamped = Math.min(1, Math.max(0, progress ?? 0))
  return RING_CIRCUMFERENCE * (1 - clamped)
}
</script>

<template>
  <div class="tx-attachment-tray">
    <div v-if="images.length > 0" class="tx-attachment-tray__grid">
      <div
        v-for="(image, index) in images"
        :key="image.id"
        class="tx-attachment-tray__cell"
        :class="{ 'is-uploading': image.uploading }"
        :data-id="image.id"
      >
        <button
          type="button"
          class="tx-attachment-tray__thumb"
          :aria-label="`${previewTitle}: ${image.name ?? image.id}`"
          @click="openViewer(index)"
        >
          <span v-if="failedImages.has(image.id)" class="tx-attachment-tray__broken" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="m3 15 5-5 4 4 3-3 6 6" />
              <circle cx="9" cy="9" r="1.4" />
            </svg>
          </span>
          <img
            v-else
            :src="image.url"
            :alt="image.name ?? ''"
            loading="lazy"
            @error="markFailed(image.id)"
          >
        </button>

        <span v-if="image.uploading" class="tx-attachment-tray__progress" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="26" height="26">
            <circle class="tx-attachment-tray__progress-track" cx="10" cy="10" :r="RING_RADIUS" />
            <circle
              class="tx-attachment-tray__progress-arc"
              cx="10"
              cy="10"
              :r="RING_RADIUS"
              :stroke-dasharray="RING_CIRCUMFERENCE"
              :stroke-dashoffset="ringOffset(image.progress)"
            />
          </svg>
        </span>

        <button
          v-if="image.uploading"
          type="button"
          class="tx-attachment-tray__remove"
          :aria-label="cancelLabel"
          @click="emit('cancel', image.id)"
        >
          ×
        </button>
        <button
          v-else-if="removable"
          type="button"
          class="tx-attachment-tray__remove"
          :aria-label="removeLabel"
          @click="emit('remove', image.id)"
        >
          ×
        </button>
      </div>
    </div>

    <div v-if="files.length > 0" class="tx-attachment-tray__files">
      <TxAttachmentChip
        v-for="file in files"
        :key="file.id"
        :attachment="file"
        :removable="removable"
        :remove-label="removeLabel"
        :cancel-label="cancelLabel"
        :size-formatter="sizeFormatter"
        @remove="emit('remove', $event)"
        @cancel="emit('cancel', $event)"
        @open="emit('open', $event)"
      />
    </div>

    <TxModal
      v-model="viewerOpen"
      :title="viewerItem?.name || previewTitle"
      width="min(92vw, 880px)"
    >
      <div v-if="viewerItem" class="tx-attachment-tray__viewer">
        <img :src="viewerItem.url" :alt="viewerItem.name ?? ''">
      </div>

      <template #footer>
        <div class="tx-attachment-tray__viewer-footer">
          <button
            type="button"
            class="tx-attachment-tray__nav"
            :aria-label="previousLabel"
            :disabled="viewerIndex <= 0"
            @click="viewerPrev"
          >
            {{ previousText }}
          </button>
          <div class="tx-attachment-tray__count">
            {{ viewerIndex + 1 }} / {{ images.length }}
          </div>
          <button
            type="button"
            class="tx-attachment-tray__nav"
            :aria-label="nextLabel"
            :disabled="viewerIndex >= images.length - 1"
            @click="viewerNext"
          >
            {{ nextText }}
          </button>
        </div>
      </template>
    </TxModal>
  </div>
</template>

<style lang="scss">
.tx-attachment-tray {
  display: grid;
  gap: 8px;

  .tx-attachment-tray__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tx-attachment-tray__cell {
    position: relative;
    width: 72px;
    height: 72px;
  }

  .tx-attachment-tray__thumb {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 12px;
    background: var(--tx-fill-color, #f0f2f5);
    overflow: hidden;
    cursor: zoom-in;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .tx-attachment-tray__cell.is-uploading .tx-attachment-tray__thumb img {
    opacity: 0.55;
  }

  .tx-attachment-tray__broken {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--tx-text-color-secondary, #6b7280);
  }

  .tx-attachment-tray__progress {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;

    .tx-attachment-tray__progress-track {
      fill: none;
      stroke: color-mix(in srgb, #fff 55%, transparent);
      stroke-width: 2.5;
    }

    .tx-attachment-tray__progress-arc {
      fill: none;
      stroke: var(--tx-color-primary, #409eff);
      stroke-width: 2.5;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 0.2s ease;
    }
  }

  .tx-attachment-tray__remove {
    position: absolute;
    top: -6px;
    right: -6px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 999px;
    background: var(--tx-fill-color-blank, #fff);
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 1px 4px color-mix(in srgb, #000 14%, transparent);

    &:hover {
      color: var(--tx-color-danger, #f56c6c);
    }
  }

  .tx-attachment-tray__files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tx-attachment-tray__viewer {
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      max-width: 100%;
      max-height: 70vh;
      border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
      border-radius: 14px;
    }
  }

  .tx-attachment-tray__viewer-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
  }

  .tx-attachment-tray__count {
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
  }

  .tx-attachment-tray__nav {
    padding: 8px 12px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 12px;
    background: var(--tx-fill-color-blank, #fff);
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}
</style>
