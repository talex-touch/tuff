<template>
  <div class="task-list" :class="{ 'compact-mode': viewMode === 'compact' }">
    <div v-if="tasks.length === 0" class="empty-state">
      <el-empty :description="$t('download.no_tasks_in_category')" />
    </div>
    <draggable
      v-else
      v-model="taskList"
      :disabled="!draggable"
      item-key="id"
      class="task-container"
      @end="handleDragEnd"
    >
      <template #item="{ element }">
        <TaskCard
          :task="element"
          :view-mode="viewMode"
          @pause="$emit('pause', element.id)"
          @resume="$emit('resume', element.id)"
          @cancel="$emit('cancel', element.id)"
          @retry="$emit('retry', element.id)"
          @remove="$emit('remove', element.id)"
          @delete="$emit('delete', element.id)"
          @open-file="$emit('open-file', element.id)"
          @show-in-folder="$emit('show-in-folder', element.id)"
          @show-details="$emit('show-details', element.id)"
        />
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable as draggable } from 'vue-draggable-plus'
import { DownloadTask } from '@talex-touch/utils'
import TaskCard from './TaskCard.vue'

interface Props {
  tasks: DownloadTask[]
  viewMode: 'detailed' | 'compact'
  draggable?: boolean
}

const { t } = useI18n()

const props = withDefaults(defineProps<Props>(), {
  draggable: false
})

const emit = defineEmits<{
  pause: [taskId: string]
  resume: [taskId: string]
  cancel: [taskId: string]
  retry: [taskId: string]
  remove: [taskId: string]
  delete: [taskId: string]
  'open-file': [taskId: string]
  'show-in-folder': [taskId: string]
  'show-details': [taskId: string]
  'priority-change': [taskId: string, newPriority: number]
}>()

const taskList = ref<DownloadTask[]>([...props.tasks])

watch(() => props.tasks, (newTasks) => {
  taskList.value = [...newTasks]
}, { deep: true })

const handleDragEnd = (event: any) => {
  const { oldIndex, newIndex } = event
  if (oldIndex !== newIndex && taskList.value[newIndex]) {
    const task = taskList.value[newIndex]
    // Calculate new priority based on position
    const newPriority = calculatePriority(newIndex, taskList.value.length)
    emit('priority-change', task.id, newPriority)
  }
}

const calculatePriority = (index: number, total: number): number => {
  // Higher index = lower priority
  // Map index to priority range (100 to 10)
  const maxPriority = 100
  const minPriority = 10
  const range = maxPriority - minPriority
  return maxPriority - Math.floor((index / Math.max(total - 1, 1)) * range)
}
</script>

<style scoped>
.task-list {
  width: 100%;
}

.task-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compact-mode .task-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 40px;
}

/* 拖拽样式 */
.task-container :deep(.sortable-ghost) {
  opacity: 0.5;
}

.task-container :deep(.sortable-drag) {
  cursor: move;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .compact-mode .task-container {
    grid-template-columns: 1fr;
  }
}
</style>
