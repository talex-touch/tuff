<script setup lang="ts">
defineProps<{
  value: string;
  icon?: string;
  label?: string;
}>();

const refresh: (value: string) => void = inject("refresh")!;
</script>

<template>
  <div
    @click="refresh(value)"
    data-type="label-select-item"
    :data-value="value"
    class="TLabelSelectItem"
  >
    <slot>
      <div :class="icon" v-if="icon" />
      <span>{{ label }}</span>
    </slot>
  </div>
</template>

<style lang="scss">
.TLabelSelectItem {
  &:hover {
    background-color: var(--el-fill-color-light);
  }
  z-index: 1;
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  height: 100%;
  min-width: 48px;

  cursor: pointer;
  border-radius: 4px;
}
</style>
