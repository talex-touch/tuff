<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  loadingLabel?: string
  idleLabel?: string
}>(), {
  loadingLabel: 'Loading',
  idleLabel: 'Click to load',
})

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
      <span v-if="loading">{{ props.loadingLabel }}</span>
      <span v-else>{{ props.idleLabel }}</span>
    </TxButton>
    <TxButton variant="secondary" :loading="loading" @click="handleClick">
      <span v-if="loading">{{ props.loadingLabel }}</span>
      <span v-else>{{ props.idleLabel }}</span>
    </TxButton>
    <TxButton circle icon="i-carbon-edit" :loading="loading" @click="handleClick" />
  </div>
</template>
