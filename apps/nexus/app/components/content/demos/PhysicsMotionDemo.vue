<script setup lang="ts">
import type { PhysicsMotionTrigger, PhysicsMotionVariant, TxPhysicsMotionInstance } from '@talex-touch/tuffex/physics-motion'
import { PHYSICS_MOTION_SOURCES, PHYSICS_MOTION_VARIANTS } from '@talex-touch/tuffex/physics-motion'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const variant = ref<PhysicsMotionVariant>('anim-card-peel')
const trigger = ref<PhysicsMotionTrigger>('auto')
const loop = ref(false)
const paused = ref(false)
const search = ref('')
const content = ref('TuffEx')
const speed = ref(1)
const replayKey = ref(0)
const catalogReplay = ref(0)
const player = ref<TxPhysicsMotionInstance | null>(null)
const playCount = ref(0)
const finishCount = ref(0)
const coveredCount = ref(0)
const copy = computed(() => locale.value === 'zh' ? {
  variant: '选择完整来源效果', trigger: '触发方式', search: '按 ID 或来源名称筛选', content: '揭示内容',
  replay: '重放所选效果', reset: '显示静止终态', all: '重放筛选结果', pause: '暂停', resume: '继续',
  loop: '循环：开启', once: '循环：关闭', speed: '播放速度', catalog: '全部独立效果',
  source: '来源', plays: '实际开始', finishes: '实际结束', covered: '积木覆盖事件',
  hint: '每个画面都能点击或用 Enter / 空格重放。筛选不会改变来源 ID；滚动到可见范围才播放。',
  triggers: { auto: '进入可见区域', hover: '悬停或聚焦', click: '点击或键盘', manual: '仅 API 重放' },
  labels: { replay: '重放动画', content: content.value, north: '北', south: '南' },
} : {
  variant: 'Choose any source effect', trigger: 'Trigger', search: 'Filter by ID or source name', content: 'Revealed content',
  replay: 'Replay selected', reset: 'Show settled pose', all: 'Replay filtered scenes', pause: 'Pause', resume: 'Resume',
  loop: 'Loop: on', once: 'Loop: off', speed: 'Playback speed', catalog: 'All independent effects',
  source: 'Source', plays: 'Actual starts', finishes: 'Actual finishes', covered: 'Stack covered events',
  hint: 'Click any specimen, or use Enter / Space, to replay. Filtering retains source IDs; offscreen specimens wait until visible.',
  triggers: { auto: 'When visible', hover: 'Hover or focus', click: 'Click or keyboard', manual: 'API replay only' },
  labels: { replay: 'Replay animation', content: content.value, north: 'N', south: 'S' },
})
const selectedSource = computed(() => PHYSICS_MOTION_SOURCES.find(source => source.variant === variant.value)!)
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  return PHYSICS_MOTION_SOURCES.filter(source => `${source.variant} ${source.symbol}`.toLowerCase().includes(query))
})
const triggerOptions: PhysicsMotionTrigger[] = ['auto', 'hover', 'click', 'manual']

function chooseVariant(value: unknown): void {
  const next = PHYSICS_MOTION_VARIANTS.find(id => id === value)
  if (next)
    variant.value = next
}
function chooseTrigger(value: unknown): void {
  const next = triggerOptions.find(id => id === value)
  if (next)
    trigger.value = next
}
</script>

