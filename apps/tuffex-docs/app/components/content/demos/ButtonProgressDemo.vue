<script setup lang="ts">
import { computed, onBeforeUnmount, reactive } from 'vue'

type Outcome = 'success' | 'warning' | 'error'

interface RunnerState {
  phase: 'idle' | 'running' | 'done'
  progress: number | undefined
  status: '' | Outcome
}

const { locale } = useI18n()

const runners = reactive<Record<Outcome, RunnerState>>({
  success: { phase: 'idle', progress: undefined, status: '' },
  warning: { phase: 'idle', progress: undefined, status: '' },
  error: { phase: 'idle', progress: undefined, status: '' },
})

const timers = new Map<Outcome, Set<ReturnType<typeof setTimeout>>>()

function clearOutcomeTimers(key: Outcome) {
  const bucket = timers.get(key)
  if (!bucket)
    return
  for (const id of bucket)
    clearTimeout(id)
  bucket.clear()
}

function schedule(key: Outcome, fn: () => void, ms: number) {
  let bucket = timers.get(key)
  if (!bucket) {
    bucket = new Set()
    timers.set(key, bucket)
  }
  const id = setTimeout(() => {
    bucket?.delete(id)
    fn()
  }, ms)
  bucket.add(id)
}

function runOutcome(key: Outcome) {
  const state = runners[key]
  if (state.phase === 'running')
    return

  clearOutcomeTimers(key)
  state.phase = 'running'
  state.status = ''
  state.progress = 8

  const steps = key === 'error'
    ? [26, 52, 68]
    : key === 'warning'
      ? [24, 56, 84, 100]
      : [22, 48, 76, 100]

  steps.forEach((value, idx) => {
    schedule(key, () => {
      state.progress = value
    }, (idx + 1) * 320)
  })

  const settleAt = (steps.length + 1) * 320
  schedule(key, () => {
    state.phase = 'done'
    state.status = key
  }, settleAt)

  schedule(key, () => {
    state.phase = 'idle'
    state.progress = undefined
    state.status = ''
  }, settleAt + 1800)
}

const copy = computed(() => (locale.value === 'zh'
  ? {
      success: {
        idle: '发布更新',
        running: '正在上传',
        done: '发布成功',
      },
      warning: {
        idle: '同步配置',
        running: '正在同步',
        done: '部分跳过',
      },
      error: {
        idle: '校验签名',
        running: '正在校验',
        done: '校验失败',
      },
    }
  : {
      success: {
        idle: 'Publish update',
        running: 'Uploading',
        done: 'Published',
      },
      warning: {
        idle: 'Sync config',
        running: 'Syncing',
        done: 'Synced with warnings',
      },
      error: {
        idle: 'Verify signature',
        running: 'Verifying',
        done: 'Verification failed',
      },
    }))

onBeforeUnmount(() => {
  clearOutcomeTimers('success')
  clearOutcomeTimers('warning')
  clearOutcomeTimers('error')
})
</script>

<template>
  <div class="tuff-demo-row not-prose">
    <TxButton
      variant="primary"
      :progress="runners.success.progress"
      :status="runners.success.status"
      @click="runOutcome('success')"
    >
      {{ copy.success[runners.success.phase] }}
    </TxButton>

    <TxButton
      variant="secondary"
      :progress="runners.warning.progress"
      :status="runners.warning.status"
      @click="runOutcome('warning')"
    >
      {{ copy.warning[runners.warning.phase] }}
    </TxButton>

    <TxButton
      variant="secondary"
      :progress="runners.error.progress"
      :status="runners.error.status"
      @click="runOutcome('error')"
    >
      {{ copy.error[runners.error.phase] }}
    </TxButton>
  </div>
</template>
