<script setup lang="ts" name="MarketCliBeta">
import { TxTag } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
</script>

<template>
  <div class="MarketCliBeta-Container">
    <TuffGroupBlock
      :name="t('market.cliGroupTitle')"
      :description="t('market.cliGroupDesc')"
      memory-name="market-cli-beta"
    >
      <TuffBlockSlot
        :title="t('market.cliBetaTitle')"
        :description="t('market.cliBetaDesc')"
        default-icon="i-carbon-terminal"
        active-icon="i-carbon-terminal"
        :icon-size="18"
      >
        <TxTag type="warning" size="sm">{{ t('market.cliBetaTag') }}</TxTag>
      </TuffBlockSlot>
    </TuffGroupBlock>
  </div>
</template>

<style lang="scss" scoped>
.MarketCliBeta-Container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
