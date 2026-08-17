<script setup lang="ts">
import type { editor as MonacoEditorNamespace } from 'monaco-editor'
import type { Component } from 'vue'
import { useClipboard } from '@talex-touch/utils/plugin/sdk/clipboard'
import { forceMaxCoreBox, useCoreBoxInput } from '~/composables/useCoreBoxInput'
import { useJsonFormatter } from '~/composables/useJsonFormatter'
import { waitForMonacoReady } from '~/modules/monaco'

defineOptions({
  name: 'JsonPage',
})

const clipboard = useClipboard()

// Use composables
const {
  inputJson,
  outputJson,
  outputLanguage,
  queryExpression,
  errorMessage,
  isValidJson,
  showToast,
  toastMessage,
  toastType,
  formatJson,
  minifyJson,
  validateJson,
  executeQuery,
  toYaml,
  toXml,
  sortKeys,
  escapeJson,
  unescapeJson,
  flattenJson,
  diffJson,
  pasteFromClipboard,
  copyOutput,
  swapEditors,
  clearAll,
} = useJsonFormatter()

// 监听 CoreBox 输入
useCoreBoxInput((text) => {
  inputJson.value = text
  focusInputEditor()
})

// Dark mode detection
const isDark = useDark()
const editorTheme = computed(() => isDark.value ? 'vs-dark' : 'vs')
const MonacoEditor = shallowRef<Component | null>(null)
const inputEditor = shallowRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null)
const outputEditor = shallowRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(null)
const followScroll = ref(true)
let focusTimer: number | undefined
let scrollSyncFrame: number | undefined
let syncingScroll = false
let inputScrollDisposable: { dispose: () => void } | null = null
let outputScrollDisposable: { dispose: () => void } | null = null

function focusInputEditor(): void {
  inputEditor.value?.focus()
  void nextTick(() => {
    if (focusTimer !== undefined) {
      window.clearTimeout(focusTimer)
    }
    focusTimer = window.setTimeout(() => {
      inputEditor.value?.focus()
      focusTimer = undefined
    }, 200)
  })
}

function getScrollableHeight(editor: MonacoEditorNamespace.IStandaloneCodeEditor): number {
  return Math.max(0, editor.getScrollHeight() - editor.getLayoutInfo().height)
}

function syncEditorScroll(
  source: MonacoEditorNamespace.IStandaloneCodeEditor,
  target: MonacoEditorNamespace.IStandaloneCodeEditor,
): void {
  if (!followScroll.value || syncingScroll)
    return

  const sourceScrollableHeight = getScrollableHeight(source)
  const targetScrollableHeight = getScrollableHeight(target)
  const ratio = sourceScrollableHeight > 0 ? source.getScrollTop() / sourceScrollableHeight : 0

  syncingScroll = true
  target.setScrollTop(ratio * targetScrollableHeight)
  if (scrollSyncFrame !== undefined) {
    window.cancelAnimationFrame(scrollSyncFrame)
  }
  scrollSyncFrame = window.requestAnimationFrame(() => {
    syncingScroll = false
    scrollSyncFrame = undefined
  })
}

function bindEditorScrollSync(): void {
  inputScrollDisposable?.dispose()
  outputScrollDisposable?.dispose()
  inputScrollDisposable = null
  outputScrollDisposable = null

  const input = inputEditor.value
  const output = outputEditor.value
  if (!input || !output)
    return

  inputScrollDisposable = input.onDidScrollChange((event) => {
    if (event.scrollTopChanged)
      syncEditorScroll(input, output)
  })
  outputScrollDisposable = output.onDidScrollChange((event) => {
    if (event.scrollTopChanged)
      syncEditorScroll(output, input)
  })
}

function onOutputEditorMount(editor: MonacoEditorNamespace.IStandaloneCodeEditor): void {
  outputEditor.value = editor
  bindEditorScrollSync()
  syncEditorScroll(inputEditor.value ?? editor, editor)
}

function toggleFollowScroll(): void {
  followScroll.value = !followScroll.value
  if (followScroll.value && inputEditor.value && outputEditor.value) {
    syncEditorScroll(inputEditor.value, outputEditor.value)
  }
}

if (!import.meta.env.SSR) {
  waitForMonacoReady()
    .then(() => import('@guolao/vue-monaco-editor'))
    .then((mod) => {
      MonacoEditor.value = mod.VueMonacoEditor
    })
}

