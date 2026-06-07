<script name="InteractiveTerminal" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import 'xterm/lib/xterm.js'
// import * as TerminalFit from "xterm-addon-fit";

// Terminal.applyAddon(TerminalFit);

const terminal = ref()
const term = new Terminal({
  // rendererType: "canvas",
  cursorBlink: true,
  disableStdin: true,
  fontSize: 16,
  lineHeight: 1
})

defineExpose({
  getTerminal: () => terminal.value
})

let fitTimer = null
let onResize = null

onMounted(() => {
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.open(terminal.value)
  fitTimer = setTimeout(() => {
    fitAddon.fit()
  }, 1000)
  term.writeln('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ')

  term.focus()
  onResize = () => {
    fitAddon.fit()
  }
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  if (fitTimer) {
    clearTimeout(fitTimer)
    fitTimer = null
  }
  if (onResize) {
    window.removeEventListener('resize', onResize)
    onResize = null
  }
  term.dispose()
})
</script>

<template>
  <div ref="terminal" class="InteractiveTerminal-Container" />
</template>

<style lang="scss">
.xterm-screen {
  .xterm-rows {
    color: var(--tx-text-color-primary) !important;
  }
  .xterm-fg-8 {
    color: var(--tx-text-color-secondary) !important;
  }

  width: 100%;
  height: 100%;
}

.xterm-viewport {
  background-color: #00000011 !important;

  overflow: hidden;
  border-radius: 4px;
}

.InteractiveTerminal-Container .xterm {
  width: 100%;
  height: 100%;
}

.InteractiveTerminal-Container {
  position: absolute;

  padding: 5px;
  box-sizing: border-box;

  width: 200px;
  height: 200px;

  text-align: left;
  // overflow-y: hidden;
}
</style>
