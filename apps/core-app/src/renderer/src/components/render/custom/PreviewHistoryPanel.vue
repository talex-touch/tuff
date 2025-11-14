<script setup lang="ts" name="PreviewHistoryPanel">
import dayjs from 'dayjs'
import { computed } from 'vue'

export type CalculationHistoryEntry = {
  id?: number
  content: string
  timestamp?: string
  meta?: Record<string, any>
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    loading: boolean
    items: CalculationHistoryEntry[]
  }>(),
  {
    visible: false,
    loading: false,
    items: () => []
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', entry: CalculationHistoryEntry): void
}>()

const formattedItems = computed(() =>
  props.items.map((item) => ({
    ...item,
    expression: item.meta?.expression ?? item.meta?.payload?.title ?? item.content,
    result: item.meta?.payload?.primaryValue ?? item.content,
    abilityId: item.meta?.abilityId,
    time: item.timestamp ? dayjs(item.timestamp).format('HH:mm:ss') : ''
  }))
)
</script>

<template>
  <transition name="fade">
    <div v-if="visible" class="PreviewHistoryPanel">
      <div class="panel">
        <header>
          <div>
            <span class="title">最近计算</span>
            <span class="count">共 {{ items.length }} 条</span>
          </div>
          <button class="close" type="button" @click="emit('close')">×</button>
        </header>
        <div v-if="loading" class="state">加载中...</div>
        <div v-else-if="!items.length" class="state">暂无记录</div>
        <ul v-else class="history-list">
          <li v-for="item in formattedItems" :key="item.id" @click="emit('apply', item)">
            <div class="expression">{{ item.expression }}</div>
            <div class="meta-row">
              <span class="result">{{ item.result }}</span>
              <span class="ability">{{ item.abilityId }}</span>
              <span class="time">{{ item.time }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </transition>
</template>

<style scoped lang="scss">
.PreviewHistoryPanel {
  position: absolute;
  top: 72px;
  right: 20px;
  width: 320px;
  max-height: calc(100% - 120px);
  z-index: 20;
}

.panel {
  background: var(--el-bg-color);
  border-radius: 16px;
  border: 1px solid var(--el-border-color);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .title {
    font-weight: 600;
  }

  .count {
    margin-left: 6px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .close {
    border: none;
    background: var(--el-fill-color-light);
    width: 28px;
    height: 28px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }
}

.state {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 20px 0;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.history-list li {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  background: var(--el-fill-color-light);
  transition: border-color 0.2s ease, background 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .expression {
    font-size: 13px;
    color: var(--el-text-color-primary);
    margin-bottom: 4px;
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--el-text-color-secondary);

    .result {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .ability {
      opacity: 0.5;
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
