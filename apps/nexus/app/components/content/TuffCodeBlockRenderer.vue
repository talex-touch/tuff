<script setup lang="ts">
import type { PackageManager } from '~/utils/docs-install-command'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatInstallCommand, PACKAGE_MANAGERS, parseInstallCommand } from '~/utils/docs-install-command'
import { highlightCodeToHtml } from '~/utils/highlight'

const props = withDefaults(defineProps<{
  code: string
  lang?: string
  title?: string
  embedded?: boolean
}>(), {
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

const canCopy = computed(() => Boolean(props.code?.trim()))
const resolvedTitle = computed(() => {
  if (props.title)
    return props.title
  const lang = (props.lang || 'txt').toUpperCase()
  return `EXAMPLE.${lang}`
})
const copyLabel = computed(() => {
  const isZh = locale.value === 'zh'
  if (copied.value)
    return isZh ? '已复制' : 'Copied'
  return isZh ? '复制' : 'Copy'
})

const showHeader = computed(() => !props.embedded)
const isMermaid = computed(() => (props.lang || '').toLowerCase() === 'mermaid')
const highlightedCodeHtml = computed(() => (isMermaid.value ? '' : highlightCodeToHtml(props.code ?? '', props.lang)))

/*
 * A one-line `pnpm add` / `pnpm dlx` block is an install command: it renders as
 * a package-manager switch over the command, so readers copy the one they use.
 * The rules for what qualifies live in utils/docs-install-command.
 */
const MANAGERS = PACKAGE_MANAGERS
// A block with a title of its own keeps the ordinary renderer, which shows it.
const install = computed(() => (props.embedded || props.title ? null : parseInstallCommand(props.code, props.lang)))

// One choice for every install block on the page, kept across client navigation.
const manager = useState<PackageManager>('docs-install-manager', () => 'pnpm')
const installCommand = computed(() => (install.value ? formatInstallCommand(install.value, manager.value) : ''))

const installLabels = computed(() => (locale.value === 'zh'
  ? { copy: '复制命令', copied: '已复制', failed: '复制失败', manager: '包管理器' }
  : { copy: 'Copy command', copied: 'Copied', failed: 'Copy failed', manager: 'Package manager' }))

async function renderMermaidCode() {
  if (!import.meta.client || !isMermaid.value)
    return

  const source = props.code?.trim() ?? ''
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

watch(
  () => [props.code, props.lang, isMermaid.value],
  () => {
    void renderMermaidCode()
  },
)

onBeforeUnmount(() => {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
  if (copiedInstallTimer) {
    clearTimeout(copiedInstallTimer)
    copiedInstallTimer = null
  }
})

async function copyWithFeedback(text: string, flag: typeof copied, timerRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (!import.meta.client || !text.trim())
    return
  try {
    await navigator.clipboard.writeText(text)
    flag.value = true
    if (timerRef.current)
      clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      flag.value = false
      timerRef.current = null
    }, 1600)
  }
  catch {
    // ignore clipboard errors
  }
}

async function handleCopy() {
  if (!canCopy.value)
    return
  await copyWithFeedback(props.code, copied, {
    get current() { return copiedTimer },
    set current(v) { copiedTimer = v },
  })
}

async function handleCopyInstall() {
  await copyWithFeedback(installCommand.value, copiedInstall, {
    get current() { return copiedInstallTimer },
    set current(v) { copiedInstallTimer = v },
  })
}
</script>

<template>
  <!-- The panel follows the page theme, so the switch follows TuffEx's surface tokens. -->
  <div v-if="install" class="tuff-code-block tuff-code-block--install">
    <div class="tuff-install__head">
      <TxFlatRadio v-model="manager" size="sm" :aria-label="installLabels.manager">
        <TxFlatRadioItem v-for="name in MANAGERS" :key="name" :value="name" :label="name" />
      </TxFlatRadio>
      <button
        type="button"
        class="tuff-code-block__copy tuff-install__copy"
        :aria-label="copiedInstall ? installLabels.copied : installLabels.copy"
        :title="copiedInstall ? installLabels.copied : installLabels.copy"
        @click="handleCopyInstall"
      >
        <span :class="copiedInstall ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
      </button>
    </div>
    <div class="tuff-install__command">
      <span class="tuff-install__prompt" aria-hidden="true">$</span>
      <code>{{ installCommand }}</code>
    </div>
  </div>
  <div v-else class="tuff-code-block" :class="{ 'tuff-code-block--embedded': props.embedded }">
    <div v-if="showHeader" class="tuff-code-block__header">
      <div class="tuff-code-block__meta">
        <div class="tuff-code-block__dots" aria-hidden="true">
          <span class="tuff-code-block__dot is-red" />
          <span class="tuff-code-block__dot is-yellow" />
          <span class="tuff-code-block__dot is-green" />
        </div>
        <div class="tuff-code-block__title">
          {{ resolvedTitle }}
        </div>
      </div>
      <button v-if="canCopy" type="button" class="tuff-code-block__copy" @click="handleCopy">
        <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
        {{ copyLabel }}
      </button>
    </div>
    <button v-if="props.embedded && canCopy" type="button" class="tuff-code-block__copy tuff-code-block__copy--floating" @click="handleCopy">
      <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
      {{ copyLabel }}
    </button>
    <component :is="isMermaid ? 'div' : 'pre'" class="tuff-code-block__pre" :class="{ 'tuff-code-block__pre--mermaid': isMermaid }">
      <div
        v-if="isMermaid"
        ref="mermaidRef"
        class="tuff-code-block__mermaid mermaid"
        v-text="props.code"
      />
      <code
        v-else
        :class="['tuff-code-block__code', 'hljs', `language-${props.lang}`]"
        data-highlighted="true"
        v-html="highlightedCodeHtml"
      />
    </component>
  </div>
</template>

<style scoped>
/*
 * Every colour the block paints is one of these, so the install card, the
 * joined snippet and a demo's embedded code all follow the page theme: TuffEx's
 * light surface and ink by default, the warm near-black panel under .dark.
 */
.tuff-code-block {
  --tuff-code-surface: var(--tx-fill-color-light);
  --tuff-code-face: var(--tx-fill-color-light);
  --tuff-code-face-hover: var(--tx-fill-color);
  --tuff-code-header: var(--tx-fill-color);
  --tuff-code-border: var(--tx-border-color-light);
  --tuff-code-hairline: var(--tx-border-color-lighter);
  --tuff-code-shadow: 0 1px 2px rgba(16, 14, 12, 0.05);
  --tuff-code-ink: var(--tx-text-color-primary);
  --tuff-code-muted: var(--tx-text-color-secondary);
  --tuff-code-faint: var(--tx-text-color-placeholder);
  --tuff-code-control: color-mix(in srgb, var(--tx-text-color-primary) 6%, transparent);
  --tuff-code-control-hover: color-mix(in srgb, var(--tx-text-color-primary) 11%, transparent);
  --tuff-code-control-ink: var(--tx-text-color-regular);
  --tuff-code-control-ink-hover: var(--tx-text-color-primary);
  --tuff-code-ring: var(--tx-border-color);
  --tuff-code-dot-ring: rgba(16, 14, 12, 0.12);
  /* hljs tokens, GitHub light */
  --tuff-code-keyword: #d73a49;
  --tuff-code-title: #6f42c1;
  --tuff-code-attr: #005cc5;
  --tuff-code-string: #032f62;
  --tuff-code-builtin: #e36209;
  --tuff-code-comment: #6a737d;
  --tuff-code-tag: #22863a;

  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--tuff-code-border);
  background: var(--tuff-code-surface);
  box-shadow: var(--tuff-code-shadow);
}

