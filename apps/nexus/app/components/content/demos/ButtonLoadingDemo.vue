<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  loadingLabel?: string
  idleLabel?: string
}>()

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { loading: '加载中', idle: '点击加载' }
  : { loading: 'Loading', idle: 'Click to load' }))

const loadingLabel = computed(() => props.loadingLabel || labels.value.loading)
const idleLabel = computed(() => props.idleLabel || labels.value.idle)

const loading = ref(false)

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
      <span v-if="loading">{{ loadingLabel }}</span>
      <span v-else>{{ idleLabel }}</span>
    </TxButton>
    <TxButton variant="secondary" :loading="loading" @click="handleClick">
      <span v-if="loading">{{ loadingLabel }}</span>
      <span v-else>{{ idleLabel }}</span>
    </TxButton>
    <TxButton circle icon="i-carbon-edit" :loading="loading" @click="handleClick" />
  </div>
</template>
