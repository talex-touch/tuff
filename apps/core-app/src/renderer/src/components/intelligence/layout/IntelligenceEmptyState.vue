<script lang="ts" name="IntelligenceEmptyState" setup>
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <TxEmptyState
    class="intelligence-empty-state"
    variant="no-selection"
    size="large"
    :title="t('intelligence.empty.title')"
    :description="t('intelligence.empty.description')"
    role="status"
    aria-live="polite"
  />
</template>

<style lang="scss" scoped>
.intelligence-empty-state {
  width: 100%;
  height: 100%;
  justify-content: center;
  -webkit-app-region: drag;
}
</style>
