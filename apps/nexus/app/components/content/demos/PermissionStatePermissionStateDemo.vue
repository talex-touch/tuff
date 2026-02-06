<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxPermissionState
          description="Request access to continue."
          :primary-action="{ label: 'Request access', type: 'primary' }"
        />
  </div>
  <div v-else>
        <TxPermissionState
          description="Request access to continue."
          :primary-action="{ label: 'Request access', type: 'primary' }"
        />
  </div>
</template>
