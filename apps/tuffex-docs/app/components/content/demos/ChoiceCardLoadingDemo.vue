<script setup lang="ts">
import type { ChoiceStep } from '@talex-touch/tuffex/choice-card'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: '为你准备',
      reload: '重新加载',
      options: [
        { id: 'standup', label: '准备明早站会', description: '三条昨日进展，一条阻塞', icon: 'i-carbon-events' },
        { id: 'review', label: '看完待审的合并请求', description: '两个请求等你审阅', icon: 'i-carbon-task' },
        { id: 'digest', label: '读今天的摘要', description: '订阅源里的五篇新文章', icon: 'i-carbon-catalog' },
      ],
    }
  : {
      title: 'Ready for you',
      reload: 'Reload',
      options: [
        { id: 'standup', label: 'Prepare tomorrow\'s stand-up', description: 'Three updates, one blocker', icon: 'i-carbon-events' },
        { id: 'review', label: 'Finish pending reviews', description: 'Two pull requests are waiting on you', icon: 'i-carbon-task' },
        { id: 'digest', label: 'Read today\'s digest', description: 'Five new posts from your feeds', icon: 'i-carbon-catalog' },
      ],
    })

// The fake round trip. Long enough to see the skeleton; a real one that answers inside
// useDeferredLoading's delay shows no skeleton at all.
const LATENCY_MS = 1600

const pending = ref(true)
const loaded = ref(false)
// Held back 150ms, then shown for at least 400ms, so a fast answer never flashes one.
const skeleton = useDeferredLoading(pending)

// The question is known before the answers, so the title stays while the options load.
const steps = computed<ChoiceStep[]>(() => [{
  id: 'for-you',
  title: copy.value.title,
  options: loaded.value ? copy.value.options : [],
}])

let timer: ReturnType<typeof setTimeout> | undefined

// A reload keeps the previous answer on screen until the deferred skeleton takes over,
// so the card never shows an empty list in between.
function load(): void {
  clearTimeout(timer)
  pending.value = true
  timer = setTimeout(() => {
    loaded.value = true
    pending.value = false
  }, LATENCY_MS)
}

// Fetches once the demo scrolls into view, not on mount: the wrapper mounts demos
// before they are visible, and the answer would be in before anyone saw it load.
const rootRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const el = rootRef.value
  if (!el || typeof IntersectionObserver === 'undefined') {
    load()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    load()
  }, { threshold: 0.6 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  clearTimeout(timer)
})
</script>

<template>
  <div ref="rootRef" class="choice-card-loading-demo not-prose">
    <TxChoiceCard :steps="steps" :loading="skeleton" :loading-rows="3" />
    <div class="choice-card-loading-demo__actions">
      <TxButton size="sm" variant="secondary" icon="i-carbon-renew" :disabled="pending" @click="load">
        {{ copy.reload }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.choice-card-loading-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}

.choice-card-loading-demo__actions {
  display: flex;
}
</style>