// Editor options
const editorOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on' as const,
  wordWrap: 'on' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  folding: true,
  foldingStrategy: 'indentation' as const,
  // Enable clipboard operations
  copyWithSyntaxHighlighting: false,
}

// Handle editor mount to ensure paste works
function onEditorMount(editor: MonacoEditorNamespace.IStandaloneCodeEditor) {
  inputEditor.value = editor
  bindEditorScrollSync()
  // Focus the editor
  editor.focus()

  // Ensure paste action is available
  editor.addAction({
    id: 'paste-from-clipboard',
    label: 'Paste',
    keybindings: [
      // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyV
      2048 | 52, // Ctrl/Cmd + V
    ],
    run: async () => {
      try {
        // Goes through the plugin clipboard SDK, not `navigator.clipboard`, so the read is
        // subject to the manifest's `clipboard.read` permission gate like every other path.
        const { text } = await clipboard.read()
        const selection = editor.getSelection()
        if (!selection) {
          return
        }
        editor.executeEdits('paste', [
          {
            range: selection,
            text,
            forceMoveMarkers: true,
          },
        ])
      }
      catch (e) {
        console.warn('Paste failed:', e)
      }
    },
  })
}

const outputEditorOptions = {
  ...editorOptions,
  readOnly: true,
}

// Watch input changes for auto-execution
watch(
  [inputJson, queryExpression],
  () => {
    if (inputJson.value.trim()) {
      executeQuery()
    }
    else {
      outputJson.value = ''
      errorMessage.value = ''
      isValidJson.value = true
    }
  },
  { immediate: true },
)

// Handle keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    executeQuery()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('focus', focusInputEditor)
  await forceMaxCoreBox()
  focusInputEditor()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('focus', focusInputEditor)
  inputScrollDisposable?.dispose()
  outputScrollDisposable?.dispose()
  if (focusTimer !== undefined) {
    window.clearTimeout(focusTimer)
  }
  if (scrollSyncFrame !== undefined) {
    window.cancelAnimationFrame(scrollSyncFrame)
  }
})
</script>

