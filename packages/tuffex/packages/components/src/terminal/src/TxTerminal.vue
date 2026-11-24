<script setup lang="ts">
import type { FitAddon } from '@xterm/addon-fit'
import type { ImageAddon } from '@xterm/addon-image'
import type { WebglAddon } from '@xterm/addon-webgl'
import type { IDisposable, ITheme, Terminal as XtermTerminal } from '@xterm/xterm'
import type { TerminalData, TerminalEmits, TerminalInstance, TerminalProps, TerminalSize } from './types'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onThemeChange } from '../../stat-card/src/theme-change'
import { TERMINAL_DEFAULT_LABELS } from './types'
import { DEFAULT_TERMINAL_FONT_FAMILY, resolveTerminalFontFamily } from './font-fallback'
import { configureHiDpiImageAddon } from './image-hidpi'

defineOptions({ name: 'TxTerminal' })

const props = withDefaults(defineProps<TerminalProps>(), {
  readOnly: false,
  autoFocus: false,
  autoScroll: true,
  fontSize: 13,
  fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  screenReaderMode: true,
})
const emit = defineEmits<TerminalEmits>()
const hostRef = ref<HTMLDivElement | null>(null)
// xterm opens here rather than on the host. FitAddon sizes the grid from the box of
// .xterm's parent, and the host's box includes its padding, which put the last row
// and the rightmost columns out of view.
const bodyRef = ref<HTMLDivElement | null>(null)
const ariaLabel = computed(() => props.labels?.ariaLabel ?? TERMINAL_DEFAULT_LABELS.ariaLabel)

interface WriteOperation {
  kind: 'write'
  data: TerminalData
  newline: boolean
  resolve?: () => void
  reject?: (error: Error) => void
}
type Operation = WriteOperation | { kind: 'clear' | 'reset' }

// xterm throws away writes once 50 MB are waiting to be parsed, so a flood waits
// in this queue instead.
const MAX_PARSING_LENGTH = 8 * 1024 * 1024

// xterm 6 sends Alt+arrows as ESC [1;3x, which shells leave unbound. These are the
// word-motion keys xterm 5 sent instead: Meta-b/f on macOS, Ctrl+arrows elsewhere.
const ALT_ARROWS_MAC: Record<string, string> = { ArrowLeft: '\u001Bb', ArrowRight: '\u001Bf' }
const ALT_ARROWS: Record<string, string> = {
  ArrowLeft: '\u001B[1;5D',
  ArrowRight: '\u001B[1;5C',
  ArrowUp: '\u001B[1;5A',
  ArrowDown: '\u001B[1;5B',
}

let terminal: XtermTerminal | null = null
let fitAddon: FitAddon | null = null
let imageAddon: ImageAddon | null = null
// Null once the renderer chunk failed to load or WebGL2 proved unavailable.
let Webgl: typeof WebglAddon | null = null
let webglAddon: WebglAddon | null = null
let webglContext: WebGL2RenderingContext | null = null
// Set by a context loss and cleared when the terminal is hidden, so it retries
// the next time it is shown.
let webglLost = false
let disposed = false
let failure: Error | null = null
let frame = 0
let resizeObserver: ResizeObserver | null = null
let unsubscribeTheme: (() => void) | null = null
let colorProbe: HTMLSpanElement | null = null
let lastSize: TerminalSize | null = null
// Writes handed to xterm whose parse has not completed yet.
let parsing = 0
let parsingLength = 0
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
  parsing = 0
  parsingLength = 0
}

function submit(target: XtermTerminal, operation: WriteOperation): void {
  const length = (typeof operation.data === 'string' ? operation.data.length : operation.data.byteLength)
    + (operation.newline ? 2 : 0)
  const viewport = target.buffer.active.viewportY
  const complete = () => {
    if (disposed || failure)
      return
    parsing--
    parsingLength -= length
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
    pending.delete(operation)
    operation.resolve?.()
    // Some hosts/test doubles parse synchronously; do not recurse per write.
    if (queueOffset < queue.length)
      queueMicrotask(pump)
  }
  parsing++
  parsingLength += length
  if (operation.newline)
    target.writeln(operation.data, complete)
  else
    target.write(operation.data, complete)
}

