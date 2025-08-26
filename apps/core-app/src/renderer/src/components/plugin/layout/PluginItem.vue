<script lang="ts" name="PluginItem" setup>
import { computed } from 'vue'
import { ElPopover } from 'element-plus'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import { ITouchPlugin } from '@talex-touch/utils'

const props = defineProps<{
  plugin: ITouchPlugin
  shrink?: boolean
  isTarget?: boolean
}>()

const hasIssues = computed(() => props.plugin.issues && props.plugin.issues.length > 0)
</script>

<template>
  <div
    class="plugin-item group relative flex items-center h-20 p-2 cursor-pointer rounded-xl border-2 border-transparent overflow-hidden transition-all duration-250 ease-in-out fake-background"
    :class="{ shrink, target: isTarget, dev: plugin.dev?.enable }"
  >
    <el-popover
      v-if="hasIssues"
      placement="top-start"
      title="Plugin Issues"
      :width="300"
      trigger="hover"
      popper-class="plugin-issues-popper"
    >
      <template #reference>
        <i
          class="i-ri-error-warning-line issue-badge absolute top-1.5 right-1.5 text-red-500/80 text-xl z-10 cursor-help"
        />
      </template>
      <div class="issues-list max-h-60 overflow-y-auto">
        <div
          v-for="(issue, index) in plugin.issues"
          :key="index"
          class="issue-item flex items-start p-1.5 mb-1.5 last:mb-0 rounded"
          :class="{
            'bg-red-500/10': issue.type === 'error',
            'bg-yellow-500/10': issue.type === 'warning'
          }"
        >
          <i
            class="flex-shrink-0 mt-0.5"
            :class="{
              'i-ri-close-circle-fill text-red-500': issue.type === 'error',
              'i-ri-alert-fill text-yellow-500': issue.type === 'warning'
            }"
          />
          <div class="ml-2 text-xs">
            <p class="font-bold">{{ issue.source }}</p>
            <p class="mt-0.5 text-gray-600 dark:text-gray-300">{{ issue.message }}</p>
          </div>
        </div>
      </div>
    </el-popover>

    <PluginIcon class="flex-shrink-0" :icon="plugin.icon" :alt="plugin.name" />

    <div class="main-content flex-1 ml-4 flex flex-col justify-center overflow-hidden">
      <p class="font-semibold text-base truncate">{{ plugin.name }}</p>

      <p class="text-xs text-gray-400 mt-1 truncate">
        {{ plugin.desc }}
      </p>
    </div>

    <div v-if="shrink" class="shrink-status ml-auto pr-2">
      <PluginStatus :plugin="plugin" :shrink="true" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.plugin-item {
  &:hover {
    border-color: var(--el-border-color);
    --fake-inner-opacity: 0.25;
  }

  &.dev {
    background: repeating-linear-gradient(
      45deg,
      rgba(var(--el-color-warning-rgb), 0.05),
      rgba(var(--el-color-warning-rgb), 0.05) 10px,
      rgba(var(--el-color-warning-rgb), 0.15) 10px,
      rgba(var(--el-color-warning-rgb), 0.15) 20px
    );
  }

  &.target {
    border-color: var(--el-color-primary-light-3);
    --fake-opacity: 0.5;
    --fake-inner-opacity: 0.5;
  }

  &.shrink {
    height: 64px;
    pointer-events: all !important;

    .main-content p {
      color: var(--el-text-color-primary);
    }

    :deep(.PluginIcon-Container) {
      min-width: 32px;
      height: 32px;
      font-size: 24px;
      span {
        transform: scale(0.75);
      }
    }

    &:hover {
      border-color: var(--el-color-primary-light-3);
    }
  }
}

:deep(.PluginIcon-Container) {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1.25em;
  height: 1.25em;
  font-size: 32px;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-sizing: border-box;
  z-index: 1;
}

.main-content {
  z-index: 1;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
