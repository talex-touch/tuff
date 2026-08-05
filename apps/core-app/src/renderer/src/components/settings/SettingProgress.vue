<script lang="ts" name="SettingProgress" setup>
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; max?: number }>(), { max: 100 })

const percent = computed(() => {
  if (!Number.isFinite(props.max) || props.max <= 0) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<template>
  <div
    class="SettingProgress"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemin="0"
    :aria-valuemax="max"
  >
    <div class="SettingProgress-Fill" :style="{ width: `${percent}%` }" />
  </div>
</template>

<style lang="scss" scoped>
.SettingProgress {
  overflow: hidden;
  width: 100%;
  height: 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
}

.SettingProgress-Fill {
  height: 100%;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary);
  transition: width 0.3s ease;
}
</style>
