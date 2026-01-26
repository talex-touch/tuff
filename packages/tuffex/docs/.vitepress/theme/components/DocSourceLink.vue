<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const props = withDefaults(defineProps<{
  label?: string
  path?: string
}>(), {
  label: '查看源码',
  path: '',
})

const { frontmatter, page, theme } = useData()

const sourceBase = computed(() => {
  const base = (theme.value as any)?.sourceBase || 'https://github.com/talex-touch/tuff/blob/main/'
  return base.endsWith('/') ? base : `${base}/`
})

const autoPath = computed(() => {
  const relative = page.value.filePath || page.value.relativePath || ''
  const match = relative.match(/^components\/(.+)\.md$/)
  if (!match)
    return ''
  const slug = match[1]
  return `packages/tuffex/packages/components/src/${slug}/src/${slug}.vue`
})

const sourcePath = computed(() => {
  return props.path || frontmatter.value?.source || autoPath.value
})

const sourceLink = computed(() => {
  if (!sourcePath.value)
    return ''
  return `${sourceBase.value}${sourcePath.value}`
})
</script>

<template>
  <div v-if="sourceLink" class="tx-doc-source">
    <a class="tx-doc-source__link" :href="sourceLink" target="_blank" rel="noreferrer">
      <span>{{ label }}</span>
      <span class="i-carbon-launch" />
    </a>
    <div class="tx-doc-source__path">
      {{ sourcePath }}
    </div>
  </div>
</template>

<style scoped>
.tx-doc-source {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 82%, transparent);
}

.tx-doc-source__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-decoration: none;
}

.tx-doc-source__path {
  font-size: 12px;
  color: var(--vp-c-text-3);
  word-break: break-all;
}
</style>
