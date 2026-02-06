<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  loadingLabel?: string
  idleLabel?: string
}>(), {
  loadingLabel: '',
  idleLabel: '',
})

const { locale } = useI18n()
const loading = ref(false)

const labels = computed(() => ({
  loading: props.loadingLabel || (locale.value === 'zh' ? '加载中' : 'Loading'),
  idle: props.idleLabel || (locale.value === 'zh' ? '点击加载' : 'Click to load'),
}))

async function handleClick() {
  if (loading.value)
    return
  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 1200))
  loading.value = false
}
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton variant="primary" :loading="loading" @click="handleClick">
      <span v-if="loading">{{ labels.loading }}</span>
      <span v-else>{{ labels.idle }}</span>
    </TxButton>
    <TxButton variant="secondary" :loading="loading" @click="handleClick">
      <span v-if="loading">{{ labels.loading }}</span>
      <span v-else>{{ labels.idle }}</span>
    </TxButton>
    <TxButton circle icon="i-carbon-edit" :loading="loading" @click="handleClick" />
  </div>
</template>