<template>
  <div class="physics-demo not-prose">
    <div class="physics-demo__controls">
      <TuffSelect :model-value="variant" :aria-label="copy.variant" :dropdown-max-height="240" @update:model-value="chooseVariant">
        <TuffSelectItem v-for="source in PHYSICS_MOTION_SOURCES" :key="source.variant" :value="source.variant" :label="`${source.symbol} · ${source.variant}`" />
      </TuffSelect>
      <TuffSelect :model-value="trigger" :aria-label="copy.trigger" @update:model-value="chooseTrigger">
        <TuffSelectItem v-for="mode in triggerOptions" :key="mode" :value="mode" :label="copy.triggers[mode]" />
      </TuffSelect>
      <TxInput v-model="content" :aria-label="copy.content" />
      <label class="physics-demo__speed">{{ copy.speed }}<input v-model.number="speed" type="range" min="0.25" max="2" step="0.25">{{ speed }}×</label>
    </div>
    <div class="physics-demo__actions">
      <TxButton size="sm" @click="replayKey++">
{{ copy.replay }}
</TxButton>
      <TxButton size="sm" @click="player?.reset()">
{{ copy.reset }}
</TxButton>
      <TxButton size="sm" :aria-pressed="loop" @click="loop = !loop">
{{ loop ? copy.loop : copy.once }}
</TxButton>
      <TxButton size="sm" :aria-pressed="paused" @click="paused = !paused">
{{ paused ? copy.resume : copy.pause }}
</TxButton>
    </div>
    <div class="physics-demo__selected">
      <TxPhysicsMotion
ref="player" :variant="variant" :trigger="trigger" :loop="loop" :paused="paused" :speed="speed" :replay-key="replayKey"
        :labels="copy.labels" :aria-label="selectedSource.symbol" @play="playCount++" @finish="finishCount++" @covered="coveredCount++"
/>
      <div class="physics-demo__source">
<strong>{{ selectedSource.symbol }}</strong><code>{{ selectedSource.variant }}</code><span>{{ copy.source }}: {{ selectedSource.file }}</span>
        <span>{{ copy.plays }}: {{ playCount }} · {{ copy.finishes }}: {{ finishCount }} · {{ copy.covered }}: {{ coveredCount }}</span>
</div>
    </div>
    <div class="physics-demo__actions">
<TxInput v-model="search" :placeholder="copy.search" :aria-label="copy.search" /><TxButton size="sm" @click="catalogReplay++">
{{ copy.all }}
</TxButton>
</div>
    <p class="physics-demo__hint">
{{ copy.hint }}
</p>
    <div class="physics-demo__catalog" :aria-label="copy.catalog">
      <section v-for="source in filtered" :key="source.variant" class="physics-demo__specimen">
        <TxPhysicsMotion
:variant="source.variant" trigger="click" :loop="false" :paused="paused" :speed="speed" :replay-key="catalogReplay"
          :labels="copy.labels" :aria-label="`${copy.labels.replay}: ${source.symbol}`" size="sm"
/>
        <strong>{{ source.symbol }}</strong><code>{{ source.variant }}</code>
      </section>
    </div>
  </div>
</template>

<style scoped>
.physics-demo { display: grid; gap: 16px; color: var(--tx-text-color-regular, #606266); font-size: 13px; }
.physics-demo__controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.physics-demo__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.physics-demo__actions :deep(.tx-input) { flex: 1; min-width: 160px; }
.physics-demo__speed { display: flex; align-items: center; gap: 8px; }
.physics-demo__speed input { flex: 1; min-width: 60px; accent-color: var(--tx-color-primary, #409eff); cursor: pointer; }
.physics-demo__selected { display: flex; align-items: center; gap: 16px; border-block: 1px solid var(--tx-border-color, #dcdfe6); padding-block: 8px; }
.physics-demo__source { display: grid; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
.physics-demo__source strong, .physics-demo__specimen strong { font-weight: 500; }
.physics-demo__source span { font-size: 12px; }
.physics-demo code { font-size: .9em; }
.physics-demo__hint { margin: 0; font-size: 12px; line-height: 1.6; }
.physics-demo__catalog { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; max-height: 520px; overflow: auto; padding: 4px; }
.physics-demo__specimen { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 8px; text-align: center; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); border-radius: 12px; }
.physics-demo__specimen code { overflow-wrap: anywhere; }
@media (max-width: 520px) { .physics-demo__controls { grid-template-columns: 1fr; } .physics-demo__selected { flex-direction: column; align-items: flex-start; } }
</style>
