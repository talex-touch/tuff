<script lang="ts" name="HomePreviewArtifacts" setup>
import type { PreviewArtifact } from '~/modules/conversation/preview-index'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

/**
 * Files the conversation produced, plus the ones the user brought into it.
 *
 * The two are grouped apart rather than merged: "the model made this" and "I
 * gave it this" answer different questions, and a single list makes the reader
 * check every row to tell them apart.
 */
const props = defineProps<{ items: PreviewArtifact[] }>()

defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()
const appSdk = useAppSdk()

type FenceKind = 'page' | 'image' | 'diagram'
type FenceArtifact = PreviewArtifact & { kind: FenceKind }

function isFence(item: PreviewArtifact): item is FenceArtifact {
  return item.kind === 'page' || item.kind === 'image' || item.kind === 'diagram'
}

const created = computed(() => props.items.filter((item) => item.kind === 'created'))
const fences = computed(() => props.items.filter(isFence))
const uploaded = computed(() => props.items.filter((item) => item.kind === 'uploaded'))

/** Keyed by kind so a fourth fence kind is a type error here, not a silently wrong icon. */
const FENCE_ICON: Record<FenceKind, string> = {
  page: 'i-ri-window-line',
  image: 'i-ri-image-2-line',
  diagram: 'i-ri-flow-chart'
}

const FENCE_LABEL: Record<FenceKind, string> = {
  page: 'home.preview.page',
  image: 'home.preview.image',
  diagram: 'home.preview.diagram'
}

async function open(item: PreviewArtifact): Promise<void> {
  if (!item.path) return
  try {
    await appSdk.openApp({ path: item.path })
  } catch {
    // A file can be moved or deleted between the write and the click; say so
    // rather than leaving the click looking ignored.
    toast.error(t('home.preview.openFailed'))
  }
}

async function reveal(item: PreviewArtifact): Promise<void> {
  if (!item.path) return
  try {
    await appSdk.showInFolder(item.path)
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}
</script>

<template>
  <!-- Mounted only with something to list: the outputs tab says "nothing yet" once, for files and
       widgets together. -->
  <div class="HomePreviewArtifacts">
    <section v-if="created.length" class="HomePreviewArtifacts-Group">
      <h3 class="HomePreview-GroupLabel">{{ t('home.preview.artifactsCreated') }}</h3>
      <div v-for="item in created" :key="item.id" class="HomePreviewArtifacts-Row">
        <!-- The tooltip carries both halves the row cannot: what the click does,
             and the full path the name and directory lines truncate. -->
        <button
          class="HomePreviewArtifacts-Main"
          type="button"
          :title="`${t('home.preview.open')} — ${item.path}`"
          @click="open(item)"
        >
          <span class="i-ri-file-text-line HomePreviewArtifacts-Icon" />
          <span class="HomePreviewArtifacts-Text">
            <span class="HomePreview-Name">{{ item.name }}</span>
            <span v-if="item.dir" class="HomePreview-Detail">{{ item.dir }}</span>
          </span>
        </button>
        <button
          class="HomePreview-IconBtn"
          type="button"
          :aria-label="t('home.preview.reveal')"
          :title="t('home.preview.reveal')"
          @click="reveal(item)"
        >
          <span class="i-ri-folder-open-line" />
        </button>
      </div>
    </section>

    <!-- The HTML, SVG and Mermaid blocks of replies. Not files: nothing to open or reveal, so a
         click takes the reader back to the block in the transcript. -->
    <section v-if="fences.length" class="HomePreviewArtifacts-Group">
      <h3 class="HomePreview-GroupLabel">{{ t('home.preview.artifactsReply') }}</h3>
      <div v-for="item in fences" :key="item.id" class="HomePreviewArtifacts-Row">
        <button
          class="HomePreviewArtifacts-Main"
          type="button"
          :title="t('home.preview.locate')"
          @click="$emit('locate', item.messageIndex)"
        >
          <span :class="FENCE_ICON[item.kind]" class="HomePreviewArtifacts-Icon" />
          <span class="HomePreviewArtifacts-Text">
            <span class="HomePreview-Name">{{ item.name || t(FENCE_LABEL[item.kind]) }}</span>
            <span class="HomePreview-Detail">{{ t(FENCE_LABEL[item.kind]) }}</span>
          </span>
          <span class="i-ri-corner-up-left-line HomePreviewArtifacts-Icon" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section v-if="uploaded.length" class="HomePreviewArtifacts-Group">
      <h3 class="HomePreview-GroupLabel">{{ t('home.preview.artifactsUploaded') }}</h3>
      <!-- No open action: an upload lives as an object URL owned by the composer
           and has no path on disk to hand the system. -->
      <div v-for="item in uploaded" :key="item.id" class="HomePreviewArtifacts-Row is-static">
        <span class="i-ri-attachment-2 HomePreviewArtifacts-Icon" />
        <span class="HomePreview-Name">{{ item.name }}</span>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewArtifacts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.HomePreviewArtifacts-Group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.HomePreviewArtifacts-Row {
  display: flex;
  gap: 4px;
  align-items: center;

  &.is-static {
    gap: 8px;
    padding: 6px 8px;
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-sm);
  }
}

.HomePreviewArtifacts-Main {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }
}

.HomePreviewArtifacts-Icon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.HomePreviewArtifacts-Text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
</style>
