<script setup lang="ts">
import type { SharedPluginReadme } from '../plugin-detail'
import { marked } from 'marked'
import { computed } from 'vue'

interface Props {
  readme?: SharedPluginReadme
  title?: string
  emptyText?: string
  renderMarkdown?: (markdown: string) => string
  contentClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'README',
  emptyText: 'No README'
})

marked.setOptions({
  breaks: true,
  gfm: true
})

const renderedReadme = computed(() => {
  const markdown = props.readme?.markdown?.trim()
  if (!markdown) return ''
  // NOTE: Markdown is not sanitized; caller should ensure content is trusted or provide a safe renderer.
  return props.renderMarkdown ? props.renderMarkdown(markdown) : marked.parse(markdown)
})
</script>

<template>
  <section class="space-y-3">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-black/70">
      {{ title }}
    </h3>
    <div v-if="renderedReadme" class="prose prose-sm max-w-none" :class="[contentClass]">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="renderedReadme" />
    </div>
    <p v-else class="text-sm text-black/60">
      {{ emptyText }}
    </p>
  </section>
</template>
