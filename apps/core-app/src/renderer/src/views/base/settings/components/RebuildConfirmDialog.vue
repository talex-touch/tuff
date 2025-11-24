<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'

const props = defineProps<{
  onConfirm: () => void
  onCancel?: () => void
}>()

const destroy = inject('destroy') as () => void
const { t } = useI18n()
const countdown = ref(3)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})

const handleConfirm = () => {
  if (countdown.value > 0) return
  props.onConfirm()
  destroy?.()
}

const close = () => {
  props.onCancel?.()
  destroy?.()
}
</script>

<template>
  <div class="rebuild-confirm-dialog">
    <div class="dialog-header">
      <div class="icon-wrapper">
        <div class="i-carbon-warning-alt text-24px text-yellow-500" />
      </div>
      <h3 class="dialog-title">{{ t('settings.settingFileIndex.rebuildTitle') }}</h3>
    </div>

    <div class="dialog-content">
      <div class="warning-item">
        <div class="i-carbon-battery-full text-16px" />
        <span>{{ t('settings.settingFileIndex.warningBatterySimple') }}</span>
      </div>
      <div class="warning-item">
        <div class="i-carbon-time text-16px" />
        <span>{{ t('settings.settingFileIndex.warningSearchSimple') }}</span>
      </div>
      <div class="warning-item">
        <div class="i-carbon-meter text-16px" />
        <span>{{ t('settings.settingFileIndex.warningPerformanceSimple') }}</span>
      </div>
    </div>

    <div class="dialog-footer">
      <FlatButton @click="close">
        {{ t('common.cancel') }}
      </FlatButton>
      <FlatButton
        primary
        :disabled="countdown > 0"
        @click="handleConfirm"
      >
        {{ countdown > 0 ? `${t('common.confirm')} (${countdown}s)` : t('common.confirm') }}
      </FlatButton>
    </div>
  </div>
</template>

<style scoped>
.rebuild-confirm-dialog {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 320px;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(234, 179, 8, 0.1);
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
