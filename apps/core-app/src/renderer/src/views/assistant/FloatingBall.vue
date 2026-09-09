<script lang="ts" setup name="FloatingBall">
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const transport = useTuffTransport()
const { t } = useI18n()
const isDragging = ref(false)
const dragState = reactive({
  active: false,
  originX: 0,
  originY: 0,
  offsetX: 0,
  offsetY: 0
})

let lastMoveAt = 0

function updateFloatingBallPosition(x: number, y: number): void {
  const now = Date.now()
  if (now - lastMoveAt < 16) return
  lastMoveAt = now
  void transport.send(AssistantEvents.floatingBall.updatePosition, { x, y })
}

function onPointerMove(event: MouseEvent): void {
  if (!dragState.active) return

  const deltaX = Math.abs(event.screenX - dragState.originX)
  const deltaY = Math.abs(event.screenY - dragState.originY)
  if (!isDragging.value && (deltaX > 3 || deltaY > 3)) {
    isDragging.value = true
  }
  if (!isDragging.value) return

  updateFloatingBallPosition(
    Math.round(event.screenX - dragState.offsetX),
    Math.round(event.screenY - dragState.offsetY)
  )
}

function onPointerUp(): void {
  dragState.active = false
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  setTimeout(() => {
    isDragging.value = false
  }, 0)
}

function onPointerDown(event: MouseEvent): void {
  dragState.active = true
  dragState.originX = event.screenX
  dragState.originY = event.screenY
  dragState.offsetX = event.clientX
  dragState.offsetY = event.clientY
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
}

function onBallClick(): void {
  if (isDragging.value) return
  void transport.send(AssistantEvents.floatingBall.openVoicePanel, { source: 'click' })
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
})
</script>

<template>
  <button
    class="floating-ball-root"
    type="button"
    :aria-label="t('assistant.floatingBall.clickToOpen')"
    @mousedown="onPointerDown"
    @click="onBallClick"
  >
    <span class="floating-ball" aria-hidden="true">
      <span class="i-carbon-microphone-filled" aria-hidden="true" />
    </span>
  </button>
</template>

<style scoped>
.floating-ball-root {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  user-select: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  appearance: none;
  cursor: grab;
}

.floating-ball-root:active {
  cursor: grabbing;
}

.floating-ball {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary);
  box-shadow: 0 8px 14px var(--shell-shadow);
  transition:
    transform 160ms ease-out,
    box-shadow 160ms ease-out,
    filter 160ms ease-out;
}

.floating-ball:hover {
  transform: scale(1.04);
  box-shadow: 0 8px 14px var(--shell-shadow);
  filter: brightness(1.06);
}

.floating-ball > span {
  color: var(--shell-on-primary);
  font-size: 20px;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .floating-ball {
    transition: none;
  }
}
</style>
