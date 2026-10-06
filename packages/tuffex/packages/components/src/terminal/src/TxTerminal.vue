<script setup lang="ts">
import type { FitAddon } from '@xterm/addon-fit'
import type { IDisposable, ITheme, Terminal as XtermTerminal } from '@xterm/xterm'
import type { TerminalData, TerminalEmits, TerminalInstance, TerminalProps, TerminalSize } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onThemeChange } from '../../stat-card/src/theme-change'
import { TERMINAL_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxTerminal' })

const props = withDefaults(defineProps<TerminalProps>(), {
  readOnly: false,
  autoFocus: false,
  autoScroll: true,
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
})
const emit = defineEmits<TerminalEmits>()
const hostRef = ref<HTMLDivElement | null>(null)
const ariaLabel = computed(() => props.labels?.ariaLabel ?? TERMINAL_DEFAULT_LABELS.ariaLabel)

interface WriteOperation {
  kind: 'write'
  data: TerminalData
  newline: boolean
  resolve?: () => void
  reject?: (error: Error) => void
}
type Operation = WriteOperation | { kind: 'clear' | 'reset' }

let terminal: XtermTerminal | null = null
let fitAddon: FitAddon | null = null
let disposed = false
let failure: Error | null = null
let frame = 0
let resizeObserver: ResizeObserver | null = null
let unsubscribeTheme: (() => void) | null = null
let colorProbe: HTMLSpanElement | null = null
let lastSize: TerminalSize | null = null
let currentWrite: WriteOperation | null = null
let lineSnapshot: TerminalData[] = []
const subscriptions: IDisposable[] = []
const queue: Operation[] = []
let queueOffset = 0
const pending = new Set<WriteOperation>()

function errorFrom(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

function settlePending(error: Error): void {
  for (const operation of pending)
    operation.reject?.(error)
  pending.clear()
  queue.length = 0
  queueOffset = 0
  currentWrite = null
}

// Only one parse is outstanding, so reset/clear can never overtake a write.
function pump(): void {
  const target = terminal
  if (!target || disposed || failure || currentWrite)
    return

  while (queueOffset < queue.length) {
    const operation = queue[queueOffset++]!
    if (queueOffset === queue.length) {
      queue.length = 0
      queueOffset = 0
    }
    try {
      if (operation.kind !== 'write') {
        target[operation.kind]()
        continue
      }

      currentWrite = operation
      const viewport = target.buffer.active.viewportY
      const complete = () => {
        if (disposed || failure || currentWrite !== operation)
          return
        try {
          if (props.autoScroll)
            target.scrollToBottom()
          else
            target.scrollToLine(viewport)
        }
        catch (reason) {
          failure = errorFrom(reason)
          settlePending(failure)
          releaseResources()
          return
        }
        currentWrite = null
        pending.delete(operation)
        operation.resolve?.()
        // Some hosts/test doubles parse synchronously; do not recurse per line.
        queueMicrotask(pump)
      }
      if (operation.newline)
        target.writeln(operation.data, complete)
      else
        target.write(operation.data, complete)
      return
    }
    catch (reason) {
      failure = errorFrom(reason)
      settlePending(failure)
      releaseResources()
      return
    }
  }
}

function enqueueWrite(data: TerminalData, newline: boolean): Promise<void> {
  if (disposed || failure)
    return Promise.reject(failure ?? new Error('TxTerminal has been disposed'))
  return new Promise<void>((resolve, reject) => {
    const operation: WriteOperation = { kind: 'write', data, newline, resolve, reject }
    pending.add(operation)
    queue.push(operation)
    pump()
  })
}

function enqueueControl(kind: 'clear' | 'reset'): void {
  if (disposed || failure)
    return
  queue.push({ kind })
  pump()
}

function getSize(): TerminalSize | null {
  return terminal && !disposed && !failure ? { cols: terminal.cols, rows: terminal.rows } : null
}

function emitSize(size: TerminalSize): void {
  if (lastSize?.cols === size.cols && lastSize.rows === size.rows)
    return
  lastSize = size
  emit('resize', size)
}

function dimension(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined
}

function fit(): TerminalSize | null {
  const host = hostRef.value
  if (!terminal || !fitAddon || !host || disposed || failure)
    return null
  // Hidden tabs have no usable cell geometry; retain the previous PTY size.
  const bounds = host.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0)
    return getSize()
  const proposed = fitAddon.proposeDimensions()
  const cols = dimension(props.cols) ?? dimension(proposed?.cols) ?? terminal.cols
  const rows = dimension(props.rows) ?? dimension(proposed?.rows) ?? terminal.rows
  if (terminal.cols !== cols || terminal.rows !== rows)
    terminal.resize(cols, rows)
  const size = { cols, rows }
  emitSize(size)
  return size
}

function scheduleFit(): void {
  if (disposed || failure || frame)
    return
  frame = requestAnimationFrame(() => {
    frame = 0
    fit()
  })
}

function readColor(token: string, fallback: string): string {
  if (!colorProbe)
    return fallback
  colorProbe.style.color = `var(${token}, ${fallback})`
  return getComputedStyle(colorProbe).color || fallback
}

function hostTheme(): ITheme {
  // The host stylesheet owns standalone defaults; do not clone its palette here.
  const hostStyle = getComputedStyle(hostRef.value!)
  const foreground = hostStyle.color
  const background = hostStyle.backgroundColor
  const primary = readColor('--tx-color-primary', foreground)
  const success = readColor('--tx-color-success', foreground)
  const warning = readColor('--tx-color-warning', foreground)
  const danger = readColor('--tx-color-danger', foreground)
  const muted = readColor('--tx-text-color-secondary', foreground)
  return {
    foreground,
    background,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: primary.replace(/^rgb\((.+)\)$/, 'rgba($1, 0.3)'),
    black: foreground,
    red: danger,
    green: success,
    yellow: warning,
    blue: primary,
    magenta: danger,
    cyan: primary,
    white: muted,
    brightBlack: muted,
    brightRed: danger,
    brightGreen: success,
    brightYellow: warning,
    brightBlue: primary,
    brightMagenta: danger,
    brightCyan: primary,
    brightWhite: foreground,
    ...props.theme,
  }
}

function updateTheme(): void {
  if (terminal)
    terminal.options.theme = hostTheme()
}

function updateLabel(): void {
  terminal?.textarea?.setAttribute('aria-label', ariaLabel.value)
  terminal?.textarea?.setAttribute('aria-readonly', String(props.readOnly))
}

function focus(): void {
  if (!props.readOnly && !disposed && !failure)
    terminal?.focus()
}

function sameLine(left: TerminalData, right: TerminalData): boolean {
  if (typeof left === 'string' || typeof right === 'string')
    return left === right
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function syncLines(lines: readonly TerminalData[] | undefined): void {
  const next = lines ?? []
  const append = next.length >= lineSnapshot.length
    && lineSnapshot.every((line, index) => sameLine(line, next[index]!))
  const start = append ? lineSnapshot.length : 0
  if (!append)
    queue.push({ kind: 'reset' })
  // Snapshot binary records before queuing; callers can mutate the source array.
  lineSnapshot = next.map(line => typeof line === 'string' ? line : line.slice())
  for (let index = start; index < lineSnapshot.length; index++)
    queue.push({ kind: 'write', data: lineSnapshot[index]!, newline: true })
  pump()
}

const instance: TerminalInstance = {
  write: data => enqueueWrite(data, false),
  writeln: data => enqueueWrite(data, true),
  clear: () => enqueueControl('clear'),
  reset: () => enqueueControl('reset'),
  focus,
  fit,
  getSize,
}
defineExpose(instance)

watch(() => props.lines, syncLines, { deep: true, immediate: true, flush: 'sync' })
watch(() => props.theme, updateTheme, { deep: true })
watch(ariaLabel, updateLabel)
watch(() => props.readOnly, (value) => {
  if (!terminal)
    return
  terminal.options.disableStdin = value
  terminal.options.cursorBlink = !value
  terminal.options.cursorInactiveStyle = value ? 'none' : 'outline'
  updateLabel()
  if (value)
    terminal.blur()
})
watch(() => props.autoFocus, (value) => {
  if (value)
    focus()
})
watch(() => props.autoScroll, (value) => {
  if (terminal) {
    terminal.options.scrollOnUserInput = value
    if (value)
      terminal.scrollToBottom()
  }
})
watch(() => [props.cols, props.rows, props.fontSize, props.fontFamily], () => {
  if (terminal) {
    terminal.options.fontSize = props.fontSize
    terminal.options.fontFamily = props.fontFamily
    scheduleFit()
  }
})

function releaseResources(): void {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', scheduleFit)
  unsubscribeTheme?.()
  unsubscribeTheme = null
  for (const subscription of subscriptions)
    subscription.dispose()
  subscriptions.length = 0
  // The terminal owns loaded addons and disposes them exactly once.
  terminal?.dispose()
  terminal = null
  fitAddon = null
  colorProbe?.remove()
  colorProbe = null
}

onMounted(async () => {
  try {
    const [{ Terminal }, { FitAddon: Addon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ])
    const host = hostRef.value
    if (disposed)
      return
    if (!host)
      throw new Error('TxTerminal host is unavailable')
    colorProbe = document.createElement('span')
    colorProbe.hidden = true
    colorProbe.setAttribute('aria-hidden', 'true')
    host.append(colorProbe)
    terminal = new Terminal({
      cols: dimension(props.cols) ?? 80,
      rows: dimension(props.rows) ?? 24,
      fontSize: props.fontSize,
      fontFamily: props.fontFamily,
      theme: hostTheme(),
      disableStdin: props.readOnly,
      cursorBlink: !props.readOnly,
      cursorInactiveStyle: props.readOnly ? 'none' : 'outline',
      scrollOnUserInput: props.autoScroll,
      screenReaderMode: true,
      minimumContrastRatio: 4.5,
    })
    fitAddon = new Addon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    updateLabel()
    subscriptions.push(
      terminal.onData((data) => {
        if (!props.readOnly && !disposed)
          emit('data', data)
      }),
      terminal.onResize(emitSize),
    )
    unsubscribeTheme = onThemeChange(updateTheme)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleFit)
      resizeObserver.observe(host)
    }
    else {
      window.addEventListener('resize', scheduleFit)
    }
    fit()
    document.fonts?.ready.then(() => {
      if (!disposed && !failure)
        scheduleFit()
    })
    pump()
    if (failure)
      throw failure
    emit('ready', instance)
    if (props.autoFocus)
      focus()
  }
  catch (reason) {
    failure = errorFrom(reason)
    settlePending(failure)
    releaseResources()
    // Report real initialization failures through Vue's lifecycle error boundary.
    throw failure
  }
})

onBeforeUnmount(() => {
  disposed = true
  settlePending(new Error('TxTerminal has been disposed'))
  releaseResources()
})
</script>

<template>
  <div
    ref="hostRef"
    class="tx-terminal"
    :class="{ 'is-readonly': readOnly }"
    :aria-label="ariaLabel"
    role="region"
  />
</template>

<style src="@xterm/xterm/css/xterm.css"></style>

<style lang="scss" scoped>
.tx-terminal {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 160px;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 8px;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    border-radius: 4px;
  }
}
</style>
