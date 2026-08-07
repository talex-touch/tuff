<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'

type Status = 'pending' | 'running' | 'done' | 'error'

interface ToolCall {
  type: 'tool-call'
  id: string
  name: string
  status: Status
  summary?: string
  input?: string
  output?: string
  error?: string
  logs?: string
}

const LOG_LINES = [
  'resolving src/main.ts',
  'reading 1.2 KB',
  'parsing module graph',
  'done in 34ms',
]

const call = reactive<ToolCall>({
  type: 'tool-call',
  id: 'call-1',
  name: 'read_file',
  status: 'done',
  summary: 'Read src/main.ts',
  input: JSON.stringify({ path: 'src/main.ts' }, null, 2),
  output: 'export function main() {}',
  logs: LOG_LINES.join('\n'),
})

const retried = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function run() {
  stop()
  call.status = 'running'
  call.logs = ''
  call.output = undefined
  call.error = undefined

  let line = 0
  timer = setInterval(() => {
    call.logs = LOG_LINES.slice(0, ++line).join('\n')
    if (line >= LOG_LINES.length) {
      stop()
      call.status = 'done'
      call.output = 'export function main() {}'
    }
  }, 350)
}

function fail() {
  stop()
  call.status = 'error'
  call.error = 'ENOENT: src/main.ts not found'
  call.output = undefined
}

// Move the call back to `running` on retry, or users click it repeatedly.
function onRetry(id: string) {
  retried.value++
  console.log('retry', id)
  run()
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm" @click="run">
        Run
      </button>
      <button type="button" class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm" @click="fail">
        Fail
      </button>
    </div>

    <TxToolCallCard :tool-call="call" default-expanded @retry="onRetry" />

    <p v-if="retried" class="text-sm text-[var(--tx-text-color-secondary)]">
      Retried {{ retried }} time(s).
    </p>
  </div>
</template>
