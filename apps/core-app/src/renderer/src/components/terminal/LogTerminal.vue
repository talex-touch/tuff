<template>
  <div ref="terminal" class="LogTerminal-Container"></div>
</template>

<script>
export default {
  name: 'LogTerminal'
}
</script>

<script setup>
import { onMounted, reactive, ref, watchEffect } from 'vue'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'
import * as TerminalFit from 'xterm-addon-fit'

const props = defineProps({
  logs: {
    type: Array,
    required: true
  }
})

// Terminal.applyAddon(TerminalFit)

const terminal = ref()
const term = new Terminal({
  cursorBlink: true,
  disableStdin: true,
  fontSize: 12,
  lineHeight: 1
})

watch(
  () => props.logs,
  (newLogs, oldLogs) => {
    if (!term || !newLogs) {
      return
    }
    // If the logs array is cleared, clear the terminal
    if (newLogs.length === 0 && oldLogs && oldLogs.length > 0) {
      term.clear()
      return
    }

    // Find the new logs that were added
    const newEntries = newLogs.slice(oldLogs?.length ?? 0)
    newEntries.forEach((log) => {
      term.writeln(log)
    })
  },
  { deep: true }
)

onMounted(() => {
  term.open(terminal.value)

  const fitAddon = new TerminalFit.FitAddon()
  term.loadAddon(fitAddon)

  setTimeout(() => {
    fitAddon.fit()
  }, 100)

  term.focus()

  // term.writeln('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ')

  window.addEventListener('resize', () => {
    fitAddon.fit()
  })
})
</script>

<style lang="scss" scoped>
.LogTerminal-Container {
  box-sizing: border-box;
  :deep(.xterm-viewport) {
    background-color: #00000011 !important;

    overflow: hidden;
    border-radius: 4px;
  }
  :deep(.xterm-screen) {
    .xterm-rows {
      color: var(--el-text-color-primary) !important;
    }
    .xterm-fg-8 {
      color: var(--el-text-color-secondary) !important;
    }
  }
  position: relative;

  width: 100%;
  height: 100%;

  text-align: left;
  overflow-y: hidden;
}
</style>
