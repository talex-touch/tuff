<script setup lang="ts">
const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="CalculatorResult">
    {{ data.input.input }} = {{ data.output }}
  </div>
</template>

<style lang="scss">
.CalculatorResult {
  &:hover {
    opacity: 0.5;
  }
  position: relative;
  padding: 0.25rem 0.5rem;

  width: max-content;
  height: max-content;

  opacity: 0.25;
  font-size: 14px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
}
</style>
