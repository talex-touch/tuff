<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
const items = ref([])
const onPullingDown = () => {}
const onPullingUp = () => {}
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
