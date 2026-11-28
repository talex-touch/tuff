<script setup lang="ts">
import { computed } from 'vue'
import { resolveTuffexComponentSlug } from '~/utils/docs-route'

const props = withDefaults(defineProps<{
  label?: string
  path?: string
}>(), {
  label: '',
  path: '',
})

const route = useRoute()
const { locale } = useI18n()
const sourceBase = 'https://github.com/talex-touch/tuff/blob/master/'

const resolvedLabel = computed(() => {
  if (props.label)
    return props.label
  return locale.value === 'zh' ? '查看源码' : 'View Source'
})

const autoPath = computed(() => {
  const slug = resolveTuffexComponentSlug(route.path)
  if (!slug)
    return ''
  return `packages/tuffex/packages/components/src/${slug}/index.ts`
})

const sourcePath = computed(() => props.path || autoPath.value)
const sourceLink = computed(() => (sourcePath.value ? `${sourceBase}${sourcePath.value}` : ''))
</script>

<template>
  <div v-if="sourceLink" class="tuff-doc-source not-prose">
    <a class="tuff-doc-source__link" :href="sourceLink" target="_blank" rel="noopener noreferrer">
      <span>{{ resolvedLabel }}</span>
      <span class="i-carbon-launch" aria-hidden="true" />
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
  gap: 5px;
  margin: 14px 0;
  padding: 12px 15px;
  border-radius: 12px;
  border: 1px solid var(--docs-border-light);
  background: var(--docs-surface-subtle);
}

.tuff-doc-source__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  font-size: 13px;
  font-weight: 600;
  color: var(--docs-ink);
  text-decoration: none;
}

.tuff-doc-source__link:hover {
  color: var(--docs-accent);
}

.tuff-doc-source__path {
  font-family: var(--docs-mono-font);
  font-size: 12px;
  color: var(--docs-muted);
  word-break: break-all;
}
</style>