// Writes go to xterm as they arrive, so its write buffer batches the parse
// across frames. reset and clear act at once, so they wait until every earlier
// write has been parsed.
function pump(): void {
  const target = terminal
  if (!target || disposed || failure)
    return

  while (queueOffset < queue.length) {
    const operation = queue[queueOffset]!
    if (parsing && (operation.kind !== 'write' || parsingLength >= MAX_PARSING_LENGTH))
      return
    queueOffset++
    if (queueOffset === queue.length) {
      queue.length = 0
      queueOffset = 0
    }
    try {
      if (operation.kind === 'write')
        submit(target, operation)
      else
        target[operation.kind]()
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
    syncRenderer()
    fit()
  })
}

// An undefined palette entry keeps xterm's default color for that slot.
function readColor(token: string): string | undefined {
  if (!colorProbe)
    return undefined
  const style = getComputedStyle(colorProbe)
  if (!style.getPropertyValue(token).trim())
    return undefined
  colorProbe.style.color = `var(${token})`
  return style.color
}

function parseColorChannels(color: string): [number, number, number, number] | null {
  const trimmed = color.trim()
  if (!trimmed || trimmed === 'transparent')
    return [0, 0, 0, 0]
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)
  if (hex) {
    const raw = hex[1]!
    if (raw.length === 3) {
      return [
        Number.parseInt(raw[0]! + raw[0]!, 16),
        Number.parseInt(raw[1]! + raw[1]!, 16),
        Number.parseInt(raw[2]! + raw[2]!, 16),
        1,
      ]
    }
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
      1,
    ]
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(trimmed)
  if (!rgb)
    return null
  const alphaRaw = rgb[4]
  const alpha = alphaRaw === undefined
    ? 1
    : alphaRaw.endsWith('%')
      ? Number.parseFloat(alphaRaw) / 100
      : Number.parseFloat(alphaRaw)
  return [
    Number.parseFloat(rgb[1]!),
    Number.parseFloat(rgb[2]!),
    Number.parseFloat(rgb[3]!),
    Number.isFinite(alpha) ? alpha : 1,
  ]
}

function withAlpha(color: string, alpha: number): string {
  const channels = parseColorChannels(color)
  if (!channels)
    return color
  return `rgba(${Math.round(channels[0])}, ${Math.round(channels[1])}, ${Math.round(channels[2])}, ${alpha})`
}

function resolveOpaqueBackground(element: HTMLElement): string {
  let current: HTMLElement | null = element
  let fallback = ''
  while (current) {
    const bg = getComputedStyle(current).backgroundColor
    if (!fallback && bg)
      fallback = bg
    const channels = parseColorChannels(bg)
    if (channels && channels[3] > 0)
      return bg
    current = current.parentElement
  }
  return fallback
}

function isDarkSurface(background: string): boolean {
  const channels = parseColorChannels(background)
  if (!channels || channels[3] <= 0) {
    return typeof document !== 'undefined'
      && (document.documentElement.classList.contains('dark')
        || document.documentElement.dataset.theme === 'dark')
  }
  const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255
  return luminance < 0.5
}

function hostTheme(): ITheme {
  // The host stylesheet owns standalone defaults; do not clone its palette here.
  const host = hostRef.value!
  const hostStyle = getComputedStyle(host)
  const foreground = hostStyle.color
  const background = resolveOpaqueBackground(host)
  const dark = isDarkSurface(background)
  const primary = readColor('--tx-color-primary')
  const success = readColor('--tx-color-success')
  const warning = readColor('--tx-color-warning')
  const danger = readColor('--tx-color-danger')
  const muted = readColor('--tx-text-color-secondary')
  const palette: ITheme = dark
    ? {
        black: '#27272a',
        red: danger ?? '#f16c68',
        green: success ?? '#4ec98b',
        yellow: warning ?? '#e5b554',
        blue: primary ?? '#5ca4f2',
        magenta: '#c678dd',
        cyan: '#4ec9d4',
        white: '#d4d4d8',
        brightBlack: muted ?? '#71717a',
        brightRed: '#ff8a84',
        brightGreen: '#6ee0a5',
        brightYellow: '#f5cd73',
        brightBlue: '#82bdff',
        brightMagenta: '#dba0f0',
        brightCyan: '#76dfe8',
        brightWhite: foreground,
      }
    : {
        black: '#1d1d1f',
        red: danger ?? '#c4342b',
        green: success ?? '#26794e',
        yellow: warning ?? '#946210',
        blue: primary ?? '#2b7fd9',
        magenta: '#9b3fb5',
        cyan: '#0f7b8a',
        white: '#e4e4e7',
        brightBlack: muted ?? '#6e6e73',
        brightRed: '#e04c42',
        brightGreen: '#349462',
        brightYellow: '#b87a14',
        brightBlue: '#4796eb',
        brightMagenta: '#b459cf',
        brightCyan: '#1796a8',
        brightWhite: '#f5f5f7',
      }
  return {
    foreground,
    background,
    cursor: foreground,
    cursorAccent: background,
    // xterm's default selection is translucent white, invisible on a light host.
    selectionBackground: withAlpha(primary ?? foreground, dark ? 0.3 : 0.22),
    scrollbarSliderBackground: withAlpha(foreground, 0.14),
    scrollbarSliderHoverBackground: withAlpha(foreground, 0.28),
    scrollbarSliderActiveBackground: withAlpha(foreground, 0.42),
    ...palette,
    ...props.theme,
  }
}

