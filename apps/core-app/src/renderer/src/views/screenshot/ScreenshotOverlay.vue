<script setup lang="ts">
import type {
  ScreenshotGeometryPoint,
  ScreenshotGeometryRect,
  ScreenshotResizeHandle
} from '@talex-touch/utils/renderer'
import {
  createScreenshotSelection,
  moveScreenshotSelection,
  nudgeScreenshotSelection,
  projectScreenshotSelection,
  resizeScreenshotSelection,
  setScreenshotSelectionSize,
  snapshotScreenshotSelection
} from '@talex-touch/utils/renderer'
import type {
  ScreenshotOverlayOptions,
  ScreenshotOverlayState
} from '@talex-touch/utils/transport/events/screenshot-session'
import { ScreenshotSessionEvents } from '@talex-touch/utils/transport/events/screenshot-session'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useI18n } from 'vue-i18n'

interface PointerInteraction {
  kind: 'create' | 'move' | 'resize'
  start: ScreenshotGeometryPoint
  original?: ScreenshotGeometryRect
  handle?: ScreenshotResizeHandle
  pointerId: number
}

const HANDLE_NAMES: ScreenshotResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const transport = useTuffTransport()
const { t } = useI18n()
const state = ref<ScreenshotOverlayState | null>(null)
const selection = ref<ScreenshotGeometryRect | null>(null)
const interaction = ref<PointerInteraction | null>(null)
const busy = ref(false)
const errorCode = ref('')
const widthInput = ref('')
const heightInput = ref('')
const pointerLocal = ref<ScreenshotGeometryPoint | null>(null)
let disposeStateListener: (() => void) | null = null
let lastHitTestAt = 0
let suppressEscapeUntil = 0

const displayBounds = computed<ScreenshotGeometryRect | null>(
  () => state.value?.display.bounds ?? null
)
const selectionBounds = computed<ScreenshotGeometryRect | null>(
  () => state.value?.desktopBounds ?? null
)
const localSelection = computed(() => {
  if (!selection.value || !displayBounds.value) return null
  return projectScreenshotSelection(selection.value, displayBounds.value)
})
const selectionStyle = computed(() => {
  const rect = localSelection.value
  if (!rect) return undefined
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
})
const localCandidate = computed(() => {
  if (!state.value?.candidate || !displayBounds.value) return null
  return projectScreenshotSelection(state.value.candidate.bounds, displayBounds.value)
})
const candidateStyle = computed(() => {
  const rect = localCandidate.value
  return rect
    ? {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      }
    : undefined
})
const isObjectMode = computed(() => state.value?.targetMode === 'object')
const isFrozen = computed(() => state.value?.mode === 'frozen')
const safeAreaInsets = computed(
  () => state.value?.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 }
)
const overlayStyle = computed<Record<string, string>>(() => ({
  '--screenshot-safe-top': `${safeAreaInsets.value.top}px`,
  '--screenshot-safe-right': `${safeAreaInsets.value.right}px`,
  '--screenshot-safe-bottom': `${safeAreaInsets.value.bottom}px`,
  '--screenshot-safe-left': `${safeAreaInsets.value.left}px`
}))
const magnifierStyle = computed(() => {
  const point = pointerLocal.value
  const display = displayBounds.value
  const url = state.value?.display.frozenTfileUrl
  if (!point || !display || !url || !isFrozen.value) return undefined
  const safeArea = safeAreaInsets.value
  const minimumLeft = safeArea.left + 8
  const minimumTop = safeArea.top + 8
  const left = Math.min(
    Math.max(minimumLeft, point.x + 18),
    Math.max(minimumLeft, display.width - safeArea.right - 132)
  )
  const top = Math.min(
    Math.max(minimumTop, point.y + 18),
    Math.max(minimumTop, display.height - safeArea.bottom - 102)
  )
  return {
    left: `${left}px`,
    top: `${top}px`,
    backgroundImage: `url(${JSON.stringify(url)})`,
    backgroundSize: `${display.width * 4}px ${display.height * 4}px`,
    backgroundPosition: `${60 - point.x * 4}px ${44 - point.y * 4}px`
  }
})
const optionState = computed(() => state.value?.options)
const hasOutputTarget = computed(() => Boolean(selection.value || state.value?.candidate))

