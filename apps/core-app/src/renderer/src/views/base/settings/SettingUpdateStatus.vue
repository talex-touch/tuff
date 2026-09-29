<script setup lang="ts" name="SettingUpdateStatus">
import type { UpdateStatusActionKind, UpdateStatusRowView } from './update-status-display'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = defineProps<{
  view: UpdateStatusRowView
}>()

const emit = defineEmits<{
  (e: 'action', kind: UpdateStatusActionKind): void
}>()

const { t } = useI18n()

const title = computed(() => t(props.view.title.key, props.view.title.params ?? {}))

const detail = computed(() => {
  const value = props.view.detail
  if (!value) return ''
  if (value.kind === 'text') return value.text
  if (value.kind === 'message') return t(value.message.key, value.message.params ?? {})
  const bytes = t('settings.settingUpdate.status.progressDetail', {
    downloaded: value.downloaded,
    total: value.total,
    speed: value.speed
  })
  return `${value.percent}% · ${bytes}`
})

/**
 * Keep a visible indeterminate bar for the downloading phase before the first task-progress
 * payload arrives. The lifecycle phase is authoritative; byte progress only controls the fill.
 */
const showProgress = computed(
  () => Boolean(props.view.progress) || props.view.phase === 'downloading'
)
const progressIsIndeterminate = computed(() => props.view.progress?.kind !== 'determinate')
const progressPercentage = computed(() =>
  props.view.progress?.kind === 'determinate' ? props.view.progress.percentage : 0
)
const progressStatus = computed(() =>
  props.view.progress?.kind === 'indeterminate' && props.view.progress.tone === 'warning'
    ? 'warning'
    : ''
)

/**
 * Byte progress changes every second. Inside the live region a screen reader would re-read it on
 * every tick, so it sits beside the region; the bar itself still reports its value.
 */
const detailIsLive = computed(() => props.view.detail?.kind !== 'progress')

function handleAction(): void {
  if (props.view.action) emit('action', props.view.action.kind)
}
</script>

<template>
  <TuffBlockSlot class="update-status" :class="{ 'has-progress': showProgress }">
    <template #label>
      <div class="update-status__text">
        <div class="update-status__live" aria-live="polite">
          <span class="update-status__title">{{ title }}</span>
          <span
            v-if="detail && detailIsLive"
            class="update-status__detail"
            :class="{ 'is-danger': view.phase === 'failed' }"
          >
            {{ detail }}
          </span>
        </div>
        <span v-if="detail && !detailIsLive" class="update-status__detail">{{ detail }}</span>
        <TxProgressBar
          v-if="showProgress"
          class="update-status__progress"
          height="6px"
          :aria-label="title"
          :indeterminate="progressIsIndeterminate"
          :percentage="progressPercentage"
          :status="progressStatus"
        />
      </div>
    </template>

    <TxButton
      v-if="view.action"
      variant="flat"
      type="primary"
      :loading="view.action.loading"
      :disabled="view.action.disabled || view.action.loading"
      @click="handleAction"
    >
      {{ t(view.action.labelKey) }}
    </TxButton>
  </TuffBlockSlot>
</template>

<style scoped>
/* The row grows past the 56px floor once a bar sits under the text. */
.update-status.has-progress {
  padding-block: 10px;
}

.update-status__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.update-status__live {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* Set explicitly: the slot's label box carries a 24px icon font size. */
.update-status__title {
  color: var(--tx-text-color-primary);
  font-size: 14px;
  line-height: 20px;
}

.update-status__detail {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.update-status__detail.is-danger {
  color: var(--shell-danger);
}

.update-status__progress {
  margin-top: 6px;
}
</style>
