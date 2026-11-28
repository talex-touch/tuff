<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TxButton, TxVoiceRing } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      left: '左侧声源 (-63°)',
      front: '正前方 (0°)',
      right: '右侧声源 (+63°)',
      auto: '自动巡航',
      listening: '正在倾听',
      analysis: 'LIVE VOICE ANALYSIS',
      direction: 'DIRECTION',
      distance: 'DISTANCE',
      sides: { left: 'Left', front: 'Front', right: 'Right' },
      near: 'Small (< 70 cm)',
      far: 'Large (≥ 70 cm)',
      hint: '在黑色空间舞台内移动指针，或点击方向按钮模拟声源位置——光环会朝声源方向自然倾斜并产生边缘折射。',
    }
  : {
      left: 'Left (-63°)',
      front: 'Front (0°)',
      right: 'Right (+63°)',
      auto: 'Auto sweep',
      listening: 'Listening',
      analysis: 'LIVE VOICE ANALYSIS',
      direction: 'DIRECTION',
      distance: 'DISTANCE',
      sides: { left: 'Left', front: 'Front', right: 'Right' },
      near: 'Small (< 70 cm)',
      far: 'Large (≥ 70 cm)',
      hint: 'Move the pointer across the spatial stage or pick a speaker side — the ring physically leans and refracts toward the voice source.',
    })

const stageRef = ref<HTMLElement | null>(null)
const phoneRef = ref<HTMLElement | null>(null)
const autoSweep = ref(true)
const pan = ref(-0.72)
const distanceRatio = ref(0.32)
const elapsed = ref(0)
const pointerCoords = ref({ x: 248, y: 339 })

let raf = 0
let last = 0
let voiceClock = 0

const sideKey = computed<'left' | 'front' | 'right'>(() =>
  pan.value < -0.22 ? 'left' : pan.value > 0.22 ? 'right' : 'front',
)
const angleDeg = computed(() => Math.round(pan.value * 78))
const distanceCm = computed(() => Math.round(35 + distanceRatio.value * 85))
const confidence = computed(() => Math.round(82 + Math.min(1, Math.abs(pan.value)) * 14))

function sampleVoiceLevel(): number {
  const wave = 0.5 + 0.5 * Math.sin(voiceClock * 6.4) * Math.sin(voiceClock * 1.9 + 0.8)
  return 0.42 + 0.5 * wave
}

function getPan(): number {
  return pan.value
}

function setPreset(targetPan: number, targetDist: number): void {
  autoSweep.value = false
  pan.value = targetPan
  distanceRatio.value = targetDist
}

function onStageMove(event: PointerEvent): void {
  if (!stageRef.value) return
  autoSweep.value = false
  const rect = stageRef.value.getBoundingClientRect()
  const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1))
  const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
  pan.value = nx
  distanceRatio.value = ny
  pointerCoords.value = {
    x: Math.round(event.clientX - rect.left),
    y: Math.round(event.clientY - rect.top),
  }
}

