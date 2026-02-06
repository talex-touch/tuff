<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxNoData
          description="No records yet."
          :primary-action="{ label: 'Create', type: 'primary' }"
        />
  </div>
  <div v-else>
        <TxNoData
          description="No records yet."
          :primary-action="{ label: 'Create', type: 'primary' }"
        />
  </div>
</template>
