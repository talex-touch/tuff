<script setup lang="ts">
import type { CodeRunPayload } from '@talex-touch/tuffex/code-stream'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const CODE = 'open login.html'
const lastRun = ref<CodeRunPayload | null>(null)

const copy = computed(() => (locale.value === 'zh'
  ? {
      copyLabel: '复制',
      copiedLabel: '已复制',
      runLabel: '执行',
      ranLabel: '已执行',
      runTitle: '在终端执行',
      idle: '点击「执行」会把命令交给宿主终端运行。',
      dispatched: (payload: CodeRunPayload) => `已派发 (${payload.lang})：${payload.code}`,
    }
  : {
      copyLabel: 'Copy',
      copiedLabel: 'Copied',
      runLabel: 'Run',
      ranLabel: 'Ran',
      runTitle: 'Run in terminal',
      idle: 'Click Run to hand the snippet to the host terminal.',
      dispatched: (payload: CodeRunPayload) => `Dispatched (${payload.lang}): ${payload.code}`,
    }))

function handleRun(payload: CodeRunPayload): void {
  lastRun.value = payload
}
</script>

<template>
  <div class="code-stream-run-demo not-prose">
    <TxCodeStream
      :code="CODE"
      lang="bash"
      lang-label="bash"
      runnable
      :copy-label="copy.copyLabel"
      :copied-label="copy.copiedLabel"
      :run-label="copy.runLabel"
      :ran-label="copy.ranLabel"
      :run-title="copy.runTitle"
      @run="handleRun"
    />
    <p class="code-stream-run-demo__status" role="status" aria-live="polite">
      {{ lastRun ? copy.dispatched(lastRun) : copy.idle }}
    </p>
  </div>
</template>

<style scoped>
.code-stream-run-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
}

.code-stream-run-demo__status {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
}
</style>
