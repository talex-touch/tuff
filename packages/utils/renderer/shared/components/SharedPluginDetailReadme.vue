<script setup lang="ts">
import type { SharedPluginReadme } from '../plugin-detail'
import { computed } from 'vue'

interface Props {
  readme?: SharedPluginReadme
  title?: string
  emptyText?: string
  renderMarkdown?: (markdown: string) => string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'README',
  emptyText: 'No README'
})

const renderedReadme = computed(() => {
  const markdown = props.readme?.markdown?.trim()
  if (!markdown) return ''
  return props.renderMarkdown ? props.renderMarkdown(markdown) : markdown
})
</script>

<template>
  <section class="space-y-3">
    <h3 v-if="title" class="text-sm font-semibold uppercase tracking-wide text-black/70">
      {{ title }}
    </h3>
    <div v-if="renderedReadme" class="prose prose-sm max-w-none">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="renderedReadme" />
    </div>
    <p v-else class="text-sm text-black/60">
      {{ emptyText }}
    </p>
  </section>
</template>
