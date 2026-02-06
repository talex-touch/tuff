<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const loading = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBlockSwitch
          v-model="loading"
          title="正在同步"
          description="同步过程中暂不可用"
          default-icon="i-ri-loader-4-line"
          active-icon="i-ri-loader-4-line"
          :loading="true"
        />
  </div>
  <div v-else>
        <TxBlockSwitch
          v-model="loading"
          title="正在同步"
          description="同步过程中暂不可用"
          default-icon="i-ri-loader-4-line"
          active-icon="i-ri-loader-4-line"
          :loading="true"
        />
  </div>
</template>
