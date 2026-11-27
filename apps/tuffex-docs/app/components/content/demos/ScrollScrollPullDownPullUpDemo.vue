<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref(0)
const items = ref<number[]>([1, 2, 3, 4, 5])
const loading = ref(false)
const onPullingDown = () => {
  loading.value = true
  i.value = 0
  items.value = [1, 2, 3, 4, 5]
  loading.value = false
}
const onPullingUp = () => {
  loading.value = true
  i.value += 1
  const start = items.value.length + 1
  items.value.push(start, start + 1, start + 2)
  loading.value = false
}
</script>

<template>
  <div v-if="locale === 'zh'">
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
            <div v-for="itemValue in items" :key="itemValue" class="demo-scroll-item">
              Item {{ itemValue }}
            </div>
          </div>

          <template #footer>
            <div style="padding: 10px 0; color: var(--tx-text-color-secondary); text-align: center;">
              {{ loading ? 'Loading...' : 'Pull up to load more' }}
            </div>
          </template>
        </TxScroll>
      </div>
  </div>
  <div v-else>
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
            <div v-for="itemValue in items" :key="itemValue" class="demo-scroll-item">
              Item {{ itemValue }}
            </div>
          </div>

          <template #footer>
            <div style="padding: 10px 0; color: var(--tx-text-color-secondary); text-align: center;">
              {{ loading ? 'Loading...' : 'Pull up to load more' }}
            </div>
          </template>
        </TxScroll>
      </div>
  </div>
</template>
