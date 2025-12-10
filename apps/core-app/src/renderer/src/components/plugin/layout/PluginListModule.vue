<script lang="ts" name="PluginListModule" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { computed } from 'vue'
import PluginItem from './PluginItem.vue'

const props = defineProps<{
  modelValue: ITouchPlugin | null
  plugins: ITouchPlugin[]
  shrink?: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: ITouchPlugin): void
}>()

const value = computed(() => props.modelValue)
</script>

<template>
  <div class="mb-12 min-h-16">
    <p class="my-4 flex justify-between items-center text-xs opacity-70">
      <span class="PluginList-Name flex items-center gap-2">
        <i v-if="shrink" class="i-ri-check-line text-base text-[var(--el-color-primary)]" />
        <i v-else class="i-ri-puzzle-line text-base text-[var(--el-color-primary)]" />
        <slot name="name" />
      </span>
      <span class="text-[var(--el-text-color-secondary)]">
        {{ plugins.length }}
      </span>
    </p>

    <p
      :class="{ visible: Object.values(plugins).length > 0 }"
      class="PluginList-Empty"
      v-text="`No selection made.`"
    />

    <transition-group name="list" tag="div">
      <PluginItem
        v-for="plugin in plugins"
        :key="plugin.name"
        :plugin="plugin"
        :shrink="shrink"
        :is-target="value?.name === plugin.name"
        @click="$emit('update:modelValue', plugin)"
      />
    </transition-group>
  </div>
</template>

<style lang="scss" scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.list-enter-from,
.list-leave-to {
  margin-bottom: -53px;
  opacity: 0;
  transform: translateX(30px);
}

.PluginList-Empty {
  margin: 0;
  margin-bottom: 18px;
  text-align: center;
  opacity: 0.75;
  font-size: 14px;
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

  &.visible {
    margin-bottom: -35px;
    opacity: 0;
    transform: translateY(20px);
  }
}
</style>
