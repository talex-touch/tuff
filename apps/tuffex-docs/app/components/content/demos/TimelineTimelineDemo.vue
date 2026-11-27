<script setup lang="ts">
import { computed } from 'vue'

type TimelineColor = 'primary' | 'success' | 'warning'

interface TimelineEvent {
  id: string
  title: string
  time: string
  detail: string
  color: TimelineColor
  icon?: string
  active?: boolean
}

const { locale } = useI18n()

const events = computed<TimelineEvent[]>(() => {
  if (locale.value === 'zh') {
    return [
      { id: 'design', title: '设计阶段', time: '09:30', detail: '确认信息架构和边界状态', color: 'primary', icon: 'i-carbon-pen' },
      { id: 'build', title: '开发构建', time: '12:00', detail: '组件与文档示例同步完成', color: 'success', icon: 'i-carbon-checkmark', active: true },
      { id: 'launch', title: '上线发布', time: '16:10', detail: '等待最终回归和发布窗口', color: 'warning', icon: 'i-carbon-time' },
    ]
  }

  return [
    { id: 'design', title: 'Design phase', time: '09:30', detail: 'Information architecture and boundary states approved', color: 'primary', icon: 'i-carbon-pen' },
    { id: 'build', title: 'Build', time: '12:00', detail: 'Components and documentation examples synced', color: 'success', icon: 'i-carbon-checkmark', active: true },
    { id: 'launch', title: 'Launch', time: '16:10', detail: 'Waiting for final regression and release window', color: 'warning', icon: 'i-carbon-time' },
  ]
})
</script>

<template>
  <TxTimeline>
    <TxTimelineItem
      v-for="event in events"
      :key="event.id"
      :title="event.title"
      :time="event.time"
      :color="event.color"
      :icon="event.icon"
      :active="event.active"
    >
      {{ event.detail }}
    </TxTimelineItem>
  </TxTimeline>
</template>