function tick(now: number): void {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
  last = now
  voiceClock += dt
  elapsed.value += dt
  if (autoSweep.value) {
    pan.value = Math.sin(voiceClock * 0.65) * 0.84
    distanceRatio.value = 0.5 + 0.35 * Math.cos(voiceClock * 0.42)
    pointerCoords.value = {
      x: Math.round(280 + pan.value * 165),
      y: Math.round(220 + distanceRatio.value * 110),
    }
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="vr-spatial not-prose">
    <div class="vr-spatial__toolbar">
      <TxButton size="sm" :variant="!autoSweep && sideKey === 'left' ? 'primary' : 'secondary'" @click="setPreset(-0.82, 0.25)">
        {{ copy.left }}
      </TxButton>
      <TxButton size="sm" :variant="!autoSweep && sideKey === 'front' ? 'primary' : 'secondary'" @click="setPreset(0, 0.72)">
        {{ copy.front }}
      </TxButton>
      <TxButton size="sm" :variant="!autoSweep && sideKey === 'right' ? 'primary' : 'secondary'" @click="setPreset(0.82, 0.3)">
        {{ copy.right }}
      </TxButton>
      <TxButton size="sm" :variant="autoSweep ? 'primary' : 'secondary'" @click="autoSweep = !autoSweep">
        {{ copy.auto }}
      </TxButton>
    </div>

    <div
      ref="stageRef"
      class="vr-spatial__stage"
      @pointermove="onStageMove"
    >
      <aside class="vr-spatial__hud" aria-hidden="true">
        <div class="vr-spatial__coord">
          <span>{{ pointerCoords.x }}, {{ pointerCoords.y }}</span>
          <span>SRC · {{ copy.sides[sideKey].toUpperCase() }} · {{ distanceCm }} CM</span>
        </div>
        <div class="vr-spatial__telemetry">
          <div class="vr-spatial__hud-head">
            <span class="vr-spatial__live-badge">LIVE</span>
            <span>{{ copy.analysis }}</span>
            <span>T+{{ elapsed.toFixed(1) }}s</span>
          </div>
          <div class="vr-spatial__metric">
            <span class="vr-spatial__metric-key">{{ copy.direction }}</span>
            <strong>{{ copy.sides[sideKey] }}</strong>
            <span class="vr-spatial__metric-val">{{ angleDeg >= 0 ? `+${angleDeg}°` : `${angleDeg}°` }} · {{ confidence }}%</span>
          </div>
          <div class="vr-spatial__metric">
            <span class="vr-spatial__metric-key">{{ copy.distance }}</span>
            <strong>{{ distanceCm < 70 ? copy.near : copy.far }}</strong>
            <span class="vr-spatial__metric-val">{{ distanceCm }} cm</span>
          </div>
        </div>
      </aside>

      <div ref="phoneRef" class="vr-spatial__device">
        <div class="vr-spatial__ring-wrap">
          <TxVoiceRing
            type="ring"
            state="listening"
            :size="172"
            :level="sampleVoiceLevel"
            :direction="getPan"
            :direction-move="0.45"
            :direction-bounds="phoneRef"
            :direction-margin="18"
            theme="dark"
          />
          <span class="vr-spatial__state">{{ copy.listening }}</span>
        </div>
        <div class="vr-spatial__composer" aria-hidden="true">
          <span class="vr-spatial__pill">Ask anything</span>
          <span class="vr-spatial__mic-dot" />
        </div>
      </div>
    </div>

    <p class="vr-spatial__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.vr-spatial {
  display: grid;
  gap: 14px;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.vr-spatial__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vr-spatial__stage {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 28px 20px;
  border-radius: 20px;
  background-color: #090a0d;
  background-image: radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px);
  background-size: 20px 20px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  cursor: crosshair;
  overflow: hidden;
}

.vr-spatial__hud {
  display: grid;
  gap: 12px;
  width: min(260px, 100%);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.vr-spatial__coord {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.vr-spatial__telemetry {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(12, 14, 18, 0.85);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.vr-spatial__hud-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
  font-size: 10px;
}

.vr-spatial__live-badge {
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(52, 211, 153, 0.2);
  color: #6ee7b7;
}

.vr-spatial__metric {
  display: grid;
  grid-template-columns: 74px 1fr auto;
  align-items: baseline;
  gap: 6px;
}

.vr-spatial__metric-key {
  color: rgba(255, 255, 255, 0.45);
}

.vr-spatial__metric strong {
  color: #fff;
  font-weight: 500;
}

.vr-spatial__metric-val {
  color: rgba(255, 255, 255, 0.65);
  font-variant-numeric: tabular-nums;
}

.vr-spatial__device {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  width: 248px;
  height: 360px;
  padding: 28px 18px 18px;
  border-radius: 36px;
  background: linear-gradient(180deg, #101217, #090a0d);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.12),
    0 24px 48px -20px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  box-sizing: border-box;
}

.vr-spatial__ring-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 28px;
}

.vr-spatial__state {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
}

.vr-spatial__composer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
  box-sizing: border-box;
}

.vr-spatial__mic-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
}

.vr-spatial__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
</style>
