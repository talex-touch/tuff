<script setup lang="ts">
import { ref } from 'vue'

interface SourceItem {
  id: string
  url: string
  title?: string
  favicon?: string
}

const sources: SourceItem[] = [
  {
    id: 's1',
    url: 'https://vuejs.org/guide/introduction.html',
    title: 'Introduction — Vue.js',
    favicon: 'https://vuejs.org/logo.svg',
  },
  // No title: the row falls back to the hostname, with `www.` stripped.
  { id: 's2', url: 'https://www.developer.mozilla.org/en-US/docs/Web/API/Clipboard' },
  // A favicon that will 404, to show the one-shot failure handling.
  { id: 's3', url: 'https://example.com/spec', title: 'Draft spec', favicon: 'https://example.com/missing.png' },
]

const opened = ref<string | null>(null)

// Links never navigate on their own; the host decides. Here we only report it.
function openSource(source: SourceItem) {
  opened.value = source.url
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <TxSources :sources="sources" default-open @open="openSource" />
    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="opened">
        Host would open: <code>{{ opened }}</code>
      </template>
      <template v-else>
        Click a source — the component emits rather than navigating.
      </template>
    </p>
  </div>
</template>
