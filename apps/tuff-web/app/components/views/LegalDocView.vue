<script setup lang="ts">
import type { Component } from 'vue'
import { computed, inject, shallowRef, watch } from 'vue'
import {
  loadPolicyPage,
  type TuffWebCompiledDocMeta,
  type TuffWebPolicyName,
} from 'virtual:tuff-web-doc-pages'
import { normalizeApiToc, type DocTocEntry } from '~/utils/docs-outline'
import { resolveLocaleFromPath } from '~/utils/web-route'

const props = defineProps<{
  name: TuffWebPolicyName
}>()

const route = useRoute()
const { t } = useI18n()
const setPolicyOutline = inject<((entries: DocTocEntry[]) => void) | null>('tuff-web-set-policy-outline', null)

const docLocale = computed(() => resolveLocaleFromPath(route.path))
const displayComponent = shallowRef<Component | null>(null)
const displayMeta = shallowRef<TuffWebCompiledDocMeta | null>(null)

async function loadDocument() {
  const mod = await loadPolicyPage(docLocale.value, props.name)
  displayComponent.value = mod?.default ?? null
  displayMeta.value = mod?.docMeta ?? null
  if (setPolicyOutline)
    setPolicyOutline(mod?.docMeta?.toc ? normalizeApiToc(mod.docMeta.toc) : [])
}

watch(
  () => [docLocale.value, props.name] as const,
  () => {
    void loadDocument()
  },
)

await loadDocument()

const pageTitle = computed(() => t(`${props.name}.title`, displayMeta.value?.title || props.name))
const pageDescription = computed(() => t(`${props.name}.description`, displayMeta.value?.description || ''))

useHead(() => ({
  title: pageTitle.value,
  meta: pageDescription.value
    ? [{ name: 'description', content: pageDescription.value }]
    : [],
}))
</script>

<template>
  <article class="legal-surface px-4 py-8 sm:px-8 sm:py-10">
    <component
      :is="displayComponent"
      v-if="displayComponent"
      class="docs-prose legal-prose max-w-none"
    />
  </article>
</template>

<style scoped>
.legal-surface {
  min-width: 0;
}

.legal-prose :deep(h1) {
  font-size: 2.25rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.legal-prose :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
}

.legal-prose :deep(p) {
  line-height: 1.75;
}
</style>
