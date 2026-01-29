<script setup lang="ts">
import { ref } from 'vue'

const items = ref(Array.from({ length: 30 }, (_, i) => i + 1))
const scrollRef = ref<any>(null)
const loading = ref(false)

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function onPullingDown() {
  loading.value = true
  await sleep(600)
  items.value = Array.from({ length: 30 }, (_, i) => i + 1)
  loading.value = false
  scrollRef.value?.finishPullDown?.()
}

async function onPullingUp() {
  if (loading.value)
    return
  loading.value = true
  await sleep(600)
  const last = items.value[items.value.length - 1] ?? 0
  items.value.push(...Array.from({ length: 20 }, (_, i) => last + i + 1))
  loading.value = false
  scrollRef.value?.finishPullUp?.()
}
</script>

<template>
  <div class="demo-container" style="height: 260px;">
    <TxScroll
      ref="scrollRef"
      style="height: 100%;"
      :pull-down-refresh="true"
      :pull-up-load="true"
      @pulling-down="onPullingDown"
      @pulling-up="onPullingUp"
    >
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div v-for="i in items" :key="i" class="demo-scroll-item">
          Item {{ i }}
        </div>
      </div>

      <template #footer>
        <div style="padding: 10px 0; color: var(--tx-text-color-secondary); text-align: center;">
          {{ loading ? 'Loading...' : 'Pull up to load more' }}
        </div>
      </template>
    </TxScroll>
  </div>
</template>