.tuff-code-block--embedded {
  border-radius: 0 0 22px 22px;
  border: none;
  background: transparent;
  box-shadow: none;
}

.tuff-code-block__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--tuff-code-hairline);
  background: var(--tuff-code-header);
  justify-content: space-between;
}

.tuff-code-block__meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tuff-code-block__dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tuff-code-block__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--tuff-code-dot-ring);
}

.tuff-code-block__dot.is-red {
  background: #ff5f57;
}

.tuff-code-block__dot.is-yellow {
  background: #febc2e;
}

.tuff-code-block__dot.is-green {
  background: #28c840;
}

.tuff-code-block__title {
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tuff-code-muted);
}

.tuff-code-block__copy--floating {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
}

.tuff-code-block__copy {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 999px;
  background: var(--tuff-code-control);
  color: var(--tuff-code-control-ink);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.38rem 0.62rem;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tuff-code-block__copy:hover {
  background: var(--tuff-code-control-hover);
  color: var(--tuff-code-control-ink-hover);
}

.tuff-code-block__pre {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--tuff-code-ink);
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  scrollbar-width: thin;
}

.tuff-code-block__pre--mermaid {
  padding: 20px 22px 22px;
}

/* The class puts this ahead of the docs page's inline `code` rule; at equal
   specificity its font and size won or lost on stylesheet order. */
