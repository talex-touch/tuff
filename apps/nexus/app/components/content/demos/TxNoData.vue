<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxNoData
        description="No records yet."
        :primary-action="{ label: 'Create', type: 'primary' }"
      />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxNoData
        description="No records yet."
        :primary-action="{ label: 'Create', type: 'primary' }"
      />
    </div>
  </div>
</template>
