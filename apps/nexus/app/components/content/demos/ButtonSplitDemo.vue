<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const loading = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      run: '运行',
      settings: '设置',
      openFolder: '打开文件夹',
    }
  }
  return {
    run: 'RUN',
    settings: 'Settings',
    openFolder: 'Open Folder',
  }
})

async function handleRun() {
  if (loading.value)
    return
  loading.value = true
  await new Promise(resolve => setTimeout(resolve, 1200))
  loading.value = false
}
</script>

<template>
  <div class="tuff-demo-row">
    <TxSplitButton
      variant="primary"
      size="sm"
      icon="i-carbon-play-filled"
      :loading="loading"
      @click="handleRun"
    >
      {{ labels.run }}
      <template #menu="{ close }">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <TxButton size="sm" plain block icon="i-carbon-settings" @click="close()">
            {{ labels.settings }}
          </TxButton>
          <TxButton size="sm" plain block icon="i-carbon-folder-open" @click="close()">
            {{ labels.openFolder }}
          </TxButton>
        </div>
      </template>
    </TxSplitButton>
  </div>
</template>