.tuff-code-block__pre code.tuff-code-block__code {
  display: block;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
  background: transparent !important;
  border: none !important;
  padding: 18px 22px 20px !important;
  color: var(--tuff-code-ink) !important;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.65;
  white-space: pre;
  tab-size: 2;
  -webkit-font-smoothing: antialiased;
}

.tuff-code-block--embedded .tuff-code-block__pre code.tuff-code-block__code {
  padding-right: 88px !important;
}

.tuff-code-block__pre code .line {
  display: block;
}

.tuff-code-block__mermaid {
  display: block;
  width: 100%;
}

.tuff-code-block__mermaid svg {
  max-width: 100%;
  height: auto;
}

.tuff-install__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 8px 8px 10px;
  border-bottom: 1px solid var(--tuff-code-hairline);
}

.tuff-install__copy {
  width: 28px;
  height: 28px;
  padding: 0;
  justify-content: center;
  border-radius: 8px;
  font-size: 14px;
}

.tuff-install__command {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 16px 22px 18px;
  overflow-x: auto;
  scrollbar-width: thin;
  color: var(--tuff-code-ink);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.65;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}

.tuff-install__prompt {
  color: var(--tuff-code-faint);
  user-select: none;
}

/* Only variables change here, so the embedded variant's own overrides still hold. */
:global(.dark .tuff-code-block),
:global([data-theme='dark'] .tuff-code-block) {
  --tuff-code-surface: linear-gradient(180deg, rgba(16, 14, 12, 0.96), rgba(10, 8, 6, 0.98));
  --tuff-code-face: rgb(16, 14, 12);
  --tuff-code-face-hover: rgb(36, 33, 30);
  --tuff-code-header: linear-gradient(90deg, rgba(24, 20, 18, 0.96), rgba(18, 15, 13, 0.95));
  --tuff-code-border: rgba(255, 255, 255, 0.08);
  --tuff-code-hairline: rgba(255, 255, 255, 0.06);
  --tuff-code-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  --tuff-code-ink: rgba(255, 255, 255, 0.96);
  --tuff-code-muted: rgba(255, 255, 255, 0.55);
  --tuff-code-faint: rgba(255, 255, 255, 0.32);
  --tuff-code-control: rgba(255, 255, 255, 0.06);
  --tuff-code-control-hover: rgba(255, 255, 255, 0.12);
  --tuff-code-control-ink: rgba(255, 255, 255, 0.72);
  --tuff-code-control-ink-hover: rgba(255, 255, 255, 0.92);
  --tuff-code-ring: rgba(255, 255, 255, 0.14);
  --tuff-code-dot-ring: rgba(255, 255, 255, 0.25);
  /* hljs tokens, GitHub dark */
  --tuff-code-keyword: #ff7b72;
  --tuff-code-title: #d2a8ff;
  --tuff-code-attr: #79c0ff;
  --tuff-code-string: #a5d6ff;
  --tuff-code-builtin: #ffa657;
  --tuff-code-comment: #8b949e;
  --tuff-code-tag: #7ee787;
}
</style>

