<script setup lang="ts">
import type { MarkdownViewProps } from './types'
import { marked } from 'marked'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasDocument } from '@talex-touch/utils/env'

defineOptions({
  name: 'TxMarkdownView',
})

const props = withDefaults(defineProps<MarkdownViewProps>(), {
  sanitize: true,
  theme: 'auto',
})

marked.setOptions({
  gfm: true,
  breaks: true,
})

const sanitizer = ref<null | ((html: string) => string)>(null)
const autoTheme = ref<'light' | 'dark'>('light')
let themeObserver: MutationObserver | null = null

onMounted(async () => {
  if (!props.sanitize)
    return

  try {
    const mod = await import('dompurify')
    const dp = mod.default
    sanitizer.value = (html: string) => dp.sanitize(html)
  }
  catch {
    sanitizer.value = null
  }
})

function resolveAutoTheme(): 'light' | 'dark' {
  if (!hasDocument())
    return 'light'

  const root = document.documentElement
  const body = document.body
  const dataTheme = root.getAttribute('data-theme') || body?.getAttribute('data-theme')

  if (dataTheme === 'dark')
    return 'dark'
  if (dataTheme === 'light')
    return 'light'
  if (root.classList.contains('dark') || body?.classList.contains('dark'))
    return 'dark'
  if (root.classList.contains('light') || body?.classList.contains('light'))
    return 'light'

  return 'light'
}

function syncAutoTheme(): void {
  autoTheme.value = resolveAutoTheme()
}

function setupThemeObserver(): void {
  if (!hasDocument() || typeof MutationObserver === 'undefined')
    return

  const root = document.documentElement
  themeObserver?.disconnect()
  themeObserver = new MutationObserver(() => {
    syncAutoTheme()
  })
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
}

onMounted(() => {
  if (props.theme !== 'auto')
    return

  syncAutoTheme()
  setupThemeObserver()
})

watch(
  () => props.theme,
  (next) => {
    if (next === 'auto') {
      syncAutoTheme()
      setupThemeObserver()
      return
    }

    themeObserver?.disconnect()
    themeObserver = null
  },
)

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

const rawHtml = computed(() => {
  return marked.parse(props.content ?? '') as string
})

const safeHtml = computed(() => {
  if (!props.sanitize)
    return rawHtml.value
  return sanitizer.value ? sanitizer.value(rawHtml.value) : rawHtml.value
})

const resolvedTheme = computed<'light' | 'dark'>(() => {
  const theme = props.theme ?? 'auto'
  const normalized = theme === 'auto' ? autoTheme.value : theme
  return normalized === 'dark' ? 'dark' : 'light'
})
</script>

<template>
  <div class="tx-markdown-view" :class="resolvedTheme" :data-theme="resolvedTheme">
    <div class="markdown-body" v-html="safeHtml" />
  </div>
</template>

<style lang="scss">
@import './github-markdown.css';

.tx-markdown-view {
  font-size: 14px;
  line-height: 1.7;

  .markdown-body {
    // Headings
    h1, h2, h3, h4, h5, h6 {
      font-weight: 600;
      line-height: 1.4;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }

    h1 { font-size: 1.75em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }

    // Links
    a {
      color: var(--tx-color-primary, #409eff);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    // Code blocks
    pre {
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      background-color: var(--tx-fill-color-darker, #f6f8fa);
      border: 1px solid var(--tx-border-color-light, #e4e7ed);

      code {
        background: transparent;
        padding: 0;
        border-radius: 0;
        font-size: 13px;
        line-height: 1.6;
      }
    }

    // Inline code
    code {
      background-color: var(--tx-fill-color, #f0f2f5);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 0.9em;
    }

    // Blockquote
    blockquote {
      border-left: 4px solid var(--tx-color-primary-light-5, #a0cfff);
      background-color: var(--tx-fill-color-lighter, #fafcff);
      padding: 12px 16px;
      margin: 16px 0;
      color: var(--tx-text-color-secondary, #606266);

      p {
        margin: 0;
      }
    }

    // Tables
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;

      th, td {
        border: 1px solid var(--tx-border-color-light, #e4e7ed);
        padding: 10px 14px;
        text-align: left;
      }

      th {
        background-color: var(--tx-fill-color-light, #fafafa);
        font-weight: 600;
      }

      tr:nth-child(2n) {
        background-color: var(--tx-fill-color-lighter, #fafcff);
      }
    }

    // Lists
    ul, ol {
      padding-left: 1.5em;

      li {
        margin-bottom: 4px;
      }
    }

    // Paragraphs
    p {
      margin: 8px 0;
    }

    // Horizontal rule
    hr {
      border: none;
      border-top: 1px solid var(--tx-border-color-light, #e4e7ed);
      margin: 24px 0;
    }

    // Images
    img {
      max-width: 100%;
      border-radius: 8px;
    }
  }

  // Dark mode overrides
  &.dark .markdown-body {
    pre {
      background-color: var(--tx-fill-color-darker, #1a1a1a);
      border-color: var(--tx-border-color, #414243);
    }

    code {
      background-color: var(--tx-fill-color, #2a2a2a);
    }

    blockquote {
      background-color: var(--tx-fill-color, #1e1e1e);
      border-left-color: var(--tx-color-primary-light-3, #79bbff);
    }

    table {
      th {
        background-color: var(--tx-fill-color, #2a2a2a);
      }

      tr:nth-child(2n) {
        background-color: var(--tx-fill-color-lighter, #1e1e1e);
      }

      th, td {
        border-color: var(--tx-border-color, #414243);
      }
    }
  }
}
</style>
