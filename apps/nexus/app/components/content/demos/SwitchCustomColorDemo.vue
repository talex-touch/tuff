<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const success = ref(true)
const warning = ref(true)
const violet = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      success: '成功色',
      warning: '警告色',
      violet: '紫色',
    }
  : {
      success: 'Success',
      warning: 'Warning',
      violet: 'Violet',
    }))
</script>

<template>
  <div class="switch-custom-color-demo">
    <label class="switch-custom-color-demo__item is-success">
      <span>{{ labels.success }}</span>
      <TuffSwitch v-model="success" />
    </label>
    <label class="switch-custom-color-demo__item is-warning">
      <span>{{ labels.warning }}</span>
      <TuffSwitch v-model="warning" />
    </label>
    <label class="switch-custom-color-demo__item is-violet">
      <span>{{ labels.violet }}</span>
      <TuffSwitch v-model="violet" />
    </label>
  </div>
</template>

<style scoped>
.switch-custom-color-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.switch-custom-color-demo__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--switch-demo-color);
  font-size: 14px;
}

.switch-custom-color-demo__item :deep(.tuff-switch.is-active) {
  background-color: var(--switch-demo-color);
}

.switch-custom-color-demo__item :deep(.tuff-switch.is-active:hover:not(.is-disabled)) {
  box-shadow: 0 0 16px 1px color-mix(in srgb, var(--switch-demo-color) 72%, transparent);
}

.switch-custom-color-demo__item.is-success {
  --switch-demo-color: var(--tx-color-success);
}

.switch-custom-color-demo__item.is-warning {
  --switch-demo-color: var(--tx-color-warning);
}

.switch-custom-color-demo__item.is-violet {
  --switch-demo-color: #8b5cf6;
}
</style>
