<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const autoUpdate = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBlockSwitch
          v-model="autoUpdate"
          title="自动更新"
          description="启用后台更新"
          default-icon="i-ri-refresh-line"
          active-icon="i-ri-refresh-line"
        />
  </div>
  <div v-else>
        <TxBlockSwitch
          v-model="autoUpdate"
          title="自动更新"
          description="启用后台更新"
          default-icon="i-ri-refresh-line"
          active-icon="i-ri-refresh-line"
        />
  </div>
</template>
