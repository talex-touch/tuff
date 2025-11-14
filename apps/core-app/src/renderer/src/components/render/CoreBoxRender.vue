<script lang="ts" name="CoreBoxRender" setup>
import { computed } from 'vue'
import { TuffItem } from '@talex-touch/utils'
import BoxItem from './BoxItem.vue'
import { getCustomRenderer } from '~/modules/box/custom-render'

const props = defineProps<{
  active: boolean
  item: TuffItem
  index: number
}>()

const emits = defineEmits<{
  (e: 'trigger', item: TuffItem): void
}>()

const render = computed(() => props.item?.render)

const quickKey = computed(() => {
  if (props.index > 9) return ''
  const key = props.index === 9 ? 0 : props.index + 1
  return `⌘${key}`
})

const customRenderer = computed(() => {
  if (render.value?.mode !== 'custom') return null
  const custom = render.value?.custom
  if (!custom || custom.type !== 'vue') return null
  return getCustomRenderer(custom.content) ?? null
})

const customPayload = computed(() => render.value?.custom?.data)
</script>

<template>
  <div class="CoreBoxRender" @click="emits('trigger', item)">
    <template v-if="render.mode === 'default'">
      <BoxItem :item="item" :active="active" :render="render" :quick-key="quickKey" />
    </template>
    <template v-else-if="render.mode === 'custom' && customRenderer">
      <div class="CoreBoxRender-Custom" :class="{ active }">
        <component :is="customRenderer" :item="item" :payload="customPayload" />
      </div>
    </template>
    <template v-else>
      <pre class="CoreBoxRender-Debug">{{ render }}</pre>
    </template>
  </div>
</template>

<style scoped lang="scss">
.CoreBoxRender {
  width: 100%;
}

.CoreBoxRender-Custom {
  margin: 8px 16px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid transparent;
  transition: border-color 0.2s ease;

  &.active {
    border-color: var(--el-color-primary);
  }
}

.CoreBoxRender-Debug {
  font-size: 12px;
  opacity: 0.6;
  padding: 8px;
}
</style>
