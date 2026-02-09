<script lang="ts" name="AppUpgradationView" setup>
import { TxButton, TxScroll } from '@talex-touch/tuffex'
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatMarkdown from '~/components/base/input/FlatMarkdown.vue'

const props = defineProps({
  release: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['updateNow', 'skipVersion', 'remindLater'])
const close = inject<() => void>('destroy')
const { t } = useI18n()
function handleUpdateNow(): void {
  emit('updateNow')
  close?.()
}

function handleSkip(): void {
  emit('skipVersion')
  close?.()
}

function handleRemindLater(): void {
  emit('remindLater')
  close?.()
}

/**
 * 格式化发布时间
 *
 * 将 ISO 8601 格式的时间字符串转换为本地化的日期时间格式
 */
const publishedAt = computed<string>(() => {
  if (!props.release?.published_at) return ''

  const date = new Date(props.release.published_at)
  return Number.isNaN(date.getTime()) ? props.release.published_at : date.toLocaleString()
})
</script>

<template>
  <div class="AppUpgradation-Container">
    <div class="AppUpgradation-Header">
      <p>{{ t('settings.updateModal.title') }}</p>
      <span>{{ t('settings.updateModal.publishedAt', { time: publishedAt }) }}</span>
    </div>

    <div class="AppUpgradation-Body">
      <TxScroll class="AppUpgradation-Scroll" :no-padding="true" :bar-size="6">
        <div class="AppUpgradation-Content-Markdown">
          <FlatMarkdown :model-value="release.body" :readonly="true" />
        </div>
      </TxScroll>
    </div>

    <div class="AppUpgradation-Content">
      <TxButton variant="flat" @click="handleSkip">
        {{ t('settings.updateModal.skip') }}
      </TxButton>
      <TxButton variant="flat" @click="handleRemindLater">
        {{ t('settings.updateModal.remindLater') }}
      </TxButton>
      <TxButton variant="flat" type="primary" @click="handleUpdateNow">
        {{ t('settings.updateModal.updateNow') }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:deep(.FlatMarkdown-Container) {
  position: relative;
  width: 100%;
  height: 100%;
  font-size: 12px;
}

.AppUpgradation-Container {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 480px;
  width: min(720px, 90vw);
  height: min(70vh, 560px);
  min-height: 360px;
  overflow: hidden;
  gap: 8px;
}

.AppUpgradation-Header {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;

  p {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    text-align: center;
  }

  span {
    display: block;
    font-size: 12px;
    text-align: center;
    color: var(--el-text-color-secondary);
  }
}

.AppUpgradation-Body {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.AppUpgradation-Scroll {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.AppUpgradation-Content-Markdown {
  height: 100%;
  min-height: 100%;
}

.AppUpgradation-Content {
  position: relative;
  margin: 8px 5px;
  display: flex;
  justify-content: space-around;
  gap: 2rem;
  height: 40px;
  flex: 0 0 auto;
}
</style>
