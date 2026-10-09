<script setup lang="ts">
import type { PackageManager } from '~/utils/docs-install-command'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { formatInstallCommand, PACKAGE_MANAGERS, parseInstallCommand } from '~/utils/docs-install-command'

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
const codeRef = ref<HTMLElement | null>(null)
const mermaidRef = ref<HTMLElement | null>(null)
const highlightKey = ref('')

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

async function highlightCode() {
  if (!import.meta.client || isMermaid.value)
    return

  const source = props.code?.trim() ?? ''
  if (!source)
    return

  const key = `${props.lang ?? ''}:${source}`
  if (highlightKey.value === key)
    return

  await nextTick()
  const node = codeRef.value
  if (!node)
    return

  const { resolveHighlightApi } = await import('~/utils/highlight')
  const api = await resolveHighlightApi()
  if (!api)
    return

  try {
    api.highlightElement(node)
    node.dataset.highlighted = 'true'
    highlightKey.value = key
  }
  catch {
    // ignore highlight errors
  }
}

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
  void highlightCode()
  void renderMermaidCode()
})

watch(
  () => [props.code, props.lang, isMermaid.value],
  () => {
    void highlightCode()
    void renderMermaidCode()
  },
)

async function handleCopy() {
  if (!import.meta.client || !canCopy.value)
    return
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  }
  catch {
    // ignore clipboard errors
  }
}
</script>

<template>
  <!-- data-theme scopes TuffEx's dark tokens to the panel: code blocks are dark
       in both page themes, and the switch and copy button sit on that surface. -->
  <div v-if="install" class="tuff-code-block tuff-code-block--install" data-theme="dark">
    <div class="tuff-install__head">
      <TxFlatRadio v-model="manager" size="sm" :aria-label="installLabels.manager">
        <TxFlatRadioItem v-for="name in MANAGERS" :key="name" :value="name" :label="name" />
      </TxFlatRadio>
      <TxCopyButton
        icon-only
        :text="installCommand"
        :copy-label="installLabels.copy"
        :copied-label="installLabels.copied"
        :failed-label="installLabels.failed"
      />
    </div>
    <div class="tuff-install__command">
      <span class="tuff-install__prompt" aria-hidden="true">$</span>
      <TxTextTransformer :text="installCommand" />
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
    <component :is="isMermaid ? 'div' : 'pre'" class="tuff-code-block__pre">
      <button v-if="props.embedded && canCopy" type="button" class="tuff-code-block__copy tuff-code-block__copy--floating" @click="handleCopy">
        <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
        {{ copyLabel }}
      </button>
      <div
        v-if="isMermaid"
        ref="mermaidRef"
        class="tuff-code-block__mermaid mermaid"
        v-text="props.code"
      />
      <code
        v-else
        ref="codeRef"
        :class="['tuff-code-block__code', 'hljs', `language-${props.lang}`]"
        v-text="props.code"
      />
    </component>
  </div>
</template>

<style scoped>
.tuff-code-block {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--docs-border) 70%, transparent);
  background: linear-gradient(180deg, rgba(16, 14, 12, 0.98), rgba(10, 8, 6, 0.98));
  /*
   * Close and mostly downward. The old 0 22px 60px shadow was invisible on the
   * dark page but a heavy grey slab on the light one, and a full-width block's
   * sideways blur got cut by the column into a box with hard edges.
   */
  box-shadow: 0 1px 2px rgba(16, 14, 12, 0.1), 0 4px 10px -4px rgba(16, 14, 12, 0.3);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(90deg, rgba(24, 20, 18, 0.96), rgba(18, 15, 13, 0.95));
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
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
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
  color: rgba(255, 255, 255, 0.55);
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
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.38rem 0.62rem;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.tuff-code-block__copy:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
}

.tuff-code-block__pre {
  margin: 0;
  padding: 20px 22px 22px;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  overflow-x: auto;
  position: relative;
}

.tuff-code-block__pre code {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  color: rgba(255, 255, 255, 0.96) !important;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92rem;
  line-height: 1.7;
  white-space: pre;
  tab-size: 2;
  -webkit-font-smoothing: antialiased;
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tuff-install__command {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 22px 18px;
  overflow-x: auto;
  color: rgba(255, 255, 255, 0.96);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92rem;
  line-height: 1.7;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
}

.tuff-install__prompt {
  color: rgba(255, 255, 255, 0.32);
  user-select: none;
}

:global(.dark .tuff-code-block),
:global([data-theme='dark'] .tuff-code-block) {
  border-color: rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(16, 14, 12, 0.96), rgba(10, 8, 6, 0.98));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}

:global(.dark .tuff-code-block--embedded),
:global([data-theme='dark'] .tuff-code-block--embedded) {
  background: transparent;
  border: none;
  box-shadow: none;
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
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
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
  background: rgb(16, 14, 12);
  box-shadow: -14px 0 12px rgb(16, 14, 12);
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
  background: rgb(16, 14, 12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.tuff-code-block--install + .tuff-code-block .tuff-code-block__copy:hover {
  background: rgb(36, 33, 30);
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
</style>
