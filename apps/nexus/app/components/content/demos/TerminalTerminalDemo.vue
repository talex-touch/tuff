<script setup lang="ts">
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'

const { locale } = useI18n()
const terminal = shallowRef<TerminalInstance | null>(null)
const readOnly = ref(false)
const compact = ref(false)
const ready = ref(false)
const size = ref<TerminalSize | null>(null)
const input = ref('')
const error = ref('')
let disposed = false
let sequence = 0

const copy = computed(() => locale.value === 'zh'
  ? {
      label: '终端显示演示',
      description: '此网页仅显示输出并捕获输入，没有连接 shell 或进程。输入不会自动回显。',
      append: '追加输出',
      burst: '连续输出',
      reset: '重置',
      resize: '切换尺寸',
      readOnly: '只读',
      received: '最近输入（转义表示）',
      none: '点击终端后输入，或按 Ctrl+C',
      greeting: 'ANSI 颜色 · 中文输出 · Unicode ✓',
      output: '收到显示数据',
      stream: '连续记录',
      waiting: '等待终端初始化',
    }
  : {
      label: 'Terminal display demo',
      description: 'This web demo displays output and captures input only. No shell or process is connected; input is not echoed.',
      append: 'Append output',
      burst: 'Stream output',
      reset: 'Reset',
      resize: 'Toggle size',
      readOnly: 'Read only',
      received: 'Last input (escaped)',
      none: 'Click the terminal and type, or press Ctrl+C',
      greeting: 'ANSI colors · 中文输出 · Unicode ✓',
      output: 'Display data received',
      stream: 'Stream record',
      waiting: 'Waiting for terminal initialization',
    })

function writeLine(text: string): void {
  void terminal.value?.writeln(text).catch((reason: unknown) => {
    if (!disposed)
      error.value = reason instanceof Error ? reason.message : String(reason)
  })
}

function handleReady(instance: TerminalInstance): void {
  terminal.value = instance
  ready.value = true
  writeLine(`\x1B[32m${copy.value.greeting}\x1B[0m`)
  writeLine('\x1B[34mTuffEx TxTerminal\x1B[0m')
}

function append(): void {
  sequence += 1
  writeLine(`\x1B[36m${String(sequence).padStart(3, '0')}\x1B[0m  ${copy.value.output}`)
}

function burst(): void {
  for (let index = 0; index < 30; index++) {
    sequence += 1
    writeLine(`${String(sequence).padStart(3, '0')}  ${copy.value.stream} · 中文 ✓`)
  }
}

function reset(): void {
  terminal.value?.reset()
  input.value = ''
  error.value = ''
  sequence = 0
}

function handleInput(data: string): void {
  input.value = JSON.stringify(data)
}

onBeforeUnmount(() => {
  disposed = true
  terminal.value = null
})
</script>

<template>
  <div class="terminal-demo not-prose">
    <p class="terminal-demo__description">
      {{ copy.description }}
    </p>
    <div class="terminal-demo__toolbar">
      <TxButton size="sm" :disabled="!ready" @click="append">
        {{ copy.append }}
      </TxButton>
      <TxButton size="sm" :disabled="!ready" @click="burst">
        {{ copy.burst }}
      </TxButton>
      <TxButton size="sm" :disabled="!ready" @click="reset">
        {{ copy.reset }}
      </TxButton>
      <TxButton size="sm" @click="compact = !compact">
        {{ copy.resize }}
      </TxButton>
      <label class="terminal-demo__toggle">
        <TxSwitch v-model="readOnly" />
        <span>{{ copy.readOnly }}</span>
      </label>
      <output class="terminal-demo__size">{{ size ? `${size.cols} × ${size.rows}` : copy.waiting }}</output>
    </div>
    <output v-if="error" role="alert">{{ error }}</output>
    <div class="terminal-demo__host" :class="{ 'is-compact': compact }">
      <TxTerminal
        :read-only="readOnly"
        :labels="{ ariaLabel: copy.label }"
        @ready="handleReady"
        @data="handleInput"
        @resize="size = $event"
      />
    </div>
    <div class="terminal-demo__input">
      <span>{{ copy.received }}</span>
      <code>{{ input || copy.none }}</code>
    </div>
  </div>
</template>

<style scoped>
.terminal-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}

.terminal-demo__description {
  margin: 0;
  line-height: 1.5;
}

.terminal-demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.terminal-demo__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.terminal-demo__size {
  margin-inline-start: auto;
  font-variant-numeric: tabular-nums;
}

.terminal-demo__host {
  width: 100%;
  height: 248px;
  min-width: 0;
}

.terminal-demo__host.is-compact {
  width: 72%;
  height: 176px;
}

.terminal-demo__input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.terminal-demo__input code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--tx-text-color-primary, #303133);
}
</style>
