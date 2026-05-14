<script setup lang="ts" name="StoreDocs">
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useI18n } from 'vue-i18n'
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
    <section class="StoreDocs-Intro">
      <div class="StoreDocs-IntroIcon i-carbon-book" />
      <div class="StoreDocs-IntroCopy">
        <h2>{{ t('store.docsGroupTitle') }}</h2>
        <p>{{ t('store.docsGroupDesc') }}</p>
      </div>
      <TxButton class="StoreDocs-IntroAction" variant="flat" @click="openPlatformDocs">
        <div class="i-carbon-launch" />
        <span>{{ t('store.docsOpen') }}</span>
      </TxButton>
    </section>

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

.StoreDocs-Intro {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 58%, transparent);
}

.StoreDocs-IntroIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 12%, transparent);
  font-size: 18px;
}

.StoreDocs-IntroCopy {
  min-width: 0;

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 14px;
    line-height: 1.35;
    font-weight: 600;
    color: var(--tx-text-color-primary);
  }

  p {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--tx-text-color-secondary);
  }
}

.StoreDocs-IntroAction {
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .StoreDocs-Intro {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .StoreDocs-IntroAction {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
</style>