function localToGlobal(event: PointerEvent): ScreenshotGeometryPoint | null {
  const display = displayBounds.value
  if (!display) return null
  if (Number.isFinite(event.screenX) && Number.isFinite(event.screenY)) {
    return { x: event.screenX, y: event.screenY }
  }
  return {
    x: display.x + event.clientX,
    y: display.y + event.clientY
  }
}

function updateInputs(rect: ScreenshotGeometryRect | null): void {
  widthInput.value = rect ? String(Math.round(rect.width)) : ''
  heightInput.value = rect ? String(Math.round(rect.height)) : ''
}

async function dispatchCommand(
  command:
    | { type: 'set-selection'; selection: ScreenshotGeometryRect }
    | { type: 'set-mode'; mode: 'frozen' | 'live' }
    | { type: 'set-target-mode'; targetMode: 'free-region' | 'object' }
    | { type: 'pointer'; point: ScreenshotGeometryPoint }
    | { type: 'set-options'; options: Partial<ScreenshotOverlayOptions> }
    | { type: 'copy' }
    | { type: 'save' }
    | { type: 'confirm' }
    | { type: 'cancel' }
): Promise<boolean> {
  const current = state.value
  if (!current) return false
  try {
    const response = await transport.send(ScreenshotSessionEvents.overlay.command, {
      sessionId: current.sessionId,
      command
    })
    if (!response.accepted) {
      errorCode.value = response.reason ?? 'command-rejected'
      return false
    }
    return true
  } catch {
    errorCode.value = 'transport-failed'
    return false
  }
}

