<script setup lang="ts" name="TuffItemPreviewer">
import type { TuffItem } from '@talex-touch/utils'
import type { ResolvedApplication } from '@talex-touch/utils/transport/events/types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { toTfileUrl } from '@talex-touch/utils/network'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import {
  AudioPreview,
  CodePreview,
  DefaultPreview,
  ImagePreview,
  MarkdownPreview,
  TextPreview,
  VideoPreview
} from './preview'

const props = defineProps<{
  item: TuffItem
  searchQuery?: string
}>()

const emit = defineEmits<{
  (event: 'openItem'): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
// Same scroller setup as the results column: native on macOS so the trackpad drives it directly.
const isMac = getCurrentRendererPlatformState().isMac

type FilePreviewType =
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'archive'
  | 'document'
  | 'default'

const CODE_EXTENSIONS = new Set([
  'json',
  'yaml',
  'yml',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'ini',
  'conf',
  'toml'
])

function getFileType(filePath: string): FilePreviewType {
  const extension = filePath.split('.').pop()?.toLowerCase()
  if (!extension) return 'default'

  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
    return 'image'
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(extension)) {
    return 'video'
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(extension)) {
    return 'audio'
  }
  if (extension === 'md') {
    return 'markdown'
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'code'
  }
  if (['txt', 'xml', 'csv', 'log', 'html', 'htm', 'env', 'sh', 'bat', 'ps1'].includes(extension)) {
    return 'text'
  }
  if (['pdf'].includes(extension)) {
    return 'pdf'
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return 'archive'
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
    return 'document'
  }
  return 'default'
}

const previewComponent = computed(() => {
  const filePath = props.item.meta?.file?.path
  if (!filePath) return DefaultPreview

  const fileType = getFileType(filePath)

  switch (fileType) {
    case 'image':
      return ImagePreview
    case 'video':
      return VideoPreview
    case 'audio':
      return AudioPreview
    case 'code':
      return CodePreview
    case 'markdown':
      return MarkdownPreview
    case 'text':
      return TextPreview
    default:
      return DefaultPreview
  }
})

const RESOURCE_PREVIEW_TYPES = new Set<FilePreviewType>([
  'image',
  'video',
  'audio',
  'code',
  'markdown',
  'text'
])
const previewResourceUrl = ref('')
const previewResourceReady = ref(false)
let previewRequestVersion = 0

watch(
  () =>
    [
      props.item.meta?.file?.path,
      props.item.meta?.file?.modified_at,
      props.item.meta?.file?.size
    ] as const,
  async ([filePath]) => {
    const requestVersion = ++previewRequestVersion
    previewResourceUrl.value = ''
    previewResourceReady.value = false

    if (!filePath || !RESOURCE_PREVIEW_TYPES.has(getFileType(filePath))) {
      previewResourceReady.value = true
      return
    }

    if (!isElectronRenderer() || !transport) {
      previewResourceUrl.value = toTfileUrl(filePath)
      previewResourceReady.value = true
      return
    }

    try {
      const result = await transport.send(AppEvents.fileIndex.previewResource, { path: filePath })
      if (requestVersion !== previewRequestVersion) return
      if (result.success && result.tfileUrl) {
        previewResourceUrl.value = result.tfileUrl
      }
    } catch {
      if (requestVersion === previewRequestVersion) previewResourceUrl.value = ''
    } finally {
      if (requestVersion === previewRequestVersion) previewResourceReady.value = true
    }
  },
  { immediate: true }
)

/**
 * The application a double-click on this file would launch. LaunchServices answers it in the main
 * process; until it does, the file keeps its index source label, so the row never renders empty.
 */
const defaultApplication = ref<ResolvedApplication | null>(null)
let applicationRequestVersion = 0

watch(
  () => props.item.meta?.file?.path,
  async (filePath) => {
    const requestVersion = ++applicationRequestVersion
    defaultApplication.value = null

    if (!filePath || !isElectronRenderer() || !transport) {
      return
    }

    try {
      const result = await transport.send(AppEvents.fileIndex.defaultApplication, {
        path: filePath
      })
      if (requestVersion !== applicationRequestVersion) return
      if (result.success && result.application) {
        defaultApplication.value = result.application
      }
    } catch {
      // Keep the index source label; an unavailable association is not an error worth surfacing.
    }
  },
  { immediate: true }
)

