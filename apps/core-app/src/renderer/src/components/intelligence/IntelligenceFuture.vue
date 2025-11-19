<script setup name="IntelligenceFuture" lang="ts">
import { useI18n } from 'vue-i18n'
import TButton from '~/components/base/tuff/TButton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()

function handleDocsClick() {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.landing.future.title')"
    :description="t('settings.intelligence.landing.future.desc')"
    default-icon="i-carbon-cloud-upload"
    active-icon="i-carbon-cloud-upload"
    memory-name="intelligence-future"
  >
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.future.title')"
      :description="t('settings.intelligence.landing.future.desc')"
      default-icon="i-carbon-cloud-upload"
      active-icon="i-carbon-cloud-upload"
      disabled
    >
      <TButton variant="ghost" disabled>
        <i class="i-carbon-time" />
        <span>{{ t('settings.intelligence.landing.future.cta') }}</span>
      </TButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.intelligence.landing.docs.title')"
      :description="t('settings.intelligence.landing.docs.desc')"
      default-icon="i-carbon-notes"
      active-icon="i-carbon-notes"
      @click="handleDocsClick"
    >
      <TButton variant="ghost" @click="handleDocsClick">
        <i class="i-carbon-link" />
        <span>{{ t('settings.intelligence.docsButton') }}</span>
      </TButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
</style>
