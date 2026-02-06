<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxOfflineState
          description="Network connection lost."
          :primary-action="{ label: 'Retry', type: 'primary' }"
        />
  </div>
  <div v-else>
        <TxOfflineState
          description="Network connection lost."
          :primary-action="{ label: 'Retry', type: 'primary' }"
        />
  </div>
</template>
