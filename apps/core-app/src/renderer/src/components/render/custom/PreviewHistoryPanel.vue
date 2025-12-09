<script setup lang="ts" name="PreviewHistoryPanel">
import dayjs from 'dayjs'
import { computed, nextTick, ref, watch } from 'vue'

export interface CalculationHistoryEntry {
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
    activeIndex?: number
  }>(),
  {
    visible: false,
    loading: false,
    items: () => [],
    activeIndex: -1,
  },
)

const emit = defineEmits<{
  (e: 'apply', entry: CalculationHistoryEntry): void
}>()

const listRef = ref<HTMLUListElement>()

const formattedItems = computed(() =>
  props.items.map(item => ({
    ...item,
    expression: item.meta?.expression ?? item.meta?.payload?.title ?? item.content,
    result: item.meta?.payload?.primaryValue ?? item.content,
    abilityId: item.meta?.abilityId,
    time: item.timestamp ? dayjs(item.timestamp).format('HH:mm:ss') : '',
  })),
)

watch(
  () => props.activeIndex,
  (index) => {
    if (typeof index !== 'number' || index < 0)
      return
    nextTick(() => {
      const list = listRef.value
      const el = list?.children[index] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    })
  },
)
</script>

<template>
  <div
    class="PreviewHistoryPanel"
    :class="{ 'is-visible': visible }"
    :aria-hidden="!visible"
  >
    <div class="panel">
      <header>
        <div class="title-row">
          <span class="title">最近处理</span>
          <span class="count">共 {{ items.length }} 条</span>
        </div>
      </header>
      <div class="panel-body">
        <div v-if="loading" class="state">
          加载中...
        </div>
        <div v-else-if="!items.length" class="state">
          暂无记录
        </div>
        <ul v-else ref="listRef" class="history-list">
          <li
            v-for="(item, index) in formattedItems"
            :key="item.id ?? `${item.content}-${index}`"
            :class="{ 'is-active': index === props.activeIndex }"
            @click="emit('apply', item)"
          >
            <div class="expression" :title="item.expression">
              {{ item.expression }}
            </div>
            <div class="meta-row">
              <span class="result">{{ item.result }}</span>
              <span class="ability">{{ item.abilityId }}</span>
              <span class="time">{{ item.time }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.PreviewHistoryPanel {
  z-index: 1;
  position: relative;
  top: 0;
  right: 0;
  width: 0;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--el-border-color);
  transition: width 0.3s ease, opacity 0.25s ease;

  &.is-visible {
    width: 280px;
  }
}

.panel {
  height: 100%;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  padding: 16px 14px 12px;
  opacity: 0;
  transform: translateX(12px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;

  .PreviewHistoryPanel.is-visible & {
    opacity: 1;
    transform: translateX(0);
  }
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .title-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.history-list li {
  padding: 12px 14px;
  border: 1px solid transparent;
  cursor: pointer;
  background: var(--el-fill-color-light);
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.15s ease;

  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    transform: translateY(-1px);
  }

  .expression {
    font-size: 14px;
    color: var(--el-text-color-primary);
    margin-bottom: 6px;
    font-weight: 500;
  }

  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    gap: 6px;

    .result {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .ability {
      opacity: 0.6;
    }
  }
}

.history-list li.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
</style>
