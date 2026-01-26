<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

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

function hashCode(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1)
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  return Math.abs(hash).toString(36)
}

const highlightSeed = `${props.lang || 'text'}:${props.code || ''}`
const highlightedHtml = useState<string>(`tuff-code-${hashCode(highlightSeed)}`, () => '')
let highlighterPromise: Promise<any> | null = null
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

function extractHighlightedCode(html: string) {
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
  return match?.[1] ?? ''
}

async function resolveHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((mod) => {
      const { createHighlighter } = mod
      return createHighlighter({
        themes: ['github-dark'],
        langs: ['vue', 'ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'scss', 'bash', 'shell', 'yaml', 'md'],
      })
    })
  }
  return highlighterPromise
}

async function updateHighlight() {
  const code = props.code?.trim()
  if (!code) {
    highlightedHtml.value = ''
    return
  }
  try {
    const highlighter = await resolveHighlighter()
    const html = highlighter.codeToHtml(props.code, {
      lang: props.lang || 'text',
      theme: 'github-dark',
    })
    highlightedHtml.value = extractHighlightedCode(html)
  }
  catch {
    highlightedHtml.value = ''
  }
}

if (import.meta.server)
  await updateHighlight()

onMounted(() => {
  if (!highlightedHtml.value)
    void updateHighlight()
})
</script>

<template>
  <div class="tuff-code-block" :class="{ 'tuff-code-block--embedded': props.embedded }">
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
      <button
        v-if="canCopy"
        type="button"
        class="tuff-code-block__copy"
        @click="handleCopy"
      >
        <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
        {{ copyLabel }}
      </button>
    </div>
    <pre class="tuff-code-block__pre">
      <button
        v-if="props.embedded && canCopy"
        type="button"
        class="tuff-code-block__copy tuff-code-block__copy--floating"
        @click="handleCopy"
      >
        <span :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
        {{ copyLabel }}
      </button>
      <code
        v-if="highlightedHtml"
        :class="['tuff-code-block__code', `language-${props.lang}`]"
        v-html="highlightedHtml"
      />
      <code
        v-else
        :class="['tuff-code-block__code', `language-${props.lang}`]"
        v-text="props.code"
      />
    </pre>
  </div>
</template>

<style scoped>
.tuff-code-block {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--docs-border) 70%, transparent);
  background: linear-gradient(180deg, rgba(12, 14, 18, 0.98), rgba(6, 8, 12, 0.98));
  box-shadow: 0 22px 60px rgba(8, 10, 15, 0.35);
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
  background: linear-gradient(90deg, rgba(20, 22, 28, 0.96), rgba(10, 12, 18, 0.95));
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
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.tuff-code-block__copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tuff-code-block__copy--floating {
  position: absolute;
  top: 14px;
  right: 14px;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  font-size: 10px;
  z-index: 1;
}

.tuff-code-block__copy:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.14);
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

:global(.dark .tuff-code-block),
:global([data-theme='dark'] .tuff-code-block) {
  border-color: rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(10, 12, 18, 0.96), rgba(6, 8, 12, 0.98));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}

:global(.dark .tuff-code-block--embedded),
:global([data-theme='dark'] .tuff-code-block--embedded) {
  background: transparent;
  border: none;
  box-shadow: none;
}
</style>
