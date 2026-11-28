<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const smallEnabled = ref(true)
const defaultEnabled = ref(true)
const largeEnabled = ref(true)

const labels = computed(() => (locale.value === 'zh'
  ? {
      small: '小尺寸',
      default: '默认尺寸',
      large: '大尺寸',
    }
  : {
      small: 'Small',
      default: 'Default',
      large: 'Large',
    }))
</script>

<template>
  <div class="switch-sizes-demo">
    <TuffSwitch v-model="smallEnabled" :label="labels.small" size="small" />
    <TuffSwitch v-model="defaultEnabled" :label="labels.default" />
    <TuffSwitch v-model="largeEnabled" :label="labels.large" size="large" />
  </div>
</template>

<style scoped>
.switch-sizes-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}
</style>
