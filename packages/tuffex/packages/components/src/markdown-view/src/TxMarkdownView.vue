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
</style>
