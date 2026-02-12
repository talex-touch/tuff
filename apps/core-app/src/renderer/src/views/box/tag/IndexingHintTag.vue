<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, unref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'

const props = withDefaults(
  defineProps<{
    query?: string
  }>(),
  {
    query: ''
  }
)

const { t } = useI18n()
const { onProgressUpdate, indexProgress, getIndexStatus } = useFileIndexMonitor()

const isIndexing = computed(() => {
  const stage = indexProgress.value?.stage
  return Boolean(stage && stage !== 'idle' && stage !== 'completed')
})

const queryValue = computed(() => String(unref(props.query) ?? ''))

const shouldShow = computed(() => {
  return isIndexing.value && !queryValue.value.trim()
})

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = onProgressUpdate(() => {})
  void syncIndexStatus()
})
onBeforeUnmount(() => {
  unsubscribe?.()
})

async function syncIndexStatus(): Promise<void> {
  try {
    const status = await getIndexStatus()
    if (!status?.progress?.stage) return

    const current = status.progress.current ?? 0
    const total = status.progress.total ?? 0
    const progress = total > 0 ? (current / total) * 100 : 0

    indexProgress.value = {
      stage: status.progress.stage,
      current,
      total,
      progress,
      startTime: status.startTime ?? null,
      estimatedRemainingMs: status.estimatedRemainingMs ?? null,
      averageItemsPerSecond: status.averageItemsPerSecond ?? 0
    }
  } catch (error) {
    console.error('[IndexingHintTag] Failed to sync index status:', error)
  }
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const minutes = Math.ceil(totalSeconds / 60)

  if (minutes >= 60) {
    const hours = Math.ceil(minutes / 60)
    return `${hours}h`
  }

  if (minutes >= 1) {
    return `${minutes}m`
  }

  return `${totalSeconds}s`
}

const hintText = computed(() => {
  if (!shouldShow.value) return ''

  const remainingMs = indexProgress.value?.estimatedRemainingMs
  if (!remainingMs || remainingMs <= 0) {
    return t('coreBox.indexingHint.inProgress')
  }

  return t('coreBox.indexingHint.remaining', { time: formatRemainingTime(remainingMs) })
})
</script>

<template>
  <span v-if="shouldShow" class="IndexingHintTag">{{ hintText }}</span>
</template>

<style scoped lang="scss">
.IndexingHintTag {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  opacity: 0.8;
  margin-right: 6px;
  user-select: none;
}
</style>