<template>
  <div h-full w-full flex flex-col>
    <!-- Header -->
    <header
      flex="~ items-center justify-between"
      h-9
      shrink-0
      border-b
      border-gray-200
      px-3
      dark:border-gray-700
    >
      <!-- Left: Input actions -->
      <div flex="~ items-center gap-0.5">
        <button class="toolbar-btn group" @click="pasteFromClipboard">
          <div i-carbon-paste />
          <span class="btn-text">粘贴</span>
        </button>
        <button class="toolbar-btn group" @click="formatJson">
          <div i-carbon-code />
          <span class="btn-text">格式化</span>
        </button>
        <button class="toolbar-btn group" @click="minifyJson">
          <div i-carbon-minimize />
          <span class="btn-text">压缩</span>
        </button>
        <button class="toolbar-btn group" @click="validateJson">
          <div i-carbon-checkmark />
          <span class="btn-text">验证</span>
        </button>
        <button class="toolbar-btn group" @click="sortKeys">
          <div i-carbon-sort-ascending />
          <span class="btn-text">排序</span>
        </button>
      </div>

      <!-- Center: Convert actions -->
      <div flex="~ items-center gap-0.5">
        <button class="toolbar-btn group" @click="toYaml">
          <div i-carbon-document />
          <span class="btn-text">YAML</span>
        </button>
        <button class="toolbar-btn group" @click="toXml">
          <div i-carbon-document-blank />
          <span class="btn-text">XML</span>
        </button>
        <div class="toolbar-divider" />
        <button class="toolbar-btn group" @click="escapeJson">
          <div i-carbon-quotes />
          <span class="btn-text">转义</span>
        </button>
        <button class="toolbar-btn group" @click="unescapeJson">
          <div i-carbon-text-clear-format />
          <span class="btn-text">反转义</span>
        </button>
        <div class="toolbar-divider" />
        <button class="toolbar-btn group" @click="flattenJson">
          <div i-carbon-flow />
          <span class="btn-text">扁平化</span>
        </button>
        <button class="toolbar-btn group" @click="diffJson">
          <div i-carbon-compare />
          <span class="btn-text">对比</span>
        </button>
      </div>

      <!-- Right: Output actions -->
      <div flex="~ items-center gap-0.5">
        <button
          class="toolbar-btn group"
          :class="{ 'is-active': followScroll }"
          :aria-pressed="followScroll"
          :aria-label="followScroll ? '关闭跟随滚动' : '开启跟随滚动'"
          :title="followScroll ? '关闭跟随滚动' : '开启跟随滚动'"
          @click="toggleFollowScroll"
        >
          <div v-if="followScroll" i-carbon-link />
          <div v-else i-carbon-unlink />
          <span class="btn-text">跟随</span>
        </button>
        <button class="toolbar-btn group" @click="copyOutput">
          <div i-carbon-copy />
          <span class="btn-text">复制</span>
        </button>
        <button class="toolbar-btn group" @click="swapEditors">
          <div i-carbon-arrows-horizontal />
          <span class="btn-text">交换</span>
        </button>
        <button class="toolbar-btn group" @click="clearAll">
          <div i-carbon-trash-can />
          <span class="btn-text">清空</span>
        </button>
      </div>
    </header>

    <!-- Main content -->
    <div flex="~ 1" min-h-0 overflow-hidden>
      <!-- Left: Input Editor -->
      <div flex="~ col" w="1/2" border-r border-gray-200 dark:border-gray-700>
        <component
          :is="MonacoEditor"
          v-if="MonacoEditor"
          v-model:value="inputJson"
          language="json"
          :theme="editorTheme"
          :options="editorOptions"
          class="h-full w-full"
          @mount="onEditorMount"
        />
      </div>

      <!-- Right: Output Editor -->
      <div flex="~ col" w="1/2" relative>
        <component
          :is="MonacoEditor"
          v-if="MonacoEditor"
          v-model:value="outputJson"
          :language="outputLanguage"
          :theme="editorTheme"
          :options="outputEditorOptions"
          class="h-full w-full"
          @mount="onOutputEditorMount"
        />

        <!-- Floating Toast Notification -->
        <Transition name="toast">
          <div
            v-if="showToast || errorMessage"
            flex="~ items-center gap-2"
            fixed
            bottom-16
            right-4
            z-50
            rounded-lg
            px-4
            py-3
            shadow-lg
            :class="
              errorMessage
                ? 'bg-red-500 text-white'
                : toastType === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
            "
          >
            <div
              :class="
                errorMessage
                  ? 'i-carbon-warning'
                  : toastType === 'success'
                    ? 'i-carbon-checkmark-filled'
                    : 'i-carbon-warning'
              "
              text-lg
            />
            <span text-sm>{{ errorMessage || toastMessage }}</span>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Footer: Query Expression -->
    <footer
      flex="~ items-center gap-2"
      h-10
      shrink-0
      border-t
      border-gray-200
      px-4
      dark:border-gray-700
    >
      <span text-sm text-gray-500>this</span>
      <input
        v-model="queryExpression"
        type="text"
        placeholder="Object.values(this).map(x=>x.map(y=>y.name))"
        flex-1
        border
        border-gray-300
        rounded
        bg-transparent
        px-3
        py-1
        text-sm
        outline-none
        dark:border-gray-600
        focus:border-blue-500
      >

      <!-- Status indicator -->
      <div
        v-if="inputJson.trim() && !errorMessage"
        flex="~ items-center gap-1"
        text-sm
        :class="isValidJson ? 'text-green-500' : 'text-red-500'"
      >
        <div
          :class="isValidJson ? 'i-carbon-checkmark-filled' : 'i-carbon-close-filled'"
          text-base
        />
        {{ isValidJson ? "Valid JSON" : "Invalid JSON" }}
      </div>
    </footer>
  </div>
</template>

<style scoped>
.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  height: 26px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 14px;
  color: #666;
  transition: all 0.2s ease;
  overflow: hidden;
  white-space: nowrap;
}

.toolbar-btn.is-active {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
}

.toolbar-btn:hover {
  background: rgba(128, 128, 128, 0.12);
  color: #333;
  gap: 4px;
}

.toolbar-btn:active {
  transform: scale(0.95);
}

.btn-text {
  max-width: 0;
  opacity: 0;
  font-size: 12px;
  transition: all 0.2s ease;
}

.toolbar-btn:hover .btn-text {
  max-width: 60px;
  opacity: 1;
}

:root.dark .toolbar-btn {
  color: #aaa;
}

:root.dark .toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.toolbar-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: rgba(128, 128, 128, 0.25);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>

<route lang="yaml">
meta:
  layout: json
</route>
