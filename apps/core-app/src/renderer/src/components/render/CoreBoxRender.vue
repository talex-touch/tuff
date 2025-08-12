<script lang="ts" name="CoreBoxRender" setup>
import { TuffItem } from '@talex-touch/utils'

const props = defineProps<{
  active: boolean
  item: TuffItem
}>()

const emits = defineEmits<{
  (e: 'trigger', item: TuffItem): void
}>()

const render = computed(() => props.item?.render)

console.log(props)
</script>

<template>
  <div class="CoreBoxRender" @click="emits('trigger', item)">
    <template v-if="render.mode === 'default'">
      <BoxItem :item="item" :active="active" :render="render" />
    </template>
    <template v-else>
      {{ render }}
    </template>
  </div>
</template>
