<script lang="ts" name="LogTerminal" setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Terminal } from 'xterm'
import * as TerminalFit from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const props = defineProps({
  logs: {
    type: Array,
    required: true
  },
  autoScroll: {
    type: Boolean,
    default: true
  }
})

// Terminal.applyAddon(TerminalFit)

const terminal = ref()
const term = new Terminal({
  cursorBlink: true,
  disableStdin: true,
  fontSize: 12,
  lineHeight: 1.2,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  theme: {
    background: '#0b0d10',
    foreground: '#e5e7eb',
    cursor: '#9ca3af',
    selectionBackground: 'rgba(148, 163, 184, 0.2)'
  }
})

const fitAddon = new TerminalFit.FitAddon()
let resizeObserver: ResizeObserver | null = null
let opened = false
let handleWindowResize: (() => void) | null = null

function writeLogLine(log: unknown): void {
  if (typeof log === 'string') {
    term.writeln(log)
    return
  }
  if (log instanceof Uint8Array) {
    term.writeln(log)
  }
}

function scheduleScrollToBottom(): void {
  if (!props.autoScroll) return
  if (!opened) return
  window.requestAnimationFrame(() => {
    try {
      term.scrollToBottom()
    } catch {
      // ignore
    }
  })
}

function scheduleFit(): void {
  window.requestAnimationFrame(() => {
    try {
      fitAddon.fit()
    } catch {
      // ignore
    }
  })
}

function renderAll(logs: unknown[]): void {
  term.reset()
  logs.forEach(writeLogLine)
  scheduleFit()
  scheduleScrollToBottom()
}

watch(
  () => props.logs,
  (newLogs, oldLogs) => {
    if (!term || !newLogs) {
      return
    }
    if (!opened) {
      return
    }

    const oldLength = Array.isArray(oldLogs) ? oldLogs.length : 0
    const shouldReset =
      !Array.isArray(oldLogs) ||
      newLogs.length < oldLength ||
      (oldLength > 0 && newLogs.length > 0 && newLogs[0] !== oldLogs[0]) ||
      (newLogs.length === oldLength &&
        newLogs.length > 0 &&
        newLogs[newLogs.length - 1] !== oldLogs[oldLength - 1])

    if (newLogs.length === 0) {
      term.clear()
      scheduleFit()
      return
    }

    if (shouldReset) {
      renderAll(newLogs)
      return
    }

    newLogs.slice(oldLength).forEach(writeLogLine)
    scheduleFit()
    scheduleScrollToBottom()
  },
  { deep: true }
)

watch(
  () => props.autoScroll,
  (value) => {
    if (value) {
      scheduleScrollToBottom()
    }
  }
)

onMounted(() => {
  term.open(terminal.value)

  term.loadAddon(fitAddon)
  opened = true

  setTimeout(() => {
    scheduleFit()
  }, 100)

  if (Array.isArray(props.logs) && props.logs.length > 0) {
    renderAll(props.logs)
  }

  // Intentionally avoid forcing focus to prevent stealing focus from other UI.

  // term.writeln('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ')

  handleWindowResize = (): void => scheduleFit()
  window.addEventListener('resize', handleWindowResize)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => scheduleFit())
    if (terminal.value) {
      resizeObserver.observe(terminal.value)
    }
  }
})

onUnmounted(() => {
  if (handleWindowResize) {
    window.removeEventListener('resize', handleWindowResize)
    handleWindowResize = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  opened = false
  try {
    term.dispose()
  } catch {
    // ignore
  }
})
</script>

<template>
  <div ref="terminal" class="LogTerminal-Container" />
</template>

<style lang="scss" scoped>
.LogTerminal-Container {
  box-sizing: border-box;
  :deep(.xterm-viewport) {
    background-color: transparent !important;

    overflow: hidden;
    border-radius: 4px;
  }
  :deep(.xterm-screen) {
    .xterm-rows {
      color: inherit !important;
    }
    .xterm-fg-8 {
      color: rgba(148, 163, 184, 0.95) !important;
    }
  }
  position: relative;

  width: 100%;
  height: 100%;

  text-align: left;
  overflow-y: hidden;
}
</style>
