<script setup lang="ts">
import type { AiAttachmentFile } from '@tuffex-components/ai-elements'
import { ref } from 'vue'

interface ImageAttachment {
  kind: 'image'
  id: string
  url: string
  name?: string
}

interface FileAttachment {
  kind: 'file'
  id: string
  name: string
  size: number
  uploading?: boolean
  progress?: number
}

type Attachment = ImageAttachment | FileAttachment

function seed(): Attachment[] {
  return [
    { kind: 'image', id: 'i1', url: 'https://picsum.photos/id/1015/400/300', name: 'canyon.jpg' },
    { kind: 'image', id: 'i2', url: 'https://picsum.photos/id/1025/400/300', name: 'pug.jpg' },
    // A URL that will not resolve, to show the placeholder rather than a broken glyph.
    { kind: 'image', id: 'i3', url: 'https://example.com/missing.png', name: 'missing.png' },
    { kind: 'file', id: 'f1', name: 'report.pdf', size: 240_000 },
    { kind: 'file', id: 'f2', name: 'uploading.zip', size: 1_200_000, uploading: true, progress: 0.4 },
  ]
}

const attachments = ref<Attachment[]>(seed())
const opened = ref<string | null>(null)

// The component never mutates the list; removal is the host's job.
function onRemove(id: string) {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

function onCancel(id: string) {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

// Files only — images use the built-in viewer and emit nothing.
function onOpen(attachment: AiAttachmentFile) {
  opened.value = attachment.name
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxAttachmentTray
      :attachments="attachments"
      removable
      @remove="onRemove"
      @cancel="onCancel"
      @open="onOpen"
    />

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
        @click="attachments = seed(); opened = null"
      >
        Reset
      </button>
      <span class="text-sm text-[var(--tx-text-color-secondary)]">
        <template v-if="opened">Host would open: <code>{{ opened }}</code></template>
        <template v-else>Click an image for the built-in viewer, or a file chip to emit `open`.</template>
      </span>
    </div>
  </div>
</template>
