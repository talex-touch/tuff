<script setup lang="ts">
import type { DocActionPayload } from '~/types/docs-engagement'
import { requestJson } from '~/utils/request'

const props = defineProps<{
  docPath: string
  title: string
  enabled: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  viewCount: [value: number | null]
  refreshReady: []
}>()

const { deviceId } = useDeviceIdentity()
const viewCount = ref<number | null>(null)

const docsTracker = useDocEngagementTracker({
  source: 'docs_page',
  path: () => props.docPath,
  title: () => props.title,
  clientId: () => deviceId.value || '',
  enabled: () => props.enabled && Boolean(props.docPath),
  contentSelector: '.docs-prose',
  trackSections: true,
  captureSelection: true,
  onViewTracked: (views) => {
    viewCount.value = views
    emit('viewCount', views)
  },
})

function handleDocsAction(event: Event) {
  const custom = event as CustomEvent<Partial<DocActionPayload>>
  const detail = custom.detail
  if (!detail?.type || !detail?.source)
    return

  void docsTracker.recordAction({
    type: detail.type,
    source: detail.source,
    sectionId: detail.sectionId || 'root',
    sectionTitle: detail.sectionTitle || '',
    count: detail.count ?? 1,
    textHash: detail.textHash,
    textLength: detail.textLength,
    anchorStart: detail.anchorStart,
    anchorEnd: detail.anchorEnd,
    anchorBucket: detail.anchorBucket,
    text: (detail as any).text,
  } as any)
}

function scheduleRefresh() {
  if (!import.meta.client)
    return
  requestAnimationFrame(() => {
    docsTracker.refreshSections()
    emit('refreshReady')
  })
}

async function fetchViewCount() {
  if (!props.docPath || !props.isAdmin)
    return

  try {
    const result = await requestJson<{ views: number }>('/api/docs/view', {
      method: 'GET',
      query: { path: props.docPath },
    })
    viewCount.value = result.views
    emit('viewCount', result.views)
  }
  catch (error) {
    console.warn('[docs] Failed to fetch view count:', error)
  }
}

onMounted(() => {
  window.addEventListener('docs:action', handleDocsAction)
  scheduleRefresh()
  if (props.isAdmin)
    void fetchViewCount()
})

onBeforeUnmount(() => {
  window.removeEventListener('docs:action', handleDocsAction)
})

watch(
  () => [props.docPath, props.enabled] as const,
  () => {
    if (!props.enabled)
      return
    scheduleRefresh()
  },
)

watch(
  () => [props.docPath, props.isAdmin] as const,
  () => {
    if (props.isAdmin)
      void fetchViewCount()
    else
      emit('viewCount', null)
  },
  { immediate: true },
)
</script>

<template>
  <span hidden aria-hidden="true" />
</template>
