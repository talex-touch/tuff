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

watchEffect(() => {
  const array = props.logs
  if (!array || array.length < 1) return

  const last = array[array.length - 1]

  // for(let i = logArray.length - 1; i < props.logs.length; i++) {
  //   logArray.push(props.logs[i])
  //
  //   term.write(props.logs[i])
  // }

  // term.clear()

  // props.logs.forEach(log => {
  //   term.writeln(log)
  // })

  // write last
  term.writeln(last)
})

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
  padding: 5px;
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
