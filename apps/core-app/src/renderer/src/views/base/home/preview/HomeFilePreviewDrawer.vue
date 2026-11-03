<script lang="ts" name="HomeFilePreviewDrawer" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxMarkdownView } from '@talex-touch/tuffex/markdown-view'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import type { AppSdk } from '@talex-touch/utils/transport/sdk/domains/app'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { AppEvents } from '@talex-touch/utils/transport/events'

const props = defineProps<{
  visible: boolean
  filePath: string
  displayPath?: string
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

function getAppSdk(): AppSdk | null {
  try {
    return typeof useAppSdk === 'function' ? useAppSdk() : null
  } catch {
    return null
  }
}

const loading = ref(false)
const error = ref('')
const content = ref('')
const rawBase64 = ref('')

const fileName = computed(() => {
  const p = props.displayPath || props.filePath
  if (!p) return ''
  const segments = p.split(/[/\\]/)
  return segments[segments.length - 1] || p
})

const fileExt = computed(() => {
  const name = fileName.value
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
})

const isMarkdown = computed(() => ['md', 'markdown'].includes(fileExt.value))
const isImage = computed(() =>
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(fileExt.value)
)

const imageMime = computed(() => {
  const ext = fileExt.value
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
})

const imageDataUrl = computed(() => {
  if (!isImage.value || !rawBase64.value) return ''
  return `data:${imageMime.value};base64,${rawBase64.value}`
})

async function loadFile(): Promise<void> {
  if (!props.visible || !props.filePath) {
    content.value = ''
    rawBase64.value = ''
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''
  content.value = ''
  rawBase64.value = ''

  if (!transport) {
    error.value = t('home.preview.readFailed') || '无法在当前环境中读取本地文件'
    loading.value = false
    return
  }

  try {
    const encoded = await transport.send(AppEvents.system.readFile, {
      source: props.filePath,
      encoding: 'base64',
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 5000
    })

    rawBase64.value = encoded

    if (!isImage.value) {
      const binary = atob(encoded)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      content.value = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOENT/i.test(msg)) {
      error.value = t('home.preview.fileNotFound') || '文件未找到或已被移动'
    } else if (/timeout/i.test(msg)) {
      error.value = t('home.preview.readTimeout') || '读取文件超时'
    } else {
      error.value = msg || t('home.preview.readFailed') || '读取文件失败'
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.filePath],
  ([visible]) => {
    if (visible) {
      void loadFile()
    }
  },
  { immediate: true }
)

async function copyPath(): Promise<void> {
  const p = props.filePath || props.displayPath
  if (!p) return
  try {
    await navigator.clipboard.writeText(p)
    toast.success(t('home.copied') || '已复制')
  } catch {
    // ignore
  }
}

async function openWithSystem(): Promise<void> {
  if (!props.filePath) return
  try {
    const appSdk = getAppSdk()
    if (appSdk) {
      await appSdk.openApp({ path: props.filePath })
      return
    }
    if (transport) {
      await transport.send(AppEvents.system.openApp, { path: props.filePath })
      return
    }
  } catch {
    toast.error(t('home.preview.openFailed') || '无法使用系统工具打开该文件')
  }
}

async function revealInFolder(): Promise<void> {
  if (!props.filePath) return
  try {
    const appSdk = getAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(props.filePath)
      return
    }
    if (transport) {
      await transport.send(AppEvents.system.showInFolder, { path: props.filePath })
      return
    }
  } catch {
    toast.error(t('home.preview.openFailed') || '打开所在文件夹失败')
  }
}
</script>

<template>
  <TxDrawer
    :visible="visible"
    size="min(720px, 85vw)"
    direction="right"
    :close-label="t('common.close') || '关闭'"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="HomeFilePreviewDrawer-Header">
        <div class="HomeFilePreviewDrawer-TitleGroup">
          <div class="HomeFilePreviewDrawer-TitleRow">
            <span class="i-ri-file-text-line HomeFilePreviewDrawer-FileIcon" />
            <h2 class="HomeFilePreviewDrawer-Title" :title="fileName">
              {{ fileName }}
            </h2>
            <span v-if="fileExt" class="HomeFilePreviewDrawer-ExtBadge">
              {{ fileExt.toUpperCase() }}
            </span>
          </div>
          <div
            class="HomeFilePreviewDrawer-Path"
            role="button"
            tabindex="0"
            :title="t('home.fileLink.clickToCopyPath') || '点击复制路径'"
            @click="copyPath"
          >
            <span class="HomeFilePreviewDrawer-PathText">{{ displayPath || filePath }}</span>
            <span class="i-ri-file-copy-line HomeFilePreviewDrawer-CopyIcon" />
          </div>
        </div>

        <div class="HomeFilePreviewDrawer-Actions">
          <TxButton
            size="sm"
            variant="secondary"
            :title="t('home.fileLink.openSystemAppTitle') || '使用系统关联工具打开 (⇧⌘)'"
            @click="openWithSystem"
          >
            <span class="i-ri-external-link-line mr-1" />
            <span>{{ t('home.fileLink.openWithSystem') || '系统工具' }}</span>
          </TxButton>
          <TxButton
            size="sm"
            variant="secondary"
            :title="t('home.preview.reveal') || '在文件夹中显示'"
            @click="revealInFolder"
          >
            <span class="i-ri-folder-open-line mr-1" />
            <span>{{ t('home.fileLink.revealInFinder') || '访达' }}</span>
          </TxButton>
        </div>
      </div>
    </template>

    <div class="HomeFilePreviewDrawer-Body">
      <div v-if="loading" class="HomeFilePreviewDrawer-Loading">
        <TxSkeleton :rows="8" animated />
      </div>

      <div v-else-if="error" class="HomeFilePreviewDrawer-Error">
        <span class="i-ri-error-warning-line HomeFilePreviewDrawer-ErrorIcon" />
        <p class="HomeFilePreviewDrawer-ErrorMessage">{{ error }}</p>
        <p class="HomeFilePreviewDrawer-ErrorPath">{{ filePath }}</p>
        <TxButton size="sm" variant="secondary" class="mt-4" @click="revealInFolder">
          <span class="i-ri-folder-open-line mr-1" />
          <span>{{ t('home.fileLink.revealParentFolder') || '查看所在目录' }}</span>
        </TxButton>
      </div>

      <div v-else-if="isImage" class="HomeFilePreviewDrawer-ImageContainer">
        <img :src="imageDataUrl" :alt="fileName" class="HomeFilePreviewDrawer-Image" />
      </div>

      <div v-else-if="isMarkdown" class="HomeFilePreviewDrawer-Markdown">
        <TxMarkdownView :content="content" theme="auto" />
      </div>

      <div v-else class="HomeFilePreviewDrawer-Code">
        <pre class="HomeFilePreviewDrawer-Pre"><code>{{ content }}</code></pre>
      </div>
    </div>
  </TxDrawer>
</template>

<style lang="scss" scoped>
.HomeFilePreviewDrawer-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.HomeFilePreviewDrawer-TitleGroup {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.HomeFilePreviewDrawer-TitleRow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.HomeFilePreviewDrawer-FileIcon {
  font-size: 1.25rem;
  color: var(--tx-color-primary, #409eff);
  flex-shrink: 0;
}

.HomeFilePreviewDrawer-Title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeFilePreviewDrawer-ExtBadge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--tx-fill-color-light, rgba(125, 125, 125, 0.12));
  color: var(--tx-text-color-secondary, #909399);
  flex-shrink: 0;
}

.HomeFilePreviewDrawer-Path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-size: 0.8rem;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--tx-color-primary, #409eff);

    .HomeFilePreviewDrawer-CopyIcon {
      opacity: 1;
    }
  }
}

.HomeFilePreviewDrawer-PathText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeFilePreviewDrawer-CopyIcon {
  font-size: 0.9rem;
  opacity: 0.6;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}

.HomeFilePreviewDrawer-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.HomeFilePreviewDrawer-Body {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px 32px;
}

.HomeFilePreviewDrawer-Loading {
  padding: 16px 0;
}

.HomeFilePreviewDrawer-Error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}

.HomeFilePreviewDrawer-ErrorIcon {
  font-size: 2.5rem;
  color: var(--tx-color-danger, #f56c6c);
  margin-bottom: 12px;
}

.HomeFilePreviewDrawer-ErrorMessage {
  font-size: 1rem;
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
  margin: 0 0 6px;
}

.HomeFilePreviewDrawer-ErrorPath {
  font-size: 0.82rem;
  color: var(--tx-text-color-secondary, #909399);
  font-family: var(--tx-font-mono, ui-monospace, monospace);
  word-break: break-all;
  margin: 0;
}

.HomeFilePreviewDrawer-ImageContainer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

.HomeFilePreviewDrawer-Image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.HomeFilePreviewDrawer-Markdown {
  line-height: 1.65;
  color: var(--tx-text-color-primary, #303133);
}

.HomeFilePreviewDrawer-Code {
  background: var(--tx-fill-color-lighter, rgba(125, 125, 125, 0.06));
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.HomeFilePreviewDrawer-Pre {
  margin: 0;
  font-family: var(--tx-font-mono, ui-monospace, Menlo, Monaco, Consolas, monospace);
  font-size: 0.88rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