<style>
/*
 * An install command and the import snippet written right after it are one
 * card. Sibling selectors decide it at first paint, so nothing shifts when the
 * page hydrates; every other pair of code blocks keeps its own card.
 */
.tuff-code-block--install:has(+ .tuff-code-block) {
  border-bottom: 0;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  box-shadow: none;
}

.tuff-code-block--install + .tuff-code-block {
  position: relative;
  margin-top: 0 !important;
  border-top: 1px solid var(--tuff-code-hairline);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__pre code.tuff-code-block__code {
  padding-right: 52px !important;
}

/*
 * The joined snippet drops its window chrome. Its copy control floats beside
 * the first line, shaped like the install row's icon-only TxCopyButton, on an
 * opaque face so a long line under it never shows through; it appears with the
 * pointer or focus, and stays on devices that cannot hover.
 */
.tuff-code-block--install + .tuff-code-block .tuff-code-block__header {
  position: absolute;
  top: 14px;
  right: 0;
  z-index: 1;
  padding: 0 14px 0 0;
  border: 0;
  /* opaque to the card's edge, feathered on the left, so no code shows beside it */
  background: var(--tuff-code-face);
  box-shadow: -14px 0 12px var(--tuff-code-face);
  opacity: 0;
  transition: opacity 0.12s ease-out;
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__meta {
  display: none;
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__copy {
  justify-content: center;
  width: 30px;
  height: 30px;
  gap: 0;
  padding: 0;
  border-radius: 8px;
  font-size: 0;
  background: var(--tuff-code-face);
  box-shadow: inset 0 0 0 1px var(--tuff-code-ring);
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__copy:hover {
  background: var(--tuff-code-face-hover);
}

.tuff-code-block--install + .tuff-code-block:hover .tuff-code-block__header,
.tuff-code-block--install + .tuff-code-block:focus-within .tuff-code-block__header {
  opacity: 1;
}

@media (hover: none) {
  .tuff-code-block--install + .tuff-code-block .tuff-code-block__header {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tuff-code-block--install + .tuff-code-block .tuff-code-block__header {
    transition: none;
  }
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__copy > span {
  font-size: 14px;
}

/*
 * Token classes from the local highlighter follow the block's own theme variables
 * so code remains legible on both light and dark surfaces without any external stylesheet.
 */
.tuff-code-block .tuff-code-block__pre :is(.hljs-keyword, .hljs-doctag, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_) {
  color: var(--tuff-code-keyword);
}

.tuff-code-block .tuff-code-block__pre .hljs-title {
  color: var(--tuff-code-title);
}

.tuff-code-block .tuff-code-block__pre :is(.hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id, .hljs-variable) {
  color: var(--tuff-code-attr);
}

.tuff-code-block .tuff-code-block__pre :is(.hljs-string, .hljs-regexp) {
  color: var(--tuff-code-string);
}

.tuff-code-block .tuff-code-block__pre :is(.hljs-built_in, .hljs-symbol) {
  color: var(--tuff-code-builtin);
}

.tuff-code-block .tuff-code-block__pre :is(.hljs-comment, .hljs-code, .hljs-formula) {
  color: var(--tuff-code-comment);
}

.tuff-code-block .tuff-code-block__pre :is(.hljs-name, .hljs-quote, .hljs-selector-pseudo, .hljs-selector-tag) {
  color: var(--tuff-code-tag);
}
</style>
