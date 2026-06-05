<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { clearToasts, toast } from '@talex-touch/tuffex/utils'

const { locale } = useI18n()
const syncing = ref(true)
const guardEnabled = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '任务反馈中心',
      subtitle: '把短提示、悬浮说明、局部遮罩和行内加载放进同一个后台任务面板。',
      eyebrow: 'Tuffex · Feedback',
      toastAction: '发送提示',
      hintAction: '提示说明',
      clearAction: '清空提示',
      toggleSync: syncing.value ? '结束同步' : '开始同步',
      guard: '自动重试',
      running: '同步中',
      healthy: '队列健康',
      toastTitle: '同步任务已排队',
      toastDescription: '将在 2 分钟内完成 4 个文档页面的截图核验。',
      successTitle: '反馈通道正常',
      successDescription: 'Toast host 已挂载，通知可替换且可关闭。',
      tooltip: 'Tooltip 只解释当前动作，不承载复杂表单。',
      overlay: '正在刷新任务队列…',
      inline: '行内等待',
      persistent: '持久提示',
      tasks: ['同步组件文档', '生成截图证据', '刷新 Nexus 预览'],
      owners: ['Docs', 'QA', 'Deploy'],
      states: ['运行中', '等待认证', '预览可用'],
    }
  }

  return {
    title: 'Task feedback center',
    subtitle: 'Put short notifications, hints, local blocking, and inline loading in one admin task panel.',
    eyebrow: 'Tuffex · Feedback',
    toastAction: 'Send toast',
    hintAction: 'Hint details',
    clearAction: 'Clear toast',
    toggleSync: syncing.value ? 'Stop sync' : 'Start sync',
    guard: 'Auto retry',
    running: 'Syncing',
    healthy: 'Queue healthy',
    toastTitle: 'Sync task queued',
    toastDescription: 'Four documentation pages will be screenshot-verified within 2 minutes.',
    successTitle: 'Feedback channel healthy',
    successDescription: 'Toast host is mounted, notifications can replace and dismiss.',
    tooltip: 'Tooltip explains one action; keep complex forms in drawers or pages.',
    overlay: 'Refreshing task queue…',
    inline: 'Inline wait',
    persistent: 'Persistent toast',
    tasks: ['Sync component docs', 'Generate screenshot evidence', 'Refresh Nexus preview'],
    owners: ['Docs', 'QA', 'Deploy'],
    states: ['Running', 'Awaiting proof', 'Preview ready'],
  }
})

const progressValues = [72, 48, 96] as const

const rows = computed(() => labels.value.tasks.map((task, index) => ({
  task,
  owner: labels.value.owners[index],
  state: labels.value.states[index],
  progress: progressValues[index] ?? 0,
})))

function showFeedbackToast() {
  toast({
    id: 'nexus-feedback-task-center',
    title: labels.value.toastTitle,
    description: labels.value.toastDescription,
    variant: 'warning',
    duration: 0,
  })

  toast({
    id: 'nexus-feedback-task-center-success',
    title: labels.value.successTitle,
    description: labels.value.successDescription,
    variant: 'success',
    duration: 0,
  })
}

function clearFeedbackToast() {
  clearToasts()
}

onMounted(() => {
  clearToasts()
})
</script>

<template>
  <section class="feedback-task-demo">
    <TxToastHost />

    <header class="feedback-task-demo__header">
      <div>
        <p class="feedback-task-demo__eyebrow">
          {{ labels.eyebrow }}
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>

      <div class="feedback-task-demo__actions">
        <label>
          <span>{{ labels.guard }}</span>
          <TuffSwitch v-model="guardEnabled" size="small" />
        </label>
        <TxTooltip
          :content="labels.tooltip"
          :anchor="{ placement: 'bottom', showArrow: true, panelBackground: 'glass', panelShadow: 'medium' }"
        >
          <TxButton variant="secondary" size="sm" icon="i-carbon-information">
            {{ labels.hintAction }}
          </TxButton>
        </TxTooltip>
        <TxButton size="sm" icon="i-carbon-send" @click="showFeedbackToast">
          {{ labels.toastAction }}
        </TxButton>
        <TxButton variant="ghost" size="sm" icon="i-carbon-close" @click="clearFeedbackToast">
          {{ labels.clearAction }}
        </TxButton>
      </div>
    </header>

    <div class="feedback-task-demo__badges">
      <TxStatusBadge :text="labels.running" status="warning" size="sm" />
      <TxStatusBadge :text="labels.healthy" status="success" size="sm" />
      <TxTag :label="labels.persistent" color="var(--tx-color-primary)" size="sm" />
      <span class="feedback-task-demo__inline">
        <TxSpinner :size="14" />
        {{ labels.inline }}
      </span>
    </div>

    <TxLoadingOverlay :loading="syncing" :text="labels.overlay" :spinner-size="22">
      <div class="feedback-task-demo__queue">
        <article v-for="row in rows" :key="row.task" class="feedback-task-demo__row">
          <div>
            <strong>{{ row.task }}</strong>
            <span>{{ row.owner }} · {{ row.state }}</span>
          </div>
          <TxProgressBar
            :percentage="row.progress"
            height="8px"
            :status="row.progress > 80 ? 'success' : 'warning'"
            flow-effect="shimmer"
          />
        </article>
      </div>
    </TxLoadingOverlay>

    <footer class="feedback-task-demo__footer">
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" @click="syncing = !syncing">
        {{ labels.toggleSync }}
      </TxButton>
    </footer>
  </section>
</template>

<style scoped>
.feedback-task-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 840px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 18%, var(--tx-border-color-lighter));
  border-radius: 24px;
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--tx-color-warning) 16%, transparent), transparent 32%),
    radial-gradient(circle at 96% 12%, color-mix(in srgb, var(--tx-color-primary) 14%, transparent), transparent 34%),
    color-mix(in srgb, var(--tx-bg-color) 88%, transparent);
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.08);
}

.feedback-task-demo__header,
.feedback-task-demo__actions,
.feedback-task-demo__badges,
.feedback-task-demo__inline,
.feedback-task-demo__footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feedback-task-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.feedback-task-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-warning);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.feedback-task-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.feedback-task-demo__header span,
.feedback-task-demo__row span,
.feedback-task-demo__inline {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.feedback-task-demo__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.feedback-task-demo__actions label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
}

.feedback-task-demo__badges {
  flex-wrap: wrap;
}

.feedback-task-demo__inline {
  padding: 5px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
}

.feedback-task-demo__queue {
  display: grid;
  gap: 10px;
  min-height: 210px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
}

.feedback-task-demo__row {
  display: grid;
  gap: 9px;
  padding: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color) 76%, transparent);
}

.feedback-task-demo__row > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.feedback-task-demo__row strong {
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

.feedback-task-demo__footer {
  justify-content: flex-end;
}

@media (max-width: 760px) {
  .feedback-task-demo__header,
  .feedback-task-demo__actions,
  .feedback-task-demo__row > div {
    display: grid;
    justify-content: stretch;
  }
}
</style>
