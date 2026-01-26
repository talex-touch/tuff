<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  path?: string
}>(), {
  label: '查看源码',
  path: '',
})

const route = useRoute()

const sourceBase = 'https://github.com/talex-touch/tuff/blob/master/'

const autoPath = computed(() => {
  const match = route.path.match(/\/docs\/dev\/components\/([^/]+)/)
  if (!match)
    return ''
  const slug = (match[1] ?? '').replace(/\.(en|zh)$/, '')
  return `packages/tuffex/packages/components/src/${slug}/index.ts`
})

const sourcePath = computed(() => props.path || autoPath.value)
const sourceLink = computed(() => (sourcePath.value ? `${sourceBase}${sourcePath.value}` : ''))
</script>

<template>
  <div v-if="sourceLink" class="tuff-doc-source">
    <a class="tuff-doc-source__link" :href="sourceLink" target="_blank" rel="noreferrer">
      <span>{{ label }}</span>
      <span class="i-carbon-launch" />
    </a>
    <div class="tuff-doc-source__path">
      {{ sourcePath }}
    </div>
  </div>
</template>

<style scoped>
.tuff-doc-source {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.85);
}

.tuff-doc-source__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.9);
  text-decoration: none;
}

.tuff-doc-source__path {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
  word-break: break-all;
}

:global(.dark .tuff-doc-source),
:global([data-theme='dark'] .tuff-doc-source) {
  background: rgba(15, 23, 42, 0.78);
  border-color: rgba(148, 163, 184, 0.25);
}

:global(.dark .tuff-doc-source__link),
:global([data-theme='dark'] .tuff-doc-source__link) {
  color: rgba(226, 232, 240, 0.9);
}
</style>
