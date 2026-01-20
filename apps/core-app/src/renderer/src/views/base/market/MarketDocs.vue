<script setup lang="ts" name="MarketDocs">
import { useI18n } from 'vue-i18n'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { TxButton } from '@talex-touch/tuffex'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import SettingPlatformCapabilities from '~/views/base/settings/SettingPlatformCapabilities.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'

const { t } = useI18n()
const appSdk = useAppSdk()
const docsBase = () => getAuthBaseUrl().replace(/\/$/, '')

function openPlatformDocs(): void {
  const platformDocsUrl = `${docsBase()}/docs/dev/api/platform-capabilities`
  void appSdk.openExternal(platformDocsUrl)
}
</script>

<template>
  <div class="MarketDocs-Container">
    <TuffGroupBlock
      :name="t('market.docsGroupTitle')"
      :description="t('market.docsGroupDesc')"
      memory-name="market-docs"
    >
      <TuffBlockSlot
        :title="t('market.docsLinkTitle')"
        :description="t('market.docsLinkDesc')"
        default-icon="i-carbon-book"
        active-icon="i-carbon-book"
        :icon-size="18"
      >
        <TxButton variant="flat" @click="openPlatformDocs">
          <div class="i-carbon-launch" />
          <span>{{ t('market.docsOpen') }}</span>
        </TxButton>
      </TuffBlockSlot>
    </TuffGroupBlock>

    <SettingPlatformCapabilities />
  </div>
</template>

<style lang="scss" scoped>
.MarketDocs-Container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
