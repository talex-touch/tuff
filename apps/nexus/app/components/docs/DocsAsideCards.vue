<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  assistantOpenRequest?: number
  assistantSource?: HTMLElement | null
}>(), {
  assistantOpenRequest: 0,
  assistantSource: null,
})

const LazyDocsAssistantDialog = defineAsyncComponent(() => import('./DocsAssistantDialog.vue'))

const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
const docTitleState = useState<string>('docs-title', () => '')
const docTitle = computed(() => {
  if (docTitleState.value)
    return docTitleState.value
  const rawTitle = docMetaState.value?.title
  return typeof rawTitle === 'string' ? rawTitle.trim() : ''
})
const docPath = computed(() => {
  const path = docMetaState.value?.path
  return typeof path === 'string' ? path.trim() : ''
})
const assistantContextState = useState<string>('docs-assistant-context', () => '')
const assistantContext = computed(() => {
  const value = assistantContextState.value
  return typeof value === 'string' ? value : ''
})
const assistantOpen = ref(false)
const assistantTriggerEl = computed(() => props.assistantSource)

watch(
  () => props.assistantOpenRequest,
  (request) => {
    if (request > 0)
      assistantOpen.value = true
  },
  { immediate: true },
)
</script>

<template>
  <LazyDocsAssistantDialog
    v-if="assistantOpen"
    v-model="assistantOpen"
    :source="assistantTriggerEl"
    :doc-title="docTitle"
    :doc-path="docPath"
    :doc-context="assistantContext"
  />
</template>