function paintBackground(theme: ITheme): void {
  // xterm 6 leaves the space around the cell grid to .xterm-viewport, which its
  // stylesheet paints black.
  if (terminal?.element)
    terminal.element.style.backgroundColor = theme.background ?? ''
}

function updateTheme(): void {
  if (!terminal)
    return
  const theme = hostTheme()
  terminal.options.theme = theme
  paintBackground(theme)
}

function handleKey(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown' || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing)
    return true
  const sequence = (/^Mac/.test(navigator.platform) ? ALT_ARROWS_MAC : ALT_ARROWS)[event.key]
  if (!sequence || !terminal)
    return true
  event.preventDefault()
  event.stopPropagation()
  // Goes through xterm's input path, so read-only and scrollOnUserInput still apply.
  terminal.input(sequence)
  return false
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
  // A run of text records becomes one write, so replaying a long log is one parse.
  let text = ''
  for (let index = start; index < lineSnapshot.length; index++) {
    const line = lineSnapshot[index]!
    if (typeof line === 'string') {
      text += `${line}\r\n`
      continue
    }
    if (text)
      queue.push({ kind: 'write', data: text, newline: false })
    text = ''
    queue.push({ kind: 'write', data: line, newline: true })
  }
  if (text)
    queue.push({ kind: 'write', data: text, newline: false })
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
watch(() => props.screenReaderMode, (value) => {
  if (terminal)
    terminal.options.screenReaderMode = value
})
watch(() => [props.cols, props.rows, props.fontSize, props.fontFamily], () => {
  if (terminal) {
    terminal.options.fontSize = props.fontSize
    terminal.options.fontFamily = resolveTerminalFontFamily(props.fontFamily)
    scheduleFit()
  }
})

function webglContextOf(target: XtermTerminal): WebGL2RenderingContext | null {
  // Every other canvas xterm adds already holds a 2D context, so this cannot create one.
  for (const canvas of target.element?.querySelectorAll('canvas') ?? []) {
    const context = canvas.getContext('webgl2')
    if (context)
      return context
  }
  return null
}

// WebGL redraws a TUI with about a third of the DOM renderer's main-thread time.
// Disposing the addon hands drawing back to xterm's DOM renderer.
function loadWebgl(target: XtermTerminal, Addon: typeof WebglAddon): void {
  let addon: WebglAddon | null = null
  try {
    addon = new Addon()
    target.loadAddon(addon)
  }
  catch {
    addon?.dispose()
    Webgl = null
    return
  }
  const loaded = addon
  webglAddon = loaded
  webglContext = webglContextOf(target)
  // The host's listener normally acts first; this is the addon's own report, 3 s later.
  loaded.onContextLoss(() => {
    if (webglAddon === loaded)
      handleContextLost()
  })
}

function releaseWebgl(): void {
  const addon = webglAddon
  const context = webglContext
  webglAddon = null
  webglContext = null
  addon?.dispose()
  // A disposed addon's context lives on until its canvas is collected, and counts
  // toward the browser's context limit until then.
  context?.getExtension('WEBGL_lose_context')?.loseContext()
}

// The addon waits 3 s for a restore that an evicted context never gets, with the
// screen blank meanwhile. This capture listener runs before the addon's own, and
// disposing the addon removes that one, so the DOM renderer draws at once.
function handleContextLost(): void {
  if (!webglAddon)
    return
  webglLost = true
  releaseWebgl()
}

// Chromium keeps about 16 WebGL contexts per renderer process and drops the oldest
// beyond that, so only a terminal on screen holds one.
function syncRenderer(): void {
  const target = terminal
  const bounds = hostRef.value?.getBoundingClientRect()
  if (!target || !bounds || disposed || failure)
    return
  if (bounds.width <= 0 || bounds.height <= 0) {
    webglLost = false
    releaseWebgl()
  }
  else if (Webgl && !webglAddon && !webglLost) {
    loadWebgl(target, Webgl)
  }
}

function releaseResources(): void {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', scheduleFit)
  hostRef.value?.removeEventListener('webglcontextlost', handleContextLost, true)
  unsubscribeTheme?.()
  unsubscribeTheme = null
  for (const subscription of subscriptions)
    subscription.dispose()
  subscriptions.length = 0
  // The terminal owns loaded addons and disposes them exactly once.
  terminal?.dispose()
  webglContext?.getExtension('WEBGL_lose_context')?.loseContext()
  terminal = null
  fitAddon = null
  imageAddon = null
  webglAddon = null
  webglContext = null
  colorProbe?.remove()
  colorProbe = null
}

onMounted(async () => {
  try {
    const [{ Terminal }, { FitAddon: Addon }, webgl, image] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      // A renderer chunk that fails to load leaves the DOM renderer drawing.
      import('@xterm/addon-webgl').catch(() => null),
      // Inline image protocols (SIXEL + iTerm2 IIP); optional so load failure never blocks text.
      import('@xterm/addon-image').catch(() => null),
    ])
    const host = hostRef.value
    const body = bodyRef.value
    if (disposed)
      return
    if (!host || !body)
      throw new Error('TxTerminal host is unavailable')
    colorProbe = document.createElement('span')
    colorProbe.hidden = true
    colorProbe.setAttribute('aria-hidden', 'true')
    host.append(colorProbe)
    const theme = hostTheme()
    terminal = new Terminal({
      cols: dimension(props.cols) ?? 80,
      rows: dimension(props.rows) ?? 24,
      fontSize: props.fontSize,
      fontFamily: resolveTerminalFontFamily(props.fontFamily),
      theme,
      disableStdin: props.readOnly,
      cursorBlink: !props.readOnly,
      cursorInactiveStyle: props.readOnly ? 'none' : 'outline',
      scrollOnUserInput: props.autoScroll,
      screenReaderMode: props.screenReaderMode,
      rescaleOverlappingGlyphs: true,
      minimumContrastRatio: 4.5,
    })
    terminal.attachCustomKeyEventHandler(handleKey)
    fitAddon = new Addon()
    terminal.loadAddon(fitAddon)
    terminal.open(body)
    paintBackground(theme)
    if (image?.ImageAddon) {
      try {
        imageAddon = new image.ImageAddon({
          enableSizeReports: true,
          sixelSupport: true,
          iipSupport: true,
          sixelScrolling: true,
          sixelPaletteLimit: 1024,
          storageLimit: 64,
          showPlaceholder: false,
        })
        terminal.loadAddon(imageAddon)
        subscriptions.push(
          configureHiDpiImageAddon(terminal, imageAddon, {
            advertiseIip: true,
          }),
        )
      }
      catch {
        imageAddon?.dispose()
        imageAddon = null
      }
    }
    host.addEventListener('webglcontextlost', handleContextLost, true)
    Webgl = webgl?.WebglAddon ?? null
    syncRenderer()
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
      if (disposed || failure)
        return
      // Glyphs drawn before a web font arrived are cached in the WebGL atlas.
      webglAddon?.clearTextureAtlas()
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
  >
    <div ref="bodyRef" class="tx-terminal__body" />
  </div>
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

  &__body {
    height: 100%;
  }

  :deep(.xterm) {
    height: 100%;
    border-radius: 4px;
  }

  // The .xterm element carries the theme background instead.
  :deep(.xterm-viewport) {
    background-color: transparent;
  }

  // Inline image overlay sits above the text/WebGL layer and must never trap pointer events.
  :deep(.xterm-image-layer) {
    pointer-events: none;
  }

  // Keep xterm 6's scrollbar hit target aligned with FitAddon while painting a slim pill thumb.
  :deep(.xterm-scrollable-element > .scrollbar.vertical > .slider) {
    left: auto !important;
    right: 2px !important;
    width: 6px !important;
    border-radius: 999px;
  }
}
</style>
