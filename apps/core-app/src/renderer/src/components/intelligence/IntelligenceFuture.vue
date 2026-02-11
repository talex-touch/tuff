<script setup name="IntelligenceFuture" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TButton from '~/components/base/tuff/TButton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
const router = useRouter()

function handleDocsClick() {
  window.open('https://github.com/talex-touch/talex-touch', '_blank', 'noopener')
}

function handleAgentsClick() {
  router.push('/intelligence/agents')
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
      :title="t('intelligence.agents.title')"
      :description="t('settings.intelligence.agentsDescription')"
      default-icon="i-carbon-bot"
      active-icon="i-carbon-bot"
      @click="handleAgentsClick"
    >
      <TButton variant="ghost" @click="handleAgentsClick">
        <i class="i-carbon-arrow-right" />
        <span>{{ t('intelligence.agents.title') }}</span>
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

<style lang="scss" scoped></style>
