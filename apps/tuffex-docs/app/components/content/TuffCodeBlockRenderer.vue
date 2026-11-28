<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatDocsCodeLanguage } from '~/utils/docs-code-language'
import { formatInstallCommand, PACKAGE_MANAGERS, parseInstallCommand, type PackageManager } from '~/utils/docs-install-command'

/**
 * Build-time Shiki Code Block Renderer:
 * - Renders pre-highlighted `codeHtml` (injected by `remark-shiki-code-props`) directly!
 * - Cleanly falls back to escaped `<pre><code>` when `codeHtml` is absent.
 * - ZERO client `highlight.ts`, ZERO `window.hljs` `setInterval` polling, ZERO jsDelivr CDN scripts!
 */

const props = withDefaults(defineProps<{
  code: string
  codeHtml?: string
  lang?: string
  title?: string
  embedded?: boolean
}>(), {
  codeHtml: '',
  lang: 'vue',
  title: '',
  embedded: false,
})

const { locale } = useI18n()
const copied = ref(false)
const copiedInstall = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let copiedInstallTimer: ReturnType<typeof setTimeout> | null = null
const mermaidRef = ref<HTMLElement | null>(null)

const isZh = computed(() => locale.value === 'zh')
const canCopy = computed(() => Boolean(props.code?.trim()))
const resolvedTitle = computed(() => {
  const customTitle = props.title?.trim()
  if (customTitle)
    return customTitle
  return formatDocsCodeLanguage(props.lang, isZh.value ? '文本' : 'Text')
})
const copyLabel = computed(() => (copied.value ? (isZh.value ? '已复制' : 'Copied') : (isZh.value ? '复制' : 'Copy')))
const showHeader = computed(() => !props.embedded)
const isMermaid = computed(() => (props.lang || '').toLowerCase() === 'mermaid')
const hasPreHighlightedHtml = computed(() => !isMermaid.value && Boolean(props.codeHtml?.trim()))

const MANAGERS = PACKAGE_MANAGERS
const install = computed(() => (props.embedded || props.title ? null : parseInstallCommand(props.code, props.lang)))
const manager = useState<PackageManager>('docs-install-manager', () => 'pnpm')
const installCommand = computed(() => (install.value ? formatInstallCommand(install.value, manager.value) : ''))

const installLabels = computed(() => (
  isZh.value
    ? { copy: '复制命令', copied: '已复制', manager: '包管理器' }
    : { copy: 'Copy command', copied: 'Copied', manager: 'Package manager' }
))

async function renderMermaidCode() {
  if (!import.meta.client || !isMermaid.value)
    return
  const source = props.code?.trim()
  if (!source)
    return
  await nextTick()
  const node = mermaidRef.value
  if (!node)
    return
  node.removeAttribute('data-processed')
  const { renderMermaidInDocument } = await import('~/utils/mermaid-renderer')
  await renderMermaidInDocument(node.parentElement ?? node)
}

onMounted(() => {
  void renderMermaidCode()
})

watch(() => [props.code, isMermaid.value] as const, () => {
  void renderMermaidCode()
})

async function copyText(text: string, which: 'code' | 'install') {
  if (!import.meta.client || !text.trim())
    return
  try {
    await navigator.clipboard.writeText(text)
    if (which === 'code') {
      copied.value = true
      if (copiedTimer)
        clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copied.value = false
        copiedTimer = null
      }, 1500)
    }
    else {
      copiedInstall.value = true
      if (copiedInstallTimer)
        clearTimeout(copiedInstallTimer)
      copiedInstallTimer = setTimeout(() => {
        copiedInstall.value = false
        copiedInstallTimer = null
      }, 1500)
    }
  }
  catch {
    // ignore clipboard rejection
  }
}

onBeforeUnmount(() => {
  if (copiedTimer)
    clearTimeout(copiedTimer)
  if (copiedInstallTimer)
    clearTimeout(copiedInstallTimer)
})
</script>

