<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  totalPage: number
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const page = useVModel(props, 'modelValue', emits)
</script>

<template>
  <div flex items-center>
    <div :class="{ disabled: page === 0 }" class="_btn" mr-1 cursor-pointer op-50 @click="page -= 1">
      <i i-carbon:chevron-left />
    </div>
    <div>{{ page + 1 }} / {{ totalPage }}</div>
    <div :class="{ disabled: page === totalPage - 1 }" class="_btn" ml-1 cursor-pointer op-50 @click="page += 1">
      <i i-carbon:chevron-right />
    </div>
  </div>
</template>

<style lang="scss">
._btn {
  &.disabled {
    display: none;
  }
  display: flex;

  border-radius: 4px;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: var(--el-bg-color-page);
  }
}
</style>
