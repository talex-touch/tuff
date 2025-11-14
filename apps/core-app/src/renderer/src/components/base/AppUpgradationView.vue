<template>
  <div class="AppUpgradation-Container flex flex-col items-center justify-center">
    <p>{{ t('updateModal.title') }}</p>
    <span>{{ t('updateModal.publishedAt', { time: publishedAt }) }}</span>

    <div class="AppUpgradation-Content-Markdown h-full overflow-hidden">
      <FlatMarkdown :model-value="release.body" :readonly="true" />
    </div>

    <div class="AppUpgradation-Content">
      <FlatButton @click="close">{{ t('updateModal.notNow') }}</FlatButton>
      <FlatButton :primary="true" @click="upgrade">{{ t('updateModal.update') }}</FlatButton>
    </div>
  </div>
</template>

<script lang="ts" name="AppUpgradationView" setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue'
import FlatButton from '@comp/base/button//FlatButton.vue'

const props = defineProps({
  release: {
    type: Object,
    required: true
  }
})
const close = inject('destroy')
const { t } = useI18n()

function upgrade() {
  window.$nodeApi.openExternal(props.release.html_url)
}

const publishedAt = computed(() => {
  if (!props.release?.published_at) return ''
  const date = new Date(props.release.published_at)
  return Number.isNaN(date.getTime()) ? props.release.published_at : date.toLocaleString()
})
</script>

<style lang="scss" scoped>
:deep(.FlatMarkdown-Container) {
  position: relative;

  max-height: calc(85vh - 220px);

  font-size: 12px;
}

.AppUpgradation-Container {
  position: relative;

  min-width: 480px;
  width: 100%;
  height: 100%;

  overflow: hidden;
}

.AppUpgradation-Content {
  position: relative;
  margin: 8px 5px;
  display: flex;

  justify-content: space-around;

  gap: 2rem;

  height: 40px;

  // bottom: 1.5rem;
}
</style>
