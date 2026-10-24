<script setup lang="ts">
import type { AiAttachmentFile, AiAttachmentImage } from '../../ai-elements/src/types'
import type TxImagePreviewComponent from '../../image-preview/src/TxImagePreview.vue'
import type { AttachmentTrayEmits, AttachmentTrayProps } from './types'
import { computed, ref } from 'vue'
import { useLazyComponent } from '../../../../utils/use-lazy-component'
import AttachmentThumb from './AttachmentThumb.vue'
import TxAttachmentChip from './TxAttachmentChip.vue'

defineOptions({ name: 'TxAttachmentTray' })

const props = withDefaults(defineProps<AttachmentTrayProps>(), {
  removable: false,
  previewTitle: 'Preview',
  previousLabel: 'Previous image',
  nextLabel: 'Next image',
  closeLabel: 'Close',
  zoomInLabel: 'Zoom in',
  zoomOutLabel: 'Zoom out',
  resetLabel: 'Fit to screen',
  failedText: 'This image could not be loaded',
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

// -- Broken images become a placeholder instead of a browser broken-image glyph.
// Keyed by URL, so a host that swaps a failed URL for a new one gets a fresh load.
const failedUrls = ref(new Set<string>())

function markFailed(url: string): void {
  failedUrls.value = new Set(failedUrls.value).add(url)
}

// -- Preview: TxImagePreview, which keeps the index on a real image as the list changes and
// closes when no image is left. It is loaded the first time it is about to be needed, so a tray
// carries neither it nor its stylesheet until then: pointing at or focusing the tray starts the
// load, and a press that lands first opens it as soon as it arrives.

const viewerOpen = ref(false)
const viewerIndex = ref(0)
const rootRef = ref<HTMLElement | null>(null)

// The preview flies each picture out of its thumbnail and back into it.
function thumbOf(index: number): Element | null {
  const id = images.value[index]?.id
  const cells = rootRef.value?.querySelectorAll<HTMLElement>('.tx-attachment-tray__cell') ?? []
  for (const cell of cells) {
    if (cell.dataset.id === id)
      return cell.querySelector('.tx-attachment-tray__thumb')
  }
  return null
}

function openLabel(image: ImageAttachment): string {
  const name = image.name ?? image.id
  return props.openLabelFormatter ? props.openLabelFormatter(name) : `${props.previewTitle}: ${name}`
}

const { component: preview, load: startPreviewLoad } = useLazyComponent<typeof TxImagePreviewComponent>(
  () => import('../../image-preview').then(module => module.TxImagePreview),
  () => {
    // The next press tries again; until then the tray is not left open on nothing.
    viewerOpen.value = false
  },
)

function loadPreview(): void {
  if (images.value.length > 0)
    startPreviewLoad()
}

function openViewer(index: number): void {
  loadPreview()
  viewerIndex.value = index
  viewerOpen.value = true
}
</script>

<template>
  <div ref="rootRef" class="tx-attachment-tray" @pointerenter="loadPreview" @focusin="loadPreview">
    <div v-if="images.length > 0" class="tx-attachment-tray__grid">
      <AttachmentThumb
        v-for="(image, index) in images"
        :key="image.id"
        :attachment="image"
        :removable="removable"
        :broken="failedUrls.has(image.url)"
        :open-label="openLabel(image)"
        :remove-label="removeLabel"
        :cancel-label="cancelLabel"
        @open="openViewer(index)"
        @remove="emit('remove', $event)"
        @cancel="emit('cancel', $event)"
        @error="markFailed(image.url)"
      />
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

    <component
      :is="preview"
      v-if="preview"
      v-bind="previewProps"
      v-model:open="viewerOpen"
      v-model:index="viewerIndex"
      :images="images"
      :failed="failedUrls"
      :origin="thumbOf"
      :label="previewTitle"
      :previous-label="previousLabel"
      :next-label="nextLabel"
      :close-label="closeLabel"
      :zoom-in-label="zoomInLabel"
      :zoom-out-label="zoomOutLabel"
      :reset-label="resetLabel"
      :failed-text="failedText"
      @error="markFailed"
      @action="emit('action', $event)"
    />
  </div>
</template>

<style lang="scss">
.tx-attachment-tray {
  display: grid;
  gap: 8px;
}

.tx-attachment-tray__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-attachment-tray__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
