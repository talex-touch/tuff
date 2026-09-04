<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const compact = ref(false)
const autoSync = ref(true)
const telemetry = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      off: '关',
      on: '开',
      compact: '紧凑模式',
      autoSync: '自动同步',
      telemetry: '匿名统计',
    }
  : {
      off: 'Off',
      on: 'On',
      compact: 'Compact mode',
      autoSync: 'Auto sync',
      telemetry: 'Anonymous stats',
    }))
</script>

<template>
  <div class="switch-label-demo">
    <!-- Static name, either side of the track. -->
    <TuffSwitch v-model="compact" :label="labels.compact" />
    <TuffSwitch v-model="telemetry" :label="labels.telemetry" label-placement="start" />

    <!-- A label that flips with the value: the built-in transformer crossfades it. -->
    <TuffSwitch v-model="autoSync" :label="autoSync ? labels.on : labels.off" />

    <!-- The default slot takes arbitrary nodes; it renders as-is, no crossfade. -->
    <TuffSwitch v-model="autoSync">
      <strong>{{ labels.autoSync }}</strong>
    </TuffSwitch>
  </div>
</template>

<style scoped>
.switch-label-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}
</style>
