<script setup lang="ts">
const props = defineProps<{
  color: string
  icon?: string
}>()
</script>

<template>
  <div :style="`--c: ${color}`" class="MimicButton">
    <slot>
      <div :class="icon" />
    </slot>
  </div>
</template>

<style lang="scss">
.MimicButton {
  padding: 4px;
  display: flex;

  align-items: center;
  justify-content: center;

  width: 20px;
  height: 20px;

  color: currentColor;
  border-radius: 6px;
  background-color: var(--c);
  box-shadow: var(--el-box-shadow-light);
}
</style>
