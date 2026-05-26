<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const enabled = ref(true)
const disabledOff = ref(false)
const disabledOn = ref(true)

const labels = computed(() => (locale.value === 'zh'
  ? {
      enabled: '可操作',
      disabledOff: '禁用 / 关闭',
      disabledOn: '禁用 / 开启',
    }
  : {
      enabled: 'Enabled',
      disabledOff: 'Disabled / off',
      disabledOn: 'Disabled / on',
    }))
</script>

<template>
  <div class="switch-disabled-demo">
    <label class="switch-disabled-demo__item">
      <span>{{ labels.enabled }}</span>
      <TuffSwitch v-model="enabled" />
    </label>
    <label class="switch-disabled-demo__item is-disabled">
      <span>{{ labels.disabledOff }}</span>
      <TuffSwitch v-model="disabledOff" disabled />
    </label>
    <label class="switch-disabled-demo__item is-disabled">
      <span>{{ labels.disabledOn }}</span>
      <TuffSwitch v-model="disabledOn" disabled />
    </label>
  </div>
</template>

<style scoped>
.switch-disabled-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.switch-disabled-demo__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
}

.switch-disabled-demo__item.is-disabled {
  color: var(--tx-text-color-placeholder);
}
</style>
