<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxOfflineState
        description="Network connection lost."
        :primary-action="{ label: 'Retry', type: 'primary' }"
      />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxOfflineState
        description="Network connection lost."
        :primary-action="{ label: 'Retry', type: 'primary' }"
      />
    </div>
  </div>
</template>
