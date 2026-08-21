<script lang="ts" name="PluginEmptyState" setup>
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()

function openStore(): void {
  void router.push('/store')
}
</script>

<template>
  <TxEmptyState
    class="plugin-empty-state"
    variant="no-selection"
    size="large"
    :title="t('plugin.emptyState.message')"
    :description="t('plugin.emptyState.description')"
    :primary-action="{
      label: t('plugin.emptyState.exploreStore'),
      variant: 'flat',
      icon: 'i-ri-store-line'
    }"
    role="status"
    aria-live="polite"
    @primary="openStore"
  />
</template>

<style lang="scss" scoped>
.plugin-empty-state {
  width: 100%;
  height: 100%;
  justify-content: center;
  -webkit-app-region: drag;
}

.plugin-empty-state :deep(.tx-button) {
  -webkit-app-region: no-drag;
}
</style>
