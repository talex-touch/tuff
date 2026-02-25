<script setup lang="ts" name="StoreDocs">
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import SettingPlatformCapabilities from '~/views/base/settings/SettingPlatformCapabilities.vue'

const { t } = useI18n()
const appSdk = useAppSdk()
const docsBase = () => getAuthBaseUrl().replace(/\/$/, '')

function openPlatformDocs(): void {
  const platformDocsUrl = `${docsBase()}/docs/dev/api/platform-capabilities`
  void appSdk.openExternal(platformDocsUrl)
}
</script>

<template>
  <div class="StoreDocs-Container">
    <TuffGroupBlock
      :name="t('store.docsGroupTitle')"
      :description="t('store.docsGroupDesc')"
      memory-name="store-docs"
    >
      <TuffBlockSlot
        :title="t('store.docsLinkTitle')"
        :description="t('store.docsLinkDesc')"
        default-icon="i-carbon-book"
        active-icon="i-carbon-book"
        :icon-size="18"
      >
        <TxButton variant="flat" @click="openPlatformDocs">
          <div class="i-carbon-launch" />
          <span>{{ t('store.docsOpen') }}</span>
        </TxButton>
      </TuffBlockSlot>
    </TuffGroupBlock>

    <SettingPlatformCapabilities />
  </div>
</template>

<style lang="scss" scoped>
.StoreDocs-Container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
