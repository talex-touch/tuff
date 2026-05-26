<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const compact = ref(false)
const autoSync = ref(true)

const labels = computed(() => (locale.value === 'zh'
  ? {
      off: '关',
      on: '开',
      compact: '紧凑模式',
      autoSync: '自动同步',
    }
  : {
      off: 'Off',
      on: 'On',
      compact: 'Compact mode',
      autoSync: 'Auto sync',
    }))
</script>

<template>
  <div class="switch-label-demo">
    <label class="switch-label-demo__item">
      <span class="switch-label-demo__label">{{ labels.off }}</span>
      <TuffSwitch v-model="compact" />
      <span class="switch-label-demo__label is-active">{{ labels.on }}</span>
      <strong>{{ labels.compact }}</strong>
    </label>
    <label class="switch-label-demo__item switch-label-demo__item--card">
      <span>
        <strong>{{ labels.autoSync }}</strong>
        <small>{{ autoSync ? labels.on : labels.off }}</small>
      </span>
      <TuffSwitch v-model="autoSync" />
    </label>
  </div>
</template>

<style scoped>
.switch-label-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-width: min(100%, 360px);
}

.switch-label-demo__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
}

.switch-label-demo__label {
  min-width: 24px;
  text-align: center;
}

.switch-label-demo__label.is-active,
.switch-label-demo__item strong {
  color: var(--tx-text-color-primary);
}

.switch-label-demo__item--card {
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
}

.switch-label-demo__item--card span {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.switch-label-demo__item--card small {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
