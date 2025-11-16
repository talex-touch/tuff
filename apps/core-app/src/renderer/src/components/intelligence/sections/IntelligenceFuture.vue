<script setup name="IntelligenceFuture" lang="ts">
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TButton from '~/components/base/tuff/TButton.vue'

const { t } = useI18n()

function handleDocsClick() {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}
</script>

<template>
  <tuff-group-block
    :name="t('settings.aisdk.landing.future.title')"
    :description="t('settings.aisdk.landing.future.desc')"
    default-icon="i-carbon-cloud-upload"
    active-icon="i-carbon-cloud-upload"
    memory-name="intelligence-future"
  >
    <tuff-block-slot
      :title="t('settings.aisdk.landing.future.title')"
      :description="t('settings.aisdk.landing.future.desc')"
      default-icon="i-carbon-cloud-upload"
      active-icon="i-carbon-cloud-upload"
      disabled
    >
      <TButton variant="ghost" disabled>
        <i class="i-carbon-time" />
        <span>{{ t('settings.aisdk.landing.future.cta') }}</span>
      </TButton>
    </tuff-block-slot>

    <tuff-block-slot
      :title="t('settings.aisdk.landing.docs.title')"
      :description="t('settings.aisdk.landing.docs.desc')"
      default-icon="i-carbon-notes"
      active-icon="i-carbon-notes"
      @click="handleDocsClick"
    >
      <TButton variant="ghost" @click="handleDocsClick">
        <i class="i-carbon-link" />
        <span>{{ t('settings.aisdk.docsButton') }}</span>
      </TButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>