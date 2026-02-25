<script setup lang="ts" name="StoreCliBeta">
import { TxTag } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
</script>

<template>
  <div class="StoreCliBeta-Container">
    <TuffGroupBlock
      :name="t('store.cliGroupTitle')"
      :description="t('store.cliGroupDesc')"
      memory-name="store-cli-beta"
    >
      <TuffBlockSlot
        :title="t('store.cliBetaTitle')"
        :description="t('store.cliBetaDesc')"
        default-icon="i-carbon-terminal"
        active-icon="i-carbon-terminal"
        :icon-size="18"
      >
        <TxTag type="warning" size="sm">{{ t('store.cliBetaTag') }}</TxTag>
      </TuffBlockSlot>
    </TuffGroupBlock>
  </div>
</template>

<style lang="scss" scoped>
.StoreCliBeta-Container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
