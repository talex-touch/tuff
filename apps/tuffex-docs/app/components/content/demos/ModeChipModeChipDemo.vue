<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const unrestricted = ref(false)

const copy = computed(() => zh.value
  ? { ask: '请求批准', free: '无限制访问' }
  : { ask: 'Request approval', free: 'Unrestricted access' })
</script>

<template>
  <div class="mode-chip-demo">
    <TxModeChip
      :icon="unrestricted ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
      :label="unrestricted ? copy.free : copy.ask"
      :tone="unrestricted ? 'danger' : 'muted'"
      @click="unrestricted = !unrestricted"
    />
  </div>
</template>

<style scoped>
.mode-chip-demo {
  display: flex;
  align-items: center;
  min-height: 40px;
}
</style>
