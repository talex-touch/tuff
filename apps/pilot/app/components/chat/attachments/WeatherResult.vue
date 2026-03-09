<script setup lang="ts">
const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="WeatherResult">
    {{ data }}
  </div>
</template>

<style lang="scss">
.WeatherResult {
  position: relative;
  padding: 0.5rem;

  width: 200px;
  height: 300px;

  border-radius: 16px;
  border: 1px solid var(--el-border-color);
}
</style>
