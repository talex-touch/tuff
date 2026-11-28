<script setup lang="ts">
import type { TransitionPushDirection } from '@tuffex-components/transition'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? { back: '返回', next: '下一页' }
  : { back: 'Back', next: 'Next' })

// One drill-in, three levels deep. Each level is a different height, so the container's
// tween shows next to the push.
const pages = computed(() => zh.value
  ? [
      { id: 'actions', title: '操作', rows: ['复制路径', '在访达中显示', '流转到…'] },
      { id: 'targets', title: '选择目标', rows: ['剪贴板历史', '系统信息', '快速笔记', '翻译', '截图标注'] },
      { id: 'confirm', title: '确认', rows: ['仅本次允许', '始终允许'] },
    ]
  : [
      { id: 'actions', title: 'Actions', rows: ['Copy path', 'Show in Finder', 'Send to…'] },
      { id: 'targets', title: 'Choose a target', rows: ['Clipboard history', 'System info', 'Quick note', 'Translate', 'Screenshot markup'] },
      { id: 'confirm', title: 'Confirm', rows: ['Allow once', 'Always allow'] },
    ])

const depth = ref(0)
const direction = ref<TransitionPushDirection>('forward')
const page = computed(() => pages.value[depth.value])

function next() {
  if (depth.value >= pages.value.length - 1)
    return
  direction.value = 'forward'
  depth.value += 1
}

function back() {
  if (depth.value === 0)
    return
  direction.value = 'back'
  depth.value -= 1
}
</script>

<template>
  <div class="transition-push-demo not-prose">
    <div class="transition-push-demo__controls">
      <TxButton size="sm" :disabled="depth === 0" @click="back">
        {{ copy.back }}
      </TxButton>
      <TxButton size="sm" type="primary" :disabled="depth === pages.length - 1" @click="next">
        {{ copy.next }}
      </TxButton>
      <span class="transition-push-demo__meta">direction: <b>{{ direction }}</b></span>
    </div>

    <div class="transition-push-demo__card">
      <div class="transition-push-demo__header">
        <span class="transition-push-demo__title">{{ page?.title }}</span>
        <span class="transition-push-demo__step">{{ depth + 1 }} / {{ pages.length }}</span>
      </div>
      <TxTransitionPush :direction="direction">
        <ul v-if="page" :key="page.id" class="transition-push-demo__page">
          <li v-for="row in page.rows" :key="row" class="transition-push-demo__row">
            {{ row }}
          </li>
        </ul>
      </TxTransitionPush>
    </div>
  </div>
</template>

<style scoped>
.transition-push-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 320px;
  max-width: 100%;
}

.transition-push-demo__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transition-push-demo__meta {
  margin-inline-start: auto;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.transition-push-demo__card {
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 12px;
  background: var(--tx-bg-color-overlay, #ffffff);
}

.transition-push-demo__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px 4px;
}

.transition-push-demo__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.transition-push-demo__step {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #909399);
}

.transition-push-demo__page {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 4px 6px 6px;
  list-style: none;
}

.transition-push-demo__row {
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
}
</style>
