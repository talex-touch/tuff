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
    <label class="switch-sizes-demo__item">
      <span>{{ labels.small }}</span>
      <TuffSwitch v-model="smallEnabled" size="small" />
    </label>
    <label class="switch-sizes-demo__item">
      <span>{{ labels.default }}</span>
      <TuffSwitch v-model="defaultEnabled" />
    </label>
    <label class="switch-sizes-demo__item">
      <span>{{ labels.large }}</span>
      <TuffSwitch v-model="largeEnabled" size="large" />
    </label>
  </div>
</template>

<style scoped>
.switch-sizes-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.switch-sizes-demo__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
}
</style>
