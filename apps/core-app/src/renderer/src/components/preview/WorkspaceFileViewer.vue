<script lang="ts" name="WorkspaceFileViewer" setup>
import type { WorkspaceReadFileResult } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxMarkdownView } from '@talex-touch/tuffex/markdown-view'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { basenameOfPath } from '~/modules/browser-workspace/preview-url'

const props = withDefaults(
  defineProps<{
    filePath: string
    displayPath?: string
    conversationId?: string | null
    line?: number
    refreshToken?: number
    /** Hide the "Open in Built-in Browser" button when already rendered inside BrowserPage. */
    showOpenInBrowser?: boolean
  }>(),
  {
    displayPath: '',
    conversationId: null,
    line: undefined,
    refreshToken: 0,
    showOpenInBrowser: true
  }
)

const emit = defineEmits<{
  (event: 'navigate', payload: { path: string; displayPath: string }): void
  (event: 'open-in-browser', payload: { path: string; displayPath: string; line?: number }): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

function resolveAppSdk() {
  try {
    return typeof useAppSdk === 'function' ? useAppSdk() : null
  } catch {
    return null
  }
}

const loading = ref(false)
const error = ref('')
const data = ref<WorkspaceReadFileResult | null>(null)
const viewMode = ref<'preview' | 'source'>('preview')
const wrapLines = ref(true)
const imageZoom = ref(1)
const pdfBlobUrl = ref('')
const codeContainerRef = ref<HTMLElement | null>(null)
let loadGeneration = 0

function revokePdfUrl(): void {
  if (pdfBlobUrl.value) {
    URL.revokeObjectURL(pdfBlobUrl.value)
    pdfBlobUrl.value = ''
  }
}

const resolvedPath = computed(() => data.value?.path || props.filePath)
const fileName = computed(
  () => data.value?.name || basenameOfPath(props.displayPath || props.filePath)
)
const fileExt = computed(() => {
  if (data.value?.ext) return data.value.ext.toLowerCase()
  const name = fileName.value
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
})

const isHtml = computed(
  () => data.value?.kind === 'text' && (fileExt.value === 'html' || fileExt.value === 'htm')
)
const isSvg = computed(() => data.value?.kind === 'text' && fileExt.value === 'svg')
const isMarkdown = computed(
  () => data.value?.kind === 'text' && ['md', 'markdown', 'mdc', 'mdx'].includes(fileExt.value)
)
const isJson = computed(() => data.value?.kind === 'text' && fileExt.value === 'json')
const supportsPreviewToggle = computed(
  () => isHtml.value || isSvg.value || isMarkdown.value || isJson.value
)

const fileIcon = computed(() => {
  if (data.value?.kind === 'directory') return 'i-ri-folder-3-line'
  if (isHtml.value) return 'i-ri-html5-line'
  if (isMarkdown.value) return 'i-ri-markdown-line'
  if (isJson.value) return 'i-ri-braces-line'
  if (data.value?.kind === 'image' || isSvg.value) return 'i-ri-image-2-line'
  if (data.value?.kind === 'pdf') return 'i-ri-file-pdf-2-line'
  return 'i-ri-file-code-line'
})

const imageDataUrl = computed(() => {
  if (data.value?.kind === 'image' && data.value.base64) {
    return `data:${data.value.mimeType};base64,${data.value.base64}`
  }
  return ''
})

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Outer-CSP sandboxed srcdoc wrapper (matching TxCodeStream): gives the opened HTML/SVG an opaque
 * origin (no `allow-same-origin`) with zero network exfiltration while letting interactive pure-HTML
 * prototypes (forms, inline scripts, dialogs) work cleanly.
 */
const sandboxedHtmlSrcdoc = computed(() => {
  const source = data.value?.text ?? ''
  if (!source) return ''
  const inner = isSvg.value
    ? `<!doctype html><meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${source}</body>`
    : source
  const csp =
    "default-src 'none'; frame-src about:; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
  const innerSandbox = isHtml.value ? 'allow-scripts allow-forms allow-modals' : ''
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style><iframe sandbox="${innerSandbox}" srcdoc="${escapeAttribute(inner)}"></iframe>`
})

const formattedJson = computed(() => {
  if (!isJson.value || !data.value?.text) return data.value?.text ?? ''
  try {
    return JSON.stringify(JSON.parse(data.value.text), null, 2)
  } catch {
    return data.value.text
  }
})

const displayedText = computed(() => {
  if (isJson.value && viewMode.value === 'preview') return formattedJson.value
  return data.value?.text ?? ''
})

const codeLines = computed(() => displayedText.value.split('\n'))

const parentDirectoryPath = computed(() => {
  const current = resolvedPath.value.replace(/[/\\]+$/, '')
  if (!current || current === '/') return null
  const cut = Math.max(current.lastIndexOf('/'), current.lastIndexOf('\\'))
  if (cut < 0) return null
  if (cut === 0) return '/'
  return current.slice(0, cut)
})

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function scrollToTargetLine(): Promise<void> {
  if (!props.line || props.line <= 0) return
  await nextTick()
  const row = codeContainerRef.value?.querySelector<HTMLElement>(`[data-line="${props.line}"]`)
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function loadFile(): Promise<void> {
  const target = props.filePath.trim()
  const generation = ++loadGeneration
  revokePdfUrl()
  error.value = ''
  imageZoom.value = 1

  if (!target) {
    data.value = null
    loading.value = false
    return
  }

  if (!transport) {
    data.value = null
    error.value = t('home.preview.readFailed')
    loading.value = false
    return
  }

  loading.value = true
  try {
    const result = await transport.send(AgentWorkspaceEvents.readFile, {
      path: target,
      conversationId: props.conversationId ?? null
    })
    if (generation !== loadGeneration) return
    data.value = result
    // Default to preview for HTML/SVG/Markdown/JSON unless an explicit source line was clicked.
    viewMode.value = props.line && props.line > 0 ? 'source' : 'preview'

    if (result.kind === 'pdf' && result.base64) {
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      pdfBlobUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    }

    if (result.kind === 'text' && props.line) {
      void scrollToTargetLine()
    }
  } catch (err) {
    if (generation !== loadGeneration) return
    data.value = null
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOENT/i.test(msg)) {
      error.value = t('home.preview.fileNotFound')
    } else if (/FORBIDDEN/i.test(msg)) {
      error.value = t('home.sidePanel.fileForbidden')
    } else if (/timeout/i.test(msg)) {
      error.value = t('home.preview.readTimeout')
    } else {
      error.value = msg || t('home.preview.readFailed')
    }
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

watch(
  () => [props.filePath, props.conversationId, props.refreshToken] as const,
  () => {
    void loadFile()
  },
  { immediate: true }
)

watch(
  () => props.line,
  (line) => {
    if (line && line > 0 && data.value?.kind === 'text') {
      viewMode.value = 'source'
      void scrollToTargetLine()
    }
  }
)

onBeforeUnmount(() => {
  loadGeneration += 1
  revokePdfUrl()
})

async function copyPath(): Promise<void> {
  const target = resolvedPath.value
  if (!target) return
  try {
    await navigator.clipboard.writeText(target)
    toast.success(t('home.copied'))
  } catch {
    // ignore
  }
}

async function copyContent(): Promise<void> {
  if (data.value?.kind !== 'text' || data.value.text === undefined) return
  try {
    await navigator.clipboard.writeText(data.value.text)
    toast.success(t('home.copied'))
  } catch {
    // ignore
  }
}

async function openWithSystem(): Promise<void> {
  const target = resolvedPath.value
  if (!target) return
  try {
    if (transport) {
      const result = await transport.send(AgentWorkspaceEvents.openFileExternal, {
        path: target,
        conversationId: props.conversationId ?? null
      })
      if (result?.revealed && !result.opened) {
        toast.info(t('home.sidePanel.revealedExecutable'))
      }
      return
    }
    const appSdk = resolveAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(target, { reveal: true })
    }
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

async function revealInFolder(): Promise<void> {
  const target = resolvedPath.value || props.filePath
  if (!target) return
  try {
    const appSdk = resolveAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(target, { reveal: true })
      return
    }
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

function openInBuiltInBrowser(): void {
  const target = resolvedPath.value
  if (!target) return
  emit('open-in-browser', {
    path: target,
    displayPath: props.displayPath || target,
    line: props.line
  })
}

function openEntry(entryPath: string): void {
  emit('navigate', { path: entryPath, displayPath: entryPath })
}

function adjustZoom(delta: number): void {
  imageZoom.value = Math.max(0.25, Math.min(4, Math.round((imageZoom.value + delta) * 100) / 100))
}
</script>

<template>
  <div class="WorkspaceFileViewer">
    <header class="WorkspaceFileViewer-Header">
      <div class="WorkspaceFileViewer-Meta">
        <div class="WorkspaceFileViewer-TitleRow">
          <span :class="fileIcon" class="WorkspaceFileViewer-Icon" aria-hidden="true" />
          <span class="WorkspaceFileViewer-Name" :title="fileName">{{ fileName }}</span>
          <span v-if="fileExt" class="WorkspaceFileViewer-Badge">{{ fileExt.toUpperCase() }}</span>
          <span v-if="data && data.kind !== 'directory'" class="WorkspaceFileViewer-Size">
            {{ formatFileSize(data.size) }}
          </span>
        </div>
        <button
          type="button"
          class="WorkspaceFileViewer-PathBtn"
          :title="`${t('home.fileLink.clickToCopyPath')}: ${resolvedPath}`"
          @click="copyPath"
        >
          <span class="WorkspaceFileViewer-PathText">{{ resolvedPath }}</span>
          <span class="i-ri-file-copy-line WorkspaceFileViewer-CopyIcon" aria-hidden="true" />
        </button>
      </div>

      <div class="WorkspaceFileViewer-Toolbar">
        <div v-if="supportsPreviewToggle" class="WorkspaceFileViewer-Segment" role="group">
          <button
            type="button"
            class="WorkspaceFileViewer-SegBtn"
            :class="{ 'is-active': viewMode === 'preview' }"
            :aria-pressed="viewMode === 'preview'"
            @click="viewMode = 'preview'"
          >
            {{ isJson ? t('home.sidePanel.formatted') : t('home.code.preview') }}
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-SegBtn"
            :class="{ 'is-active': viewMode === 'source' }"
            :aria-pressed="viewMode === 'source'"
            @click="viewMode = 'source'"
          >
            {{ isJson ? t('home.sidePanel.raw') : t('home.code.source') }}
          </button>
        </div>

        <button
          v-if="data?.kind === 'text' && (!supportsPreviewToggle || viewMode === 'source')"
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :class="{ 'is-active': wrapLines }"
          :aria-pressed="wrapLines"
          :title="t('home.sidePanel.toggleWrap')"
          :aria-label="t('home.sidePanel.toggleWrap')"
          @click="wrapLines = !wrapLines"
        >
          <span class="i-ri-text-wrap" aria-hidden="true" />
        </button>

        <button
          v-if="data?.kind === 'text'"
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.sidePanel.copyContent')"
          :aria-label="t('home.sidePanel.copyContent')"
          @click="copyContent"
        >
          <span class="i-ri-clipboard-line" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.sidePanel.reload')"
          :aria-label="t('home.sidePanel.reload')"
          @click="loadFile"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
        </button>

        <button
          v-if="showOpenInBrowser"
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.fileLink.openInBuiltInBrowser')"
          :aria-label="t('home.fileLink.openInBuiltInBrowser')"
          @click="openInBuiltInBrowser"
        >
          <span class="i-ri-window-line" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.fileLink.openSystemAppTitle')"
          :aria-label="t('home.fileLink.openWithSystem')"
          @click="openWithSystem"
        >
          <span class="i-ri-external-link-line" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.preview.reveal')"
          :aria-label="t('home.fileLink.revealInFinder')"
          @click="revealInFolder"
        >
          <span class="i-ri-folder-open-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="WorkspaceFileViewer-Body">
      <div v-if="loading" class="WorkspaceFileViewer-Loading" aria-hidden="true">
        <TxSkeleton :rows="8" animated />
      </div>

      <div v-else-if="error" class="WorkspaceFileViewer-State" role="alert">
        <span
          class="i-ri-error-warning-line WorkspaceFileViewer-StateIcon is-danger"
          aria-hidden="true"
        />
        <p class="WorkspaceFileViewer-StateTitle">{{ error }}</p>
        <p class="WorkspaceFileViewer-StatePath">{{ resolvedPath }}</p>
        <div class="WorkspaceFileViewer-StateActions">
          <TxButton size="sm" variant="secondary" @click="loadFile">
            {{ t('home.workspace.retry') }}
          </TxButton>
          <TxButton size="sm" variant="secondary" @click="revealInFolder">
            {{ t('home.fileLink.revealParentFolder') }}
          </TxButton>
        </div>
      </div>

      <template v-else-if="data">
        <!-- Directory browser -->
        <div v-if="data.kind === 'directory'" class="WorkspaceFileViewer-Dir">
          <button
            v-if="parentDirectoryPath"
            type="button"
            class="WorkspaceFileViewer-DirRow is-parent"
            @click="openEntry(parentDirectoryPath)"
          >
            <span class="i-ri-arrow-up-line WorkspaceFileViewer-DirIcon" aria-hidden="true" />
            <span class="WorkspaceFileViewer-DirName">..</span>
          </button>
          <button
            v-for="entry in data.entries ?? []"
            :key="entry.path"
            type="button"
            class="WorkspaceFileViewer-DirRow"
            @click="openEntry(entry.path)"
          >
            <span
              :class="entry.isDirectory ? 'i-ri-folder-3-line' : 'i-ri-file-text-line'"
              class="WorkspaceFileViewer-DirIcon"
              aria-hidden="true"
            />
            <span class="WorkspaceFileViewer-DirName">{{ entry.name }}</span>
            <span
              v-if="!entry.isDirectory && entry.size !== undefined"
              class="WorkspaceFileViewer-DirSize"
            >
              {{ formatFileSize(entry.size) }}
            </span>
          </button>
        </div>

        <!-- Live HTML / SVG preview -->
        <div
          v-else-if="(isHtml || isSvg) && viewMode === 'preview'"
          class="WorkspaceFileViewer-FrameWrap"
        >
          <iframe
            class="WorkspaceFileViewer-Frame"
            :sandbox="isHtml ? 'allow-scripts allow-forms allow-modals' : ''"
            :title="fileName"
            :srcdoc="sandboxedHtmlSrcdoc"
          />
        </div>

        <!-- Rendered Markdown -->
        <div v-else-if="isMarkdown && viewMode === 'preview'" class="WorkspaceFileViewer-Markdown">
          <TxMarkdownView :content="data.text ?? ''" theme="auto" />
        </div>

        <!-- Zoomable Image -->
        <div v-else-if="data.kind === 'image'" class="WorkspaceFileViewer-ImageWrap">
          <div class="WorkspaceFileViewer-ZoomBar">
            <button
              type="button"
              class="WorkspaceFileViewer-ToolBtn"
              :aria-label="t('home.attachViewer.zoomOut')"
              @click="adjustZoom(-0.25)"
            >
              <span class="i-ri-zoom-out-line" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="WorkspaceFileViewer-ZoomLabel"
              :title="t('home.attachViewer.reset')"
              @click="imageZoom = 1"
            >
              {{ Math.round(imageZoom * 100) }}%
            </button>
            <button
              type="button"
              class="WorkspaceFileViewer-ToolBtn"
              :aria-label="t('home.attachViewer.zoomIn')"
              @click="adjustZoom(0.25)"
            >
              <span class="i-ri-zoom-in-line" aria-hidden="true" />
            </button>
          </div>
          <div class="WorkspaceFileViewer-ImageStage">
            <img
              :src="imageDataUrl"
              :alt="fileName"
              class="WorkspaceFileViewer-Image"
              :style="{ transform: `scale(${imageZoom})` }"
            />
          </div>
        </div>

        <!-- PDF viewer -->
        <div v-else-if="data.kind === 'pdf' && pdfBlobUrl" class="WorkspaceFileViewer-FrameWrap">
          <iframe class="WorkspaceFileViewer-Frame" :src="pdfBlobUrl" :title="fileName" />
        </div>

        <!-- Binary fallback -->
        <div v-else-if="data.kind === 'binary'" class="WorkspaceFileViewer-State">
          <span class="i-ri-file-zip-line WorkspaceFileViewer-StateIcon" aria-hidden="true" />
          <p class="WorkspaceFileViewer-StateTitle">{{ t('home.sidePanel.binaryUnsupported') }}</p>
          <p class="WorkspaceFileViewer-StatePath">
            {{ data.mimeType }} · {{ formatFileSize(data.size) }}
          </p>
          <div class="WorkspaceFileViewer-StateActions">
            <TxButton size="sm" variant="secondary" @click="openWithSystem">
              {{ t('home.fileLink.openWithSystem') }}
            </TxButton>
            <TxButton size="sm" variant="secondary" @click="revealInFolder">
              {{ t('home.fileLink.revealInFinder') }}
            </TxButton>
          </div>
        </div>

        <!-- Source / Code viewer with line numbers -->
        <div
          v-else
          ref="codeContainerRef"
          class="WorkspaceFileViewer-Code"
          :class="{ 'is-wrap': wrapLines }"
        >
          <div v-if="data.truncated" class="WorkspaceFileViewer-Truncated">
            {{ t('home.sidePanel.fileTruncated', { size: formatFileSize(data.size) }) }}
          </div>
          <div class="WorkspaceFileViewer-CodeLines" role="region" :aria-label="fileName">
            <div
              v-for="(lineText, idx) in codeLines"
              :key="idx"
              :data-line="idx + 1"
              class="WorkspaceFileViewer-CodeLine"
              :class="{ 'is-highlighted': line === idx + 1 }"
            >
              <span class="WorkspaceFileViewer-LineNo" aria-hidden="true">{{ idx + 1 }}</span>
              <span class="WorkspaceFileViewer-LineText">{{ lineText || ' ' }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.WorkspaceFileViewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
  color: var(--shell-text-primary);
}

.WorkspaceFileViewer-Header {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.WorkspaceFileViewer-Meta {
  display: flex;
  flex: 1 1 180px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.WorkspaceFileViewer-TitleRow {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-Icon {
  flex: none;
  color: var(--shell-primary);
  font-size: 15px;
}

.WorkspaceFileViewer-Name {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-Badge {
  flex: none;
  padding: 1px 5px;
  border-radius: var(--shell-radius-xs, 4px);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
}

.WorkspaceFileViewer-Size {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileViewer-PathBtn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  font-size: var(--shell-fs-caption);
  text-align: left;
  cursor: pointer;

  &:hover {
    color: var(--shell-primary);
  }
}

.WorkspaceFileViewer-PathText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-CopyIcon {
  flex: none;
  font-size: 12px;
  opacity: 0.7;
}

.WorkspaceFileViewer-Toolbar {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
}

.WorkspaceFileViewer-Segment {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
}

.WorkspaceFileViewer-SegBtn {
  padding: 3px 8px;
  border: none;
  border-radius: calc(var(--shell-radius-sm) - 2px);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &.is-active {
    background: var(--shell-bg);
    color: var(--shell-text-primary);
    box-shadow: inset 0 0 0 1px var(--shell-border);
  }

  &:hover:not(.is-active) {
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-ToolBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-Body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.WorkspaceFileViewer-Loading {
  padding: 16px;
}

.WorkspaceFileViewer-State {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
}

.WorkspaceFileViewer-StateIcon {
  color: var(--shell-text-muted);
  font-size: 32px;

  &.is-danger {
    color: var(--shell-danger);
  }
}

.WorkspaceFileViewer-StateTitle {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 500;
}

.WorkspaceFileViewer-StatePath {
  margin: 0;
  max-width: 100%;
  color: var(--shell-text-muted);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: var(--shell-fs-caption);
  word-break: break-all;
}

.WorkspaceFileViewer-StateActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

.WorkspaceFileViewer-FrameWrap {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.WorkspaceFileViewer-Frame {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--tx-color-white, #fff);
}

.WorkspaceFileViewer-Markdown {
  padding: 16px 20px 28px;
  line-height: 1.65;
}

.WorkspaceFileViewer-ImageWrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.WorkspaceFileViewer-ZoomBar {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--shell-border);
}

.WorkspaceFileViewer-ZoomLabel {
  min-width: 48px;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-ImageStage {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  overflow: auto;
  padding: 20px;
}

.WorkspaceFileViewer-Image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--shell-radius-sm);
  transform-origin: center center;
}

.WorkspaceFileViewer-Dir {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.WorkspaceFileViewer-DirRow {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-parent {
    color: var(--shell-text-secondary);
  }
}

.WorkspaceFileViewer-DirIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.WorkspaceFileViewer-DirName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-DirSize {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileViewer-Code {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  font-family: var(--tx-font-family-mono, ui-monospace, Menlo, Monaco, Consolas, monospace);
  font-size: 12.5px;
  line-height: 1.6;
}

.WorkspaceFileViewer-Truncated {
  flex: none;
  padding: 6px 12px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-warning-soft);
  color: var(--shell-warning);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
}

.WorkspaceFileViewer-CodeLines {
  padding: 10px 0 24px;
}

.WorkspaceFileViewer-CodeLine {
  display: flex;
  gap: 12px;
  padding: 0 14px 0 8px;

  &.is-highlighted {
    background: var(--shell-primary-soft);
  }
}

.WorkspaceFileViewer-LineNo {
  flex: none;
  min-width: 36px;
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
  opacity: 0.65;
}

.WorkspaceFileViewer-LineText {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre;

  .WorkspaceFileViewer-Code.is-wrap & {
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
