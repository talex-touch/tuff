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
    <TuffSwitch v-model="enabled" :label="labels.enabled" />
    <TuffSwitch v-model="disabledOff" :label="labels.disabledOff" disabled />
    <TuffSwitch v-model="disabledOn" :label="labels.disabledOn" disabled />
  </div>
</template>

<style scoped>
.switch-disabled-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}
</style>
