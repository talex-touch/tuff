<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxPermissionState
        description="Request access to continue."
        :primary-action="{ label: 'Request access', type: 'primary' }"
      />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxPermissionState
        description="Request access to continue."
        :primary-action="{ label: 'Request access', type: 'primary' }"
      />
    </div>
  </div>
</template>
