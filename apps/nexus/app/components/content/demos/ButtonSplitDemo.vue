<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { run: '运行', settings: '设置', openFolder: '打开文件夹' }
  : { run: 'RUN', settings: 'Settings', openFolder: 'Open Folder' }))

const loading = ref(false)

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
      icon="i-ri-play-fill"
      :loading="loading"
      @click="handleRun"
    >
      {{ labels.run }}
      <template #menu="{ close }">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <TxButton size="sm" plain block icon="i-ri-settings-3-line" @click="close()">
            {{ labels.settings }}
          </TxButton>
          <TxButton size="sm" plain block icon="i-ri-folder-open-line" @click="close()">
            {{ labels.openFolder }}
          </TxButton>
        </div>
      </template>
    </TxSplitButton>
  </div>
</template>