<template>
  <div v-if="install" class="tuff-code-block tuff-code-block--install not-prose">
    <div class="tuff-install__head">
      <div class="tuff-install__tabs" role="tablist" :aria-label="installLabels.manager">
        <button
          v-for="name in MANAGERS"
          :key="name"
          type="button"
          role="tab"
          class="tuff-install__tab"
          :class="{ 'is-active': manager === name }"
          :aria-selected="manager === name"
          @click="manager = name"
        >
          {{ name }}
        </button>
      </div>
      <button
        type="button"
        class="tuff-code-block__copy tuff-install__copy"
        :class="{ 'is-copied': copiedInstall }"
        :aria-label="copiedInstall ? installLabels.copied : installLabels.copy"
        :title="copiedInstall ? installLabels.copied : installLabels.copy"
        @click="copyText(installCommand, 'install')"
      >
        <span :class="copiedInstall ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
      </button>
    </div>
    <div class="tuff-install__command">
      <span class="tuff-install__prompt" aria-hidden="true">$</span>
      <code>{{ installCommand }}</code>
    </div>
  </div>

  <div v-else class="tuff-code-block not-prose" :class="{ 'tuff-code-block--embedded': props.embedded }">
    <div v-if="showHeader" class="tuff-code-block__header">
      <div class="tuff-code-block__meta">
        <div class="tuff-code-block__title">
          {{ resolvedTitle }}
        </div>
      </div>
      <button
        v-if="canCopy"
        type="button"
        class="tuff-code-block__copy"
        :class="{ 'is-copied': copied }"
        :aria-label="copyLabel"
        @click="copyText(props.code, 'code')"
      >
        <span class="tuff-code-block__copy-icon" :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
        <span>{{ copyLabel }}</span>
      </button>
    </div>

    <div class="tuff-code-block__body">
      <button
        v-if="props.embedded && canCopy"
        type="button"
        class="tuff-code-block__copy tuff-code-block__copy--floating"
        :class="{ 'is-copied': copied }"
        :aria-label="copyLabel"
        @click="copyText(props.code, 'code')"
      >
        <span class="tuff-code-block__copy-icon" :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
        <span>{{ copyLabel }}</span>
      </button>

      <div
        v-if="isMermaid"
        ref="mermaidRef"
        class="tuff-code-block__mermaid mermaid"
        v-text="props.code"
      />
      <!-- Build-time Shiki highlighted HTML -->
      <div
        v-else-if="hasPreHighlightedHtml"
        class="tuff-code-block__shiki"
        v-html="props.codeHtml"
      />
      <!-- Plain escaped fallback (ZERO client hljs!) -->
      <pre v-else class="tuff-code-block__pre"><code :class="['tuff-code-block__code', `language-${props.lang}`]" v-text="props.code" /></pre>
    </div>
  </div>
</template>

<style scoped>
.tuff-code-block {
  --tuff-code-radius: 14px;
  --tuff-code-surface: var(--docs-code-bg, #f6f8fa);
  --tuff-code-header: var(--tx-fill-color-light, #eef1f6);
  --tuff-code-border: var(--docs-code-border, #e4e7ed);
  --tuff-code-hairline: var(--docs-border-light, #ebeef5);
  --tuff-code-ink: var(--docs-ink, #1f2328);
  --tuff-code-muted: var(--docs-muted, #6e7781);
  --tuff-code-copied-ink: color-mix(in srgb, var(--tx-color-success) 55%, var(--tuff-code-ink));

  margin: 16px 0;
  border-radius: var(--tuff-code-radius);
  overflow: hidden;
  border: 1px solid var(--tuff-code-border);
  background: var(--tuff-code-surface);
}

.tuff-code-block--embedded {
  margin: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
}

.tuff-code-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid var(--tuff-code-hairline);
  background: var(--tuff-code-header);
}

.tuff-code-block__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tuff-code-block__title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--tuff-code-muted);
}

.tuff-code-block__body {
  position: relative;
}

.tuff-code-block__copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--docs-ink-regular);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.tuff-code-block__copy:hover {
  background: color-mix(in srgb, var(--tuff-code-ink) 7%, transparent);
  color: var(--tuff-code-ink);
}

.tuff-code-block__copy:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: -2px;
}

.tuff-code-block__copy.is-copied {
  color: var(--tuff-code-copied-ink);
}

.tuff-code-block__copy-icon {
  flex: none;
  font-size: 13px;
}

.tuff-code-block__copy--floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
}

.tuff-code-block__pre,
.tuff-code-block__shiki :deep(pre) {
  margin: 0;
  padding: 18px 20px;
  overflow-x: auto;
  background: transparent !important;
  color: var(--tuff-code-ink);
  font-family: var(--docs-mono-font);
  font-size: 0.875rem;
  line-height: 1.68;
  tab-size: 2;
}

.tuff-code-block__code,
.tuff-code-block__shiki :deep(code) {
  font-family: var(--docs-mono-font);
  font-size: inherit;
  line-height: inherit;
  white-space: pre;
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
}

.tuff-code-block__mermaid {
  padding: 16px;
  overflow-x: auto;
}

.tuff-install__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tuff-code-hairline);
  background: var(--tuff-code-header);
}

.tuff-install__tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tuff-install__tab {
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tuff-code-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.tuff-install__tab.is-active {
  background: var(--docs-surface);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink);
  font-weight: 600;
}

.tuff-install__copy {
  width: 28px;
  height: 28px;
  padding: 0;
  justify-content: center;
  border-radius: 8px;
}

.tuff-install__command {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  overflow-x: auto;
  color: var(--tuff-code-ink);
  font-family: var(--docs-mono-font);
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: nowrap;
}

.tuff-install__prompt {
  color: var(--tuff-code-muted);
  user-select: none;
}

:global(.dark .tuff-code-block),
:global([data-theme='dark'] .tuff-code-block) {
  --tuff-code-surface: rgba(16, 17, 20, 0.94);
  --tuff-code-header: rgba(24, 25, 30, 0.96);
  --tuff-code-border: rgba(255, 255, 255, 0.09);
  --tuff-code-hairline: rgba(255, 255, 255, 0.07);
}
</style>
