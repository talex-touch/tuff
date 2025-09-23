<script lang="ts" name="CoreBoxRender" setup>
import { computed } from 'vue'
import { TuffItem } from '@talex-touch/utils'

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

// console.log(props)
</script>

<template>
  <div class="CoreBoxRender" @click="emits('trigger', item)">
    <template v-if="render.mode === 'default'">
      <BoxItem :item="item" :active="active" :render="render" :quick-key="quickKey" />
    </template>
    <template v-else>
      {{ render }}
    </template>
  </div>
</template>
