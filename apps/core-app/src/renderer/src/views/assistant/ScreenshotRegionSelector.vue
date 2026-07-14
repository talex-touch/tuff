<script lang="ts" setup name="ScreenshotRegionSelector">
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { NativeScreenshotRegion } from '@talex-touch/utils/transport/events/types'
import { useI18n } from 'vue-i18n'

interface SelectionPoint {
  x: number
  y: number
}

const MIN_SELECTION_SIZE = 4
const transport = useTuffTransport()
const { t } = useI18n()
const startPoint = ref<SelectionPoint | null>(null)
const endPoint = ref<SelectionPoint | null>(null)
const dragging = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

const selection = computed<NativeScreenshotRegion | null>(() => {
  if (!startPoint.value || !endPoint.value) return null

  const x = Math.min(startPoint.value.x, endPoint.value.x)
  const y = Math.min(startPoint.value.y, endPoint.value.y)
  return {
    x,
    y,
    width: Math.abs(endPoint.value.x - startPoint.value.x),
    height: Math.abs(endPoint.value.y - startPoint.value.y)
  }
})

const selectionStyle = computed(() => {
  const region = selection.value
  if (!region) return undefined
  return {
    left: `${region.x}px`,
    top: `${region.y}px`,
    width: `${region.width}px`,
    height: `${region.height}px`
  }
})

function toSelectionPoint(event: PointerEvent): SelectionPoint {
  return {
    x: Math.max(0, Math.min(window.innerWidth, Math.round(event.clientX))),
    y: Math.max(0, Math.min(window.innerHeight, Math.round(event.clientY)))
  }
}

function resetSelection(): void {
  startPoint.value = null
  endPoint.value = null
  dragging.value = false
}

function startSelection(event: PointerEvent): void {
  if (submitting.value || event.button !== 0) return
  errorMessage.value = ''
  const point = toSelectionPoint(event)
  startPoint.value = point
  endPoint.value = point
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function updateSelection(event: PointerEvent): void {
  if (!dragging.value || submitting.value) return
  endPoint.value = toSelectionPoint(event)
}

async function finishSelection(event: PointerEvent): Promise<void> {
  if (!dragging.value || submitting.value) return
  endPoint.value = toSelectionPoint(event)
  dragging.value = false

  const region = selection.value
  if (!region || region.width < MIN_SELECTION_SIZE || region.height < MIN_SELECTION_SIZE) {
    resetSelection()
    return
  }

  submitting.value = true
  try {
    const result = await transport.send(AssistantEvents.regionSelection.submit, region)
    if (!result?.accepted) {
      errorMessage.value = t('assistant.regionSelector.submitFailed')
      submitting.value = false
    }
  } catch {
    errorMessage.value = t('assistant.regionSelector.submitFailed')
    submitting.value = false
  }
}

async function cancelSelection(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    const result = await transport.send(AssistantEvents.regionSelection.cancel, undefined)
    if (!result?.accepted) {
      errorMessage.value = t('assistant.regionSelector.cancelFailed')
      submitting.value = false
    }
  } catch {
    errorMessage.value = t('assistant.regionSelector.cancelFailed')
    submitting.value = false
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  void cancelSelection()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main
    class="region-selector"
    :class="{ 'has-selection': selection, 'is-submitting': submitting }"
    @pointerdown="startSelection"
    @pointermove="updateSelection"
    @pointerup="finishSelection"
    @contextmenu.prevent="cancelSelection"
  >
    <div v-if="selection" class="selection-rectangle" :style="selectionStyle">
      <span class="selection-size">{{ selection.width }} × {{ selection.height }}</span>
    </div>

    <div class="selector-instructions" aria-live="polite">
      <strong>{{ t('assistant.regionSelector.title') }}</strong>
      <span>{{ t('assistant.regionSelector.hint') }}</span>
      <span v-if="errorMessage" class="selector-error">{{ errorMessage }}</span>
    </div>

    <button
      class="selector-cancel"
      type="button"
      :disabled="submitting"
      @pointerdown.stop
      @click.stop="cancelSelection"
    >
      {{ t('assistant.regionSelector.cancel') }}
    </button>
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

.region-selector {
  position: fixed;
  inset: 0;
  overflow: hidden;
  cursor: crosshair;
  user-select: none;
  touch-action: none;
  background: rgba(15, 23, 42, 0.3);
}

.region-selector.has-selection {
  background: transparent;
}

.region-selector.is-submitting {
  cursor: progress;
}

.selection-rectangle {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #fb923c;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.5);
  pointer-events: none;
}

.selection-size {
  position: absolute;
  right: 0;
  bottom: -28px;
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(67, 20, 7, 0.92);
  color: #ffedd5;
  font:
    600 11px/1.2 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: nowrap;
}

.selector-instructions {
  position: absolute;
  top: 24px;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: min(420px, calc(100vw - 160px));
  padding: 9px 14px;
  border: 1px solid rgba(255, 237, 213, 0.24);
  border-radius: 10px;
  background: rgba(67, 20, 7, 0.88);
  color: #ffedd5;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(10px);
}

.selector-instructions strong {
  font-size: 13px;
}

.selector-instructions span {
  font-size: 11px;
  opacity: 0.82;
}

.selector-instructions .selector-error {
  color: #fecaca;
  opacity: 1;
}

.selector-cancel {
  position: absolute;
  top: 24px;
  right: 24px;
  min-height: 34px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 237, 213, 0.3);
  border-radius: 9px;
  background: rgba(67, 20, 7, 0.88);
  color: #ffedd5;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.selector-cancel:disabled {
  cursor: progress;
  opacity: 0.65;
}
</style>
