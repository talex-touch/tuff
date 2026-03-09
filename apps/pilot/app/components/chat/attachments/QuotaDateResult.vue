<script setup lang="ts">
const props = defineProps<{
  data: any
  value: any
}>()

const obj = computed(() => JSON.parse(props.value))
</script>

<template>
  <div class="QuotaDateResult">
    <!-- 做成 key: value 格式 -->
    <div v-for="(value, key) in obj" :key="key">
      <span class="key">{{ key }}:</span>
      <span class="value">{{ value }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.QuotaDateResult {
  & > div {
    display: flex;

    gap: 0.5rem;

    .key {
      color: var(--el-text-color-secondary);
    }
    .value {
      color: var(--el-text-color-primary);
    }
  }
  position: relative;
  padding: 0.25rem 0.5rem;

  width: max-content;
  height: max-content;
  max-width: 100%;

  opacity: 0.75;
  font-size: 14px;
}
</style>