function startCreate(event: PointerEvent): void {
  if (busy.value || isObjectMode.value || event.button !== 0 || !selectionBounds.value) return
  const point = localToGlobal(event)
  if (!point) return
  errorCode.value = ''
  interaction.value = { kind: 'create', start: point, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function startMove(event: PointerEvent): void {
  if (busy.value || event.button !== 0 || !selection.value) return
  const point = localToGlobal(event)
  if (!point) return
  interaction.value = {
    kind: 'move',
    start: point,
    original: { ...selection.value },
    pointerId: event.pointerId
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function startResize(handle: ScreenshotResizeHandle, event: PointerEvent): void {
  if (busy.value || event.button !== 0 || !selection.value) return
  const point = localToGlobal(event)
  if (!point) return
  interaction.value = {
    kind: 'resize',
    handle,
    start: point,
    original: { ...selection.value },
    pointerId: event.pointerId
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function updatePointer(event: PointerEvent): void {
  pointerLocal.value = { x: event.clientX, y: event.clientY }
  const currentInteraction = interaction.value
  const bounds = selectionBounds.value
  const point = localToGlobal(event)
  if (!bounds || !point) return
  if (!currentInteraction) {
    if (isObjectMode.value && performance.now() - lastHitTestAt >= 48) {
      lastHitTestAt = performance.now()
      void dispatchCommand({ type: 'pointer', point })
    }
    return
  }

  if (currentInteraction.kind === 'create') {
    selection.value = createScreenshotSelection(currentInteraction.start, point, bounds, 4)
  } else if (currentInteraction.original) {
    const deltaX = point.x - currentInteraction.start.x
    const deltaY = point.y - currentInteraction.start.y
    selection.value =
      currentInteraction.kind === 'move'
        ? moveScreenshotSelection(currentInteraction.original, deltaX, deltaY, bounds)
        : resizeScreenshotSelection(
            currentInteraction.original,
            currentInteraction.handle ?? 'se',
            deltaX,
            deltaY,
            bounds,
            {
              aspectRatio: optionState.value?.aspectRatio
            }
          )
  }
  updateInputs(selection.value)
}

async function finishPointer(event: PointerEvent): Promise<void> {
  if (!interaction.value) return
  updatePointer(event)
  interaction.value = null
  if (selection.value) {
    await dispatchCommand({
      type: 'set-selection',
      selection: snapshotScreenshotSelection(selection.value)
    })
  }
}

async function setTargetMode(targetMode: 'free-region' | 'object'): Promise<void> {
  if (!state.value || state.value.targetMode === targetMode) return
  if (await dispatchCommand({ type: 'set-target-mode', targetMode })) {
    state.value = { ...state.value, targetMode, candidate: undefined }
  }
}

async function setMode(mode: 'frozen' | 'live'): Promise<void> {
  if (!state.value || state.value.mode === mode) return
  if (await dispatchCommand({ type: 'set-mode', mode })) {
    state.value = { ...state.value, mode }
  }
}

async function setOption(options: Partial<ScreenshotOverlayOptions>): Promise<void> {
  if (!state.value || !(await dispatchCommand({ type: 'set-options', options }))) return
  state.value = {
    ...state.value,
    options: { ...state.value.options, ...options }
  }
}

async function toggleCursor(): Promise<void> {
  const enabled = !optionState.value?.cursor
  if (enabled && isFrozen.value) await setMode('live')
  await setOption({ cursor: enabled })
}

async function applyManualSize(): Promise<void> {
  const bounds = selectionBounds.value
  const current = selection.value
  if (!bounds || !current) return
  const width = Number(widthInput.value)
  const height = Number(heightInput.value)
  const next = setScreenshotSelectionSize(current, width, height, bounds, {
    aspectRatio: optionState.value?.aspectRatio
  })
  selection.value = next
  updateInputs(next)
  await dispatchCommand({ type: 'set-selection', selection: snapshotScreenshotSelection(next) })
}

async function runOutput(action: 'copy' | 'save' | 'confirm'): Promise<void> {
  if (!hasOutputTarget.value || busy.value) return
  busy.value = true
  errorCode.value = ''
  if (action === 'save') suppressEscapeUntil = Number.POSITIVE_INFINITY
  const accepted = await dispatchCommand({ type: action })
  if (action === 'save') suppressEscapeUntil = performance.now() + 300
  if (action !== 'confirm' || !accepted) busy.value = false
}

async function confirm(): Promise<void> {
  await runOutput('confirm')
}

async function cancel(): Promise<void> {
  if (busy.value) return
  busy.value = true
  const accepted = await dispatchCommand({ type: 'cancel' })
  if (!accepted) busy.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (busy.value || performance.now() < suppressEscapeUntil) return
    void cancel()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    void confirm()
    return
  }
  const directions = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
  } as const
  const direction = directions[event.key as keyof typeof directions]
  if (!direction || !selection.value || !selectionBounds.value) return
  event.preventDefault()
  const next = nudgeScreenshotSelection(
    selection.value,
    direction,
    event.shiftKey,
    selectionBounds.value,
    event.altKey ? 10 : 1,
    { aspectRatio: optionState.value?.aspectRatio }
  )
  selection.value = next
  updateInputs(next)
  void dispatchCommand({ type: 'set-selection', selection: snapshotScreenshotSelection(next) })
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  disposeStateListener = transport.on(ScreenshotSessionEvents.overlay.state, (nextState) => {
    if (state.value && nextState.sessionId !== state.value.sessionId) return
    state.value = nextState
    if (!interaction.value) {
      selection.value = nextState.selection ?? null
      updateInputs(selection.value)
    }
  })
  try {
    const initial = await transport.send(ScreenshotSessionEvents.overlay.ready, undefined)
    state.value = initial
    selection.value = initial.selection ?? null
    updateInputs(selection.value)
  } catch {
    errorCode.value = 'overlay-unavailable'
  }
})

onBeforeUnmount(() => {
  disposeStateListener?.()
  disposeStateListener = null
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main
    class="screenshot-overlay"
    :class="{ 'is-live': !isFrozen, 'is-busy': busy }"
    :style="overlayStyle"
    @pointerdown="startCreate"
    @pointermove="updatePointer"
    @pointerup="finishPointer"
    @contextmenu.prevent="cancel"
  >
    <img
      v-if="state?.display.frozenTfileUrl && isFrozen"
      class="frozen-frame"
      :src="state.display.frozenTfileUrl"
      alt=""
      draggable="false"
    />
    <div class="desktop-mask" />

    <section
      v-if="localCandidate && isObjectMode"
      class="object-candidate"
      :style="candidateStyle"
      aria-hidden="true"
    />

    <section
      v-if="localSelection && !isObjectMode"
      class="selection"
      :style="selectionStyle"
      aria-label="Screenshot selection"
      @pointerdown.stop="startMove"
    >
      <span class="selection-size">
        {{ Math.round(selection?.width ?? 0) }} × {{ Math.round(selection?.height ?? 0) }}
      </span>
      <button
        v-for="handle in HANDLE_NAMES"
        :key="handle"
        type="button"
        class="resize-handle"
        :class="`is-${handle}`"
        :aria-label="t('screenshot.overlay.resizeHandle', { handle })"
        @pointerdown.stop="startResize(handle, $event)"
      />
    </section>

    <aside v-if="magnifierStyle" class="magnifier" :style="magnifierStyle" aria-hidden="true">
      <span class="magnifier-cross" />
      <span class="magnifier-coordinate">
        {{ Math.round(pointerLocal?.x ?? 0) }}, {{ Math.round(pointerLocal?.y ?? 0) }}
      </span>
    </aside>

    <div v-if="state" class="mode-switch" role="group" :aria-label="t('screenshot.overlay.mode')">
      <button
        type="button"
        class="icon-button"
        :class="{ active: !isObjectMode }"
        :aria-pressed="!isObjectMode"
        :title="t('screenshot.overlay.freeRegion')"
        @pointerdown.stop
        @click.stop="setTargetMode('free-region')"
      >
        <i class="i-ri-crop-line" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: isObjectMode }"
        :aria-pressed="isObjectMode"
        :title="t('screenshot.overlay.objectSelection')"
        @pointerdown.stop
        @click.stop="setTargetMode('object')"
      >
        <i class="i-ri-layout-line" />
      </button>
      <span class="separator" />
      <button
        type="button"
        class="icon-button"
        :class="{ active: isFrozen }"
        :aria-pressed="isFrozen"
        :title="t('screenshot.overlay.frozen')"
        @pointerdown.stop
        @click.stop="setMode('frozen')"
      >
        <i class="i-ri-image-line" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: !isFrozen }"
        :aria-pressed="!isFrozen"
        :title="t('screenshot.overlay.live')"
        @pointerdown.stop
        @click.stop="setMode('live')"
      >
        <i class="i-ri-live-line" />
      </button>
    </div>

    <footer v-if="state" class="toolbar" @pointerdown.stop>
      <div v-if="!isObjectMode" class="dimension-inputs">
        <label>
          <span>W</span>
          <input v-model="widthInput" inputmode="numeric" @change="applyManualSize" />
        </label>
        <span>×</span>
        <label>
          <span>H</span>
          <input v-model="heightInput" inputmode="numeric" @change="applyManualSize" />
        </label>
      </div>

      <select
        v-if="!isObjectMode"
        :value="optionState?.aspectRatio ?? ''"
        :aria-label="t('screenshot.overlay.aspectRatio')"
        @change="
          setOption({
            aspectRatio: Number(($event.target as HTMLSelectElement).value) || undefined
          })
        "
      >
        <option value="">{{ t('screenshot.overlay.freeRatio') }}</option>
        <option :value="1">1:1</option>
        <option :value="4 / 3">4:3</option>
        <option :value="16 / 9">16:9</option>
      </select>

      <button
        type="button"
        class="icon-button"
        :class="{ active: optionState?.cursor }"
        :aria-pressed="optionState?.cursor"
        :title="t('screenshot.overlay.cursor')"
        @click="toggleCursor"
      >
        <i class="i-ri-cursor-line" />
      </button>
      <label class="radius-control" :title="t('screenshot.overlay.cornerRadius')">
        <i class="i-ri-rounded-corner" />
        <input
          type="range"
          min="0"
          max="64"
          step="2"
          :value="optionState?.cornerRadius ?? 0"
          :aria-label="t('screenshot.overlay.cornerRadius')"
          @input="setOption({ cornerRadius: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <button
        type="button"
        class="icon-button"
        :class="{ active: optionState?.border }"
        :aria-pressed="optionState?.border"
        :title="t('screenshot.overlay.border')"
        @click="setOption({ border: !optionState?.border })"
      >
        <i class="i-ri-shape-line" />
      </button>
      <button
        type="button"
        class="icon-button"
        :class="{ active: optionState?.shadow }"
        :aria-pressed="optionState?.shadow"
        :title="t('screenshot.overlay.shadow')"
        @click="setOption({ shadow: !optionState?.shadow })"
      >
        <i class="i-ri-contrast-drop-2-line" />
      </button>

      <span class="separator" />
      <button
        type="button"
        class="icon-button"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.copy')"
        @click="runOutput('copy')"
      >
        <i class="i-ri-file-copy-line" />
      </button>
      <button
        type="button"
        class="icon-button"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.save')"
        @click="runOutput('save')"
      >
        <i class="i-ri-save-line" />
      </button>
      <span class="separator" />
      <button
        type="button"
        class="icon-button danger"
        :title="t('screenshot.overlay.cancel')"
        @click="cancel"
      >
        <i class="i-ri-close-line" />
      </button>
      <button
        type="button"
        class="icon-button primary"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.done')"
        @click="confirm"
      >
        <i class="i-ri-check-line" />
      </button>
    </footer>

    <output v-if="errorCode" class="error-status" aria-live="polite">
      {{ t(`screenshot.errors.${errorCode}`) }}
    </output>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent !important;
}

.screenshot-overlay {
  --screenshot-primary: var(--tx-color-primary, #409eff);
  --screenshot-primary-dark: var(--tx-color-primary-dark-2, #337ecc);
  position: fixed;
  inset: 0;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  cursor: crosshair;
  color: #f8fafc;
  letter-spacing: 0;
}

.frozen-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

.desktop-mask {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 12, 0.42);
  pointer-events: none;
}

.is-live .desktop-mask {
  background: rgba(8, 10, 12, 0.18);
}

.magnifier {
  position: absolute;
  z-index: 9;
  width: 120px;
  height: 88px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.72);
  border-radius: 4px;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.34);
  pointer-events: none;
}

.magnifier-cross::before,
.magnifier-cross::after {
  position: absolute;
  z-index: 1;
  content: '';
  background: var(--screenshot-primary);
}

.magnifier-cross::before {
  left: 59px;
  top: 34px;
  width: 1px;
  height: 20px;
}

.magnifier-cross::after {
  left: 50px;
  top: 43px;
  width: 20px;
  height: 1px;
}

.magnifier-coordinate {
  position: absolute;
  inset: auto 0 0;
  height: 20px;
  background: rgba(17, 19, 21, 0.9);
  color: #e2e8f0;
  font:
    600 10px/20px ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  text-align: center;
}

.object-candidate {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  border: 2px solid var(--screenshot-primary);
  background: rgba(64, 158, 255, 0.12);
  box-shadow: 0 0 0 1px rgba(51, 126, 204, 0.82);
  pointer-events: none;
}

.selection {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  border: 2px solid var(--screenshot-primary);
  background: transparent;
  box-shadow: 0 0 0 1px rgba(51, 126, 204, 0.78);
  cursor: move;
}

.selection::before {
  position: absolute;
  inset: 0;
  content: '';
  box-shadow: 0 0 0 9999px rgba(8, 10, 12, 0.5);
  pointer-events: none;
}

.selection-size {
  position: absolute;
  left: 0;
  bottom: -28px;
  min-width: 74px;
  height: 22px;
  padding: 0 7px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 4px;
  background: rgba(17, 19, 21, 0.94);
  color: #e2e8f0;
  font:
    600 11px/20px ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  padding: 0;
  border: 1px solid var(--screenshot-primary-dark);
  border-radius: 2px;
  background: #f8fafc;
  transform: translate(-50%, -50%);
}

.is-n {
  left: 50%;
  top: 0;
  cursor: ns-resize;
}
.is-ne {
  left: 100%;
  top: 0;
  cursor: nesw-resize;
}
.is-e {
  left: 100%;
  top: 50%;
  cursor: ew-resize;
}
.is-se {
  left: 100%;
  top: 100%;
  cursor: nwse-resize;
}
.is-s {
  left: 50%;
  top: 100%;
  cursor: ns-resize;
}
.is-sw {
  left: 0;
  top: 100%;
  cursor: nesw-resize;
}
.is-w {
  left: 0;
  top: 50%;
  cursor: ew-resize;
}
.is-nw {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}

.mode-switch,
.toolbar {
  z-index: 10;
  display: flex;
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 6px;
  background: rgba(17, 19, 21, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
}

.mode-switch {
  position: absolute;
  top: calc(var(--screenshot-safe-top, 0px) + 18px);
  right: var(--screenshot-safe-right, 0px);
  left: var(--screenshot-safe-left, 0px);
  width: max-content;
  height: 36px;
  margin-inline: auto;
  padding: 3px;
}

.toolbar {
  position: absolute;
  right: var(--screenshot-safe-right, 0px);
  bottom: calc(var(--screenshot-safe-bottom, 0px) + 24px);
  left: var(--screenshot-safe-left, 0px);
  width: max-content;
  min-height: 44px;
  max-width: calc(
    100vw - var(--screenshot-safe-left, 0px) - var(--screenshot-safe-right, 0px) - 32px
  );
  margin-inline: auto;
  padding: 5px 7px;
  gap: 4px;
}

.icon-button {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #cbd5e1;
  font-size: 17px;
  cursor: pointer;
}

.icon-button:hover,
.icon-button:focus-visible {
  border-color: rgba(148, 163, 184, 0.36);
  background: rgba(71, 85, 105, 0.46);
  outline: none;
}

.icon-button.active {
  border-color: rgba(64, 158, 255, 0.56);
  background: rgba(51, 126, 204, 0.42);
  color: #d9ecff;
}

.icon-button.primary {
  background: var(--screenshot-primary-dark);
  color: #fff;
}

.icon-button.danger {
  color: #fca5a5;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.radius-control {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 76px;
  height: 30px;
  padding: 0 5px;
  color: #94a3b8;
}

.radius-control input {
  width: 50px;
  accent-color: var(--screenshot-primary);
}

.dimension-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dimension-inputs label {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 30px;
  padding: 0 5px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 4px;
  color: #94a3b8;
  font-size: 10px;
}

.dimension-inputs input {
  width: 48px;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f8fafc;
  font:
    600 11px/1 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
}

.toolbar select {
  height: 30px;
  min-width: 64px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 4px;
  background: #1f2428;
  color: #e2e8f0;
  font-size: 11px;
}

.separator {
  width: 1px;
  height: 24px;
  margin: 0 3px;
  background: rgba(148, 163, 184, 0.2);
}

.error-status {
  position: absolute;
  z-index: 12;
  top: calc(var(--screenshot-safe-top, 0px) + 64px);
  left: 50%;
  max-width: calc(100vw - 32px);
  padding: 6px 9px;
  border: 1px solid rgba(248, 113, 113, 0.42);
  border-radius: 4px;
  background: rgba(69, 10, 10, 0.92);
  color: #fecaca;
  font-size: 11px;
  transform: translateX(-50%);
}

.is-busy {
  cursor: progress;
}
</style>
