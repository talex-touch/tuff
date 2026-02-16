<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface HljsApi {
  highlight: (code: string, options: { language: string }) => { value: string }
  getLanguage?: (language: string) => unknown
}

declare global {
  interface Window {
    hljs?: HljsApi
  }
}

const props = withDefaults(defineProps<{
  code?: string
  lang?: string
  maxHeight?: number
}>(), {
  code: '',
  lang: 'typescript',
  maxHeight: 240,
})

const { locale } = useI18n()

const renderedHtml = ref('')
const loading = ref(false)
const hasError = ref(false)

const HLJS_SCRIPT_ID = 'doc-code-renderer-hljs-script'
const HLJS_STYLE_ID = 'doc-code-renderer-hljs-style'
const HLJS_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/lib/common.min.js'
const HLJS_STYLE_URL = 'https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github-dark.min.css'

let highlighterLoadPromise: Promise<HljsApi | null> | null = null

const resolvedLang = computed(() => props.lang.trim().toLowerCase() || 'plaintext')
const escapedCode = computed(() => escapeHtml(props.code))
const loadingLabel = computed(() => (locale.value.startsWith('zh') ? '代码高亮加载中…' : 'Loading code highlighting...'))
const fallbackLabel = computed(() => (locale.value.startsWith('zh') ? '高亮资源不可用，已降级为纯文本。' : 'Highlighting unavailable, fallback to plain text.'))

function escapeHtml(source: string): string {
  return source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function ensureThemeStyle() {
  if (!import.meta.client || document.getElementById(HLJS_STYLE_ID))
    return

  const link = document.createElement('link')
  link.id = HLJS_STYLE_ID
  link.rel = 'stylesheet'
  link.href = HLJS_STYLE_URL
  document.head.appendChild(link)
}

function loadHighlightJs(): Promise<HljsApi | null> {
  if (!import.meta.client)
    return Promise.resolve(null)

  if (window.hljs)
    return Promise.resolve(window.hljs)

  if (highlighterLoadPromise)
    return highlighterLoadPromise

  ensureThemeStyle()

  highlighterLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(HLJS_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.hljs ?? null), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('highlight.js CDN failed')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = HLJS_SCRIPT_ID
    script.src = HLJS_SCRIPT_URL
    script.async = true
    script.onload = () => resolve(window.hljs ?? null)
    script.onerror = () => reject(new Error('highlight.js CDN failed'))
    document.head.appendChild(script)
  })

  return highlighterLoadPromise
}

async function renderCode() {
  const source = props.code.trim()

  if (!source) {
    renderedHtml.value = ''
    hasError.value = false
    return
  }

  if (!import.meta.client) {
    renderedHtml.value = escapedCode.value
    return
  }

  loading.value = true
  hasError.value = false

  try {
    const hljs = await loadHighlightJs()
    if (!hljs) {
      renderedHtml.value = escapedCode.value
      hasError.value = true
      return
    }

    const language = hljs.getLanguage?.(resolvedLang.value) ? resolvedLang.value : 'plaintext'
    renderedHtml.value = hljs.highlight(props.code, { language }).value
  }
  catch {
    renderedHtml.value = escapedCode.value
    hasError.value = true
  }
  finally {
    loading.value = false
  }
}

watch(
  () => [props.code, resolvedLang.value],
  () => {
    void renderCode()
  },
  { immediate: true },
)
</script>

<template>
  <div class="doc-code-renderer">
    <div v-if="loading" class="doc-code-renderer__loading" :aria-label="loadingLabel">
      <TxSpinner :size="14" />
      <span>{{ loadingLabel }}</span>
    </div>

    <TxCard
      variant="plain"
      background="mask"
      shadow="none"
      :radius="10"
      :padding="0"
      class="doc-code-renderer__card"
    >
      <pre class="doc-code-renderer__pre" :style="{ maxHeight: `${props.maxHeight}px` }">
        <code
          class="doc-code-renderer__code hljs"
          :class="`language-${resolvedLang}`"
          v-html="renderedHtml || escapedCode"
        />
      </pre>
    </TxCard>

    <p v-if="hasError" class="doc-code-renderer__fallback">
      {{ fallbackLabel }}
    </p>
  </div>
</template>

<style scoped>
.doc-code-renderer {
  width: 100%;
}

.doc-code-renderer__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #94a3b8) 90%, transparent);
}

.doc-code-renderer__pre {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 8%, transparent);
}

.doc-code-renderer__card {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 78%, transparent);
}

.doc-code-renderer__code {
  display: block;
  min-width: 0;
  background: transparent !important;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.52;
  white-space: pre;
}

.doc-code-renderer__fallback {
  margin: 6px 0 0;
  font-size: 11px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #94a3b8) 86%, transparent);
}
</style>