const sourceName = computed(
  () =>
    defaultApplication.value?.displayName || props.item.source?.name || props.item.source?.id || '-'
)
const sourceIdentifier = computed(() =>
  defaultApplication.value ? defaultApplication.value.identifier : ''
)
const openWithLabel = computed(() =>
  t('fileInfo.openWith', { app: defaultApplication.value?.displayName || t('fileInfo.defaultApp') })
)

function handleSourceIconError(event: Event): void {
  if (event.currentTarget instanceof HTMLImageElement) {
    event.currentTarget.hidden = true
  }
}
</script>

<template>
  <div class="TuffItemPreviewer">
    <TxScroll class="h-full w-full" no-padding :native="isMac" :native-auto-fallback="!isMac">
      <div class="preview-area">
        <button
          class="open-with"
          type="button"
          :title="openWithLabel"
          :aria-label="openWithLabel"
          @click.stop="emit('openItem')"
        >
          <img
            v-if="defaultApplication?.icon"
            class="open-with-icon"
            :src="defaultApplication.icon"
            alt=""
            @error="handleSourceIconError"
          />
          <i v-else class="i-ri-external-link-line open-with-icon" aria-hidden="true" />
          <span class="open-with-label">{{ openWithLabel }}</span>
        </button>
        <DefaultPreview v-if="previewComponent === DefaultPreview" :item="item" />
        <component
          :is="previewComponent"
          v-else-if="previewResourceReady && previewResourceUrl"
          :key="`${item.id}:${previewResourceUrl}:${item.meta?.file?.modified_at ?? ''}:${item.meta?.file?.size ?? ''}`"
          :item="item"
          :resource-url="previewResourceUrl"
          :search-query="searchQuery"
        />
        <DefaultPreview v-else-if="previewResourceReady" :item="item" />
      </div>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold mb-4">
          {{ t('fileInfo.title') }}
        </h3>
        <div class="text-xs space-y-2">
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.path') }}
            </div>
            <div class="w-[65%] break-all">
              {{ item?.meta?.file?.path }}
            </div>
          </div>
          <div
            class="flex border-b justify-between gap-2 border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.source') }}
            </div>
            <div class="w-[65%] flex items-center gap-1.5 min-w-0">
              <img
                v-if="defaultApplication?.icon"
                class="source-icon"
                :src="defaultApplication.icon"
                alt=""
                @error="handleSourceIconError"
              />
              <span v-else class="source-icon placeholder" />
              <span class="flex flex-col min-w-0">
                <span class="truncate">{{ sourceName }}</span>
                <small v-if="sourceIdentifier" class="truncate opacity-60">{{
                  sourceIdentifier
                }}</small>
              </span>
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.contentType') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.mime_type }}
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.fileSize') }}
            </div>
            <div class="w-[65%]">{{ item?.meta?.file?.size || 0 }} {{ t('fileInfo.bytes') }}</div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.createdAt') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.created_at || '-' }}
            </div>
          </div>
          <div
            class="flex justify-between gap-2 border-b border-gray-200 dark:border-gray-700 py-1"
          >
            <div class="w-[80px] text-right">
              {{ t('fileInfo.modifiedAt') }}
            </div>
            <div class="w-[65%]">
              {{ item?.meta?.file?.modified_at || '-' }}
            </div>
          </div>
        </div>
      </div>
    </TxScroll>
  </div>
</template>

<style lang="scss" scoped>
.TuffItemPreviewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0.5rem;

  // A fixed stage for the media. The old `max-height: 70%` resolved against the scroller's
  // auto-height content, i.e. to nothing, so a tall screenshot rendered at full size and pushed
  // the info table off the bottom. The picture scales to fit and centres in here.
  .preview-area {
    position: relative;
    flex-shrink: 0;
    height: 280px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  // Deliberately small and low-emphasis: it is a shortcut for the same action as Enter, not a
  // primary control of the pane.
  .open-with {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 60%;
    padding: 2px 6px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    background-color: var(--tx-bg-color, #fff);
    color: var(--tx-text-color-secondary, inherit);
    font-size: 10px;
    line-height: 1.4;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }

    .open-with-icon {
      flex-shrink: 0;
      width: 12px;
      height: 12px;
      object-fit: contain;
    }

    .open-with-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .source-icon {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    object-fit: contain;
    border-radius: 3px;

    &.placeholder {
      background-color: var(--tx-fill-color-light, rgba(0, 0, 0, 0.06));
    }
  }
}
</style>
