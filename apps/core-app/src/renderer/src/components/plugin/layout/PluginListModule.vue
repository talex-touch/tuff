<script lang="ts" name="PluginListModule" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { ITouchPlugin } from '@talex-touch/utils'
import PluginItem from './PluginItem.vue'

const props = defineProps<{
  modelValue: ITouchPlugin
  plugins: ITouchPlugin[]
  shrink?: boolean
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: ITouchPlugin): void
}>()

const value = useModelWrapper(props, emits)
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

    <transition-group name="list">
      <PluginItem
        v-for="(plugin, index) in Object.values(plugins)"
        :key="index"
        :plugin="plugin"
        :shrink="shrink"
        :is-target="plugin.name === value"
        @click="value = plugin.name"
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
