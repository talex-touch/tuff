<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { MikoEmits, MikoProps, MikoState } from './types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MIKO_DEFAULT_LABELS } from './types'

defineOptions({
  name: 'TxMiko',
})

const props = withDefaults(defineProps<MikoProps>(), {
  state: 'idle',
  size: 'md',
  color: '#810DC6',
  labels: () => ({}),
  ariaLabel: undefined,
  interactive: false,
  random: false,
  randomInterval: 5000,
  demon: false,
  mutationChance: 0.06,
})

const emit = defineEmits<MikoEmits>()

const reactionState = ref<MikoState | null>(null)
const randomState = ref<MikoState | null>(null)
const isMutatedDemon = ref(false)
const isClicked = ref(false)
const showFloatingHeart = ref(false)
const showDemonBurst = ref(false)
let clickTimer: ReturnType<typeof setTimeout> | null = null
let demonTimer: ReturnType<typeof setTimeout> | null = null
let clickCount = 0
let clickCountResetTimer: ReturnType<typeof setTimeout> | null = null
let randomTimer: ReturnType<typeof setTimeout> | null = null

const CASUAL_RANDOM_STATES: MikoState[] = [
  'stretching',
  'curious',
  'bathing',
  'purring',
  'running',
  'box',
  'sleeping',
  'peeking',
  'reading',
  'eating',
  'dancing',
  'coffee',
  'guitar',
  'sleepy',
  'ninja',
  'fishing',
  'magic',
  'umbrella',
  'heart',
  'workout',
  'dj',
  'chef',
  'space',
]

const CLICK_REACTIONS: MikoState[] = [
  'celebrating',
  'cheering',
  'running',
  'success',
  'purring',
  'curious',
  'stretching',
  'heart',
  'guitar',
  'magic',
  'dj',
  'coffee',
]

const isDemonMode = computed(() => props.demon || isMutatedDemon.value || effectiveState.value === 'demon')

const effectiveState = computed<MikoState>(() => {
  if (reactionState.value)
    return reactionState.value
  if (props.state && props.state !== 'idle' && !props.random)
    return props.state
  if (props.random && randomState.value)
    return randomState.value
  return props.state || 'idle'
})

const mergedLabels = computed(() => ({
  ...MIKO_DEFAULT_LABELS,
  ...props.labels,
}))

const currentLabel = computed(() => {
  const base = mergedLabels.value[effectiveState.value] || effectiveState.value
  return isDemonMode.value ? `${base} (闪光恶魔)` : base
})
const computedAriaLabel = computed(() => props.ariaLabel || `Miko: ${currentLabel.value}`)

const effectiveColor = computed(() => {
  if (isDemonMode.value && props.color === '#810DC6') {
    return '#4C0519' // 闪光恶魔专属深邃暗绯色
  }
  return props.color
})

const rootStyle = computed<CSSProperties>(() => {
  const s = props.size
  let width = '90px'
  let height = '50px'

  if (typeof s === 'number') {
    width = `${s * 1.8}px`
    height = `${s}px`
  }
  else if (s === 'xs') {
    width = '40px'
    height = '22px'
  }
  else if (s === 'sm') {
    width = '54px'
    height = '30px'
  }
  else if (s === 'md') {
    width = '90px'
    height = '50px'
  }
  else if (s === 'lg') {
    width = '120px'
    height = '66px'
  }
  else if (typeof s === 'string') {
    width = s
    height = 'auto'
  }

  return {
    width,
    height,
    '--tx-miko-body-color': effectiveColor.value,
  }
})

function triggerDemonMutation(duration = 9000) {
  if (demonTimer)
    clearTimeout(demonTimer)
  isMutatedDemon.value = true
  showDemonBurst.value = true
  emit('mutate', true)

  setTimeout(() => {
    showDemonBurst.value = false
  }, 1200)

  demonTimer = setTimeout(() => {
    isMutatedDemon.value = false
    emit('mutate', false)
  }, duration)
}

function scheduleRandomState() {
  if (!props.random)
    return
  if (randomTimer)
    clearTimeout(randomTimer)

  // 动作衔接机制：动作完成后平稳过渡回 idle，在 idle 沉浸后再触发下一动作
  if (randomState.value && randomState.value !== 'idle') {
    randomTimer = setTimeout(() => {
      randomState.value = 'idle'
      emit('stateChange', 'idle')
      emit('update:state', 'idle')
      scheduleRandomState()
    }, 3800)
    return
  }

  const jitter = (Math.random() - 0.5) * 2000
  const delay = Math.max(3000, props.randomInterval + jitter)

  randomTimer = setTimeout(() => {
    if (reactionState.value || (props.state && props.state !== 'idle')) {
      scheduleRandomState()
      return
    }

    // 变异检测：一定概率突变成闪光恶魔
    if (!props.demon && !isMutatedDemon.value && Math.random() < props.mutationChance) {
      triggerDemonMutation(10000)
      randomState.value = 'demon'
      emit('stateChange', 'demon')
      emit('update:state', 'demon')
      scheduleRandomState()
      return
    }

    const available = CASUAL_RANDOM_STATES.filter(s => s !== randomState.value)
    const next = available[Math.floor(Math.random() * available.length)] ?? 'idle'
    randomState.value = next
    emit('stateChange', next)
    emit('update:state', next)

    scheduleRandomState()
  }, delay)
}

function triggerReaction(state: MikoState, duration = 1900) {
  if (clickTimer)
    clearTimeout(clickTimer)
  reactionState.value = state
  emit('stateChange', state)
  emit('update:state', state)

  clickTimer = setTimeout(() => {
    reactionState.value = null
    emit('stateChange', effectiveState.value)
    emit('update:state', effectiveState.value)
  }, duration)
}

function handleClick(event: MouseEvent) {
  emit('click', event)

  if (!props.interactive)
    return

  isClicked.value = true
  showFloatingHeart.value = true
  setTimeout(() => {
    isClicked.value = false
  }, 250)
  setTimeout(() => {
    showFloatingHeart.value = false
  }, 900)

  clickCount++
  if (clickCountResetTimer)
    clearTimeout(clickCountResetTimer)
  clickCountResetTimer = setTimeout(() => {
    clickCount = 0
  }, 1200)

  if (clickCount >= 4) {
    clickCount = 0
    triggerReaction('dizzy', 2600)
    return
  }

  // 点击触发闪光恶魔突变检测
  if (!props.demon && !isMutatedDemon.value && Math.random() < props.mutationChance) {
    triggerDemonMutation(12000)
    triggerReaction('demon', 2600)
    return
  }

  const randomReaction = CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)] ?? 'celebrating'
  triggerReaction(randomReaction, 1900)

  if (props.random) {
    scheduleRandomState()
  }
}

watch(
  () => props.random,
  (val) => {
    if (val) {
      scheduleRandomState()
    }
    else {
      if (randomTimer)
        clearTimeout(randomTimer)
      randomState.value = null
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (props.random) {
    scheduleRandomState()
  }
})

onUnmounted(() => {
  if (randomTimer)
    clearTimeout(randomTimer)
  if (clickTimer)
    clearTimeout(clickTimer)
  if (demonTimer)
    clearTimeout(demonTimer)
  if (clickCountResetTimer)
    clearTimeout(clickCountResetTimer)
})
</script>

<template>
  <div
    class="tx-miko"
    :class="[
      `state-${effectiveState}`,
      {
        'is-interactive': interactive,
        'is-clicked': isClicked,
        'is-demon': isDemonMode,
      },
    ]"
    :style="rootStyle"
    role="img"
    :aria-label="computedAriaLabel"
    @click="handleClick"
  >
    <!-- 交互点击漂浮爱心/星光 -->
    <div v-if="showFloatingHeart" class="miko-floating-particle" aria-hidden="true">
      <svg viewBox="0 0 10 10" width="14" height="14">
        <path d="M2,3 A2,2 0 0,1 5,3 A2,2 0 0,1 8,3 Q8,6 5,8 Q2,6 2,3 Z" fill="#EC4899" />
      </svg>
    </div>

    <!-- 闪光恶魔变异金色/绯红迸发光爆 -->
    <div v-if="showDemonBurst" class="miko-demon-burst" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="36" height="36">
        <polygon points="16,2 19,12 29,16 19,20 16,30 13,20 3,16 13,12" fill="#F43F5E" />
        <circle cx="16" cy="16" r="4" fill="#FDE047" />
      </svg>
    </div>

    <svg viewBox="0 0 36 20" shape-rendering="crispEdges">
      <Transition name="miko-state">
        <!-- 1. 待命 IDLE -->
        <g v-if="effectiveState === 'idle'" key="idle" class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
            <rect x="23" y="7" width="2" height="2" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="20" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="21" height="2" :fill="effectiveColor" />
          <g class="cat-eyes">
            <rect x="5" y="11" width="2" height="2" fill="#000" />
            <rect x="13" y="11" width="2" height="2" fill="#000" />
          </g>
          <rect x="8" y="13" width="1" height="1" fill="#000" />
          <rect x="10" y="13" width="1" height="1" fill="#000" />
          <rect x="9" y="14" width="1" height="1" fill="#000" />
        </g>

        <!-- 2. 执行打字 WORKING -->
        <g v-else-if="effectiveState === 'working'" key="working" class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="7" width="2" height="5" :fill="effectiveColor" />
            <rect x="25" y="5" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="18" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="21" height="2" :fill="effectiveColor" />
          <rect x="5" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
          <!-- 小键盘与敲代码双爪 -->
          <g class="keyboard">
            <rect x="3" y="16" width="10" height="2" fill="#333" />
            <rect x="4" y="16" width="2" height="1" fill="#666" />
            <rect x="7" y="16" width="2" height="1" fill="#666" />
            <rect x="10" y="16" width="2" height="1" fill="#666" />
          </g>
          <g class="paw-l">
            <rect x="4" y="14" width="2" height="2" fill="#fff" />
            <rect x="4" y="15" width="2" height="1" :fill="effectiveColor" />
          </g>
          <g class="paw-r">
            <rect x="9" y="14" width="2" height="2" fill="#fff" />
            <rect x="9" y="15" width="2" height="1" :fill="effectiveColor" />
          </g>
        </g>

        <!-- 3. 思考灵感 THINKING -->
        <g v-else-if="effectiveState === 'thinking'" key="thinking" class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="8" width="2" height="4" :fill="effectiveColor" />
            <rect x="25" y="6" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="21" height="2" :fill="effectiveColor" />
          <rect x="5" y="10" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="2" fill="#000" />
          <g class="cat-sparkle">
            <rect x="18" y="2" width="3" height="3" fill="#FFD700" />
            <rect x="19" y="1" width="1" height="5" fill="#FFD700" />
            <rect x="17" y="3" width="5" height="1" fill="#FFD700" />
          </g>
        </g>

        <!-- 4. 成功喜悦 SUCCESS -->
        <g v-else-if="effectiveState === 'success'" key="success" class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="5" width="2" height="6" :fill="effectiveColor" />
            <rect x="23" y="3" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="6" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="6" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="7" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="18" height="2" :fill="effectiveColor" />
          <rect x="2" y="9" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="14" width="21" height="2" :fill="effectiveColor" />
          <rect x="4" y="10" width="1" height="1" fill="#000" />
          <rect x="5" y="9" width="2" height="1" fill="#000" />
          <rect x="7" y="10" width="1" height="1" fill="#000" />
          <rect x="12" y="10" width="1" height="1" fill="#000" />
          <rect x="13" y="9" width="2" height="1" fill="#000" />
          <rect x="15" y="10" width="1" height="1" fill="#000" />
          <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="9" y="12" width="2" height="1" fill="#000" />
        </g>

        <!-- 5. 警觉确认 ALERT -->
        <g v-else-if="effectiveState === 'alert'" key="alert" class="cat-body">
          <rect x="2" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="14" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="1" y="8" width="5" height="1" :fill="effectiveColor" />
          <rect x="14" y="8" width="5" height="1" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="21" height="2" :fill="effectiveColor" />
          <rect x="5" y="10" width="2" height="3" fill="#000" />
          <rect x="13" y="10" width="2" height="3" fill="#000" />
          <g class="cat-alert-mark">
            <rect x="19" y="1" width="2" height="4" fill="#EF4444" />
            <rect x="19" y="6" width="2" height="2" fill="#EF4444" />
          </g>
        </g>

        <!-- 6. 异常报错 ERROR -->
        <g v-else-if="effectiveState === 'error'" key="error" class="cat-body">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="22" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="23" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="21" height="2" :fill="effectiveColor" />
          <g class="cat-eyes-error">
            <rect x="5" y="10" width="1" height="1" fill="#EF4444" />
            <rect x="7" y="10" width="1" height="1" fill="#EF4444" />
            <rect x="6" y="11" width="1" height="1" fill="#EF4444" />
            <rect x="5" y="12" width="1" height="1" fill="#EF4444" />
            <rect x="7" y="12" width="1" height="1" fill="#EF4444" />
            <rect x="13" y="10" width="1" height="1" fill="#EF4444" />
            <rect x="15" y="10" width="1" height="1" fill="#EF4444" />
            <rect x="14" y="11" width="1" height="1" fill="#EF4444" />
            <rect x="13" y="12" width="1" height="1" fill="#EF4444" />
            <rect x="15" y="12" width="1" height="1" fill="#EF4444" />
          </g>
          <rect x="1" y="9" width="1" height="2" fill="#60A5FA" />
        </g>

        <!-- 7. 休眠蜷缩 SLEEPING -->
        <g v-else-if="effectiveState === 'sleeping'" key="sleeping" class="cat-body">
          <rect x="4" y="9" width="20" height="7" :fill="effectiveColor" />
          <rect x="6" y="8" width="15" height="1" :fill="effectiveColor" />
          <rect x="5" y="16" width="18" height="1" :fill="effectiveColor" />
          <rect x="6" y="8" width="2" height="1" :fill="effectiveColor" />
          <rect x="12" y="8" width="2" height="1" :fill="effectiveColor" />
          <rect x="7" y="12" width="3" height="1" fill="#000" />
          <rect x="13" y="12" width="3" height="1" fill="#000" />
          <rect x="19" y="13" width="5" height="2" :fill="effectiveColor" />
          <g class="cat-zzz">
            <text x="23" y="8" font-size="6" font-family="monospace" font-weight="bold" fill="#A78BFA">Z</text>
            <text x="27" y="5" font-size="4" font-family="monospace" font-weight="bold" fill="#A78BFA">z</text>
          </g>
        </g>

        <!-- 8. 多任务 JUGGLING -->
        <g v-else-if="effectiveState === 'juggling'" key="juggling" class="cat-body">
          <rect x="5" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="8" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="16" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="20" height="5" :fill="effectiveColor" />
          <g class="juggle-ball-1"><rect x="6" y="2" width="3" height="3" fill="#10B981" /></g>
          <g class="juggle-ball-2"><rect x="14" y="1" width="3" height="3" fill="#3B82F6" /></g>
          <g class="juggle-ball-3"><rect x="21" y="3" width="3" height="3" fill="#F59E0B" /></g>
          <rect x="6" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
        </g>

        <!-- 9. 扫地 SWEEPING -->
        <g v-else-if="effectiveState === 'sweeping'" key="sweeping" class="cat-body">
          <rect x="7" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="14" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="5" y="8" width="16" height="8" :fill="effectiveColor" />
          <g class="broom">
            <rect x="3" y="6" width="1" height="8" fill="#B45309" />
            <rect x="1" y="14" width="4" height="3" fill="#FDE047" />
          </g>
          <rect x="6" y="16" width="1" height="1" fill="#9CA3AF" />
          <rect x="8" y="15" width="1" height="1" fill="#9CA3AF" />
        </g>

        <!-- 10. 代码研读 READING -->
        <g v-else-if="effectiveState === 'reading'" key="reading" class="cat-body">
          <rect x="7" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="15" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="5" y="8" width="18" height="8" :fill="effectiveColor" />
          <rect x="2" y="11" width="6" height="5" fill="#E5E7EB" />
          <rect x="3" y="12" width="4" height="1" fill="#4B5563" />
          <rect x="3" y="14" width="3" height="1" fill="#4B5563" />
          <g class="glasses">
            <rect x="7" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
            <rect x="12" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
          </g>
        </g>

        <!-- 11. 眩晕 DIZZY -->
        <g v-else-if="effectiveState === 'dizzy'" key="dizzy" class="cat-body">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="18" height="8" :fill="effectiveColor" />
          <g class="spiral-eyes">
            <rect x="5" y="10" width="3" height="1" fill="#000" />
            <rect x="7" y="11" width="1" height="1" fill="#000" />
            <rect x="5" y="12" width="2" height="1" fill="#000" />
            <rect x="13" y="10" width="3" height="1" fill="#000" />
            <rect x="15" y="11" width="1" height="1" fill="#000" />
            <rect x="13" y="12" width="2" height="1" fill="#000" />
          </g>
          <g class="dizzy-stars">
            <rect x="9" y="2" width="2" height="2" fill="#FBBF24" />
            <rect x="17" y="3" width="1" height="1" fill="#FBBF24" />
          </g>
        </g>

        <!-- 12. 边栏探头 PEEKING -->
        <g v-else-if="effectiveState === 'peeking'" key="peeking" class="cat-peek">
          <!-- 边栏/桌面边缘 (避免悬空) -->
          <rect x="2" y="16" width="32" height="3" fill="#3F3F46" />
          <rect x="2" y="16" width="32" height="1" fill="#71717A" />
          <!-- 猫猫探头 -->
          <rect x="11" y="7" width="2" height="3" :fill="effectiveColor" />
          <rect x="21" y="7" width="2" height="3" :fill="effectiveColor" />
          <rect x="9" y="10" width="16" height="6" :fill="effectiveColor" />
          <g class="peek-eyes">
            <rect x="12" y="11" width="2" height="2" fill="#000" />
            <rect x="20" y="11" width="2" height="2" fill="#000" />
            <rect x="12" y="11" width="1" height="1" fill="#fff" />
            <rect x="20" y="11" width="1" height="1" fill="#fff" />
          </g>
          <rect x="15" y="13" width="4" height="1" fill="#000" />
          <!-- 两只搭在边缘上的小白爪 -->
          <rect x="11" y="15" width="3" height="2" fill="#fff" />
          <rect x="20" y="15" width="3" height="2" fill="#fff" />
        </g>

        <!-- 13. 猫式伸懒腰 STRETCHING -->
        <g v-else-if="effectiveState === 'stretching'" key="stretching" class="cat-stretch">
          <g class="cat-tail-stretch">
            <rect x="23" y="2" width="2" height="8" :fill="effectiveColor" />
            <rect x="24" y="1" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="11" width="2" height="2" :fill="effectiveColor" />
          <rect x="11" y="11" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="12" width="9" height="4" :fill="effectiveColor" />
          <rect x="12" y="9" width="12" height="7" :fill="effectiveColor" />
          <rect x="1" y="15" width="4" height="2" :fill="effectiveColor" />
          <rect x="1" y="15" width="2" height="1" fill="#FF76A5" />
          <rect x="5" y="13" width="2" height="1" fill="#000" />
          <rect x="9" y="13" width="2" height="1" fill="#000" />
        </g>

        <!-- 14. 舔爪洗脸 BATHING -->
        <g v-else-if="effectiveState === 'bathing'" key="bathing" class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="18" height="8" :fill="effectiveColor" />
          <rect x="6" y="11" width="2" height="2" fill="#000" />
          <rect x="12" y="11" width="2" height="1" fill="#000" />
          <g class="paw-bath">
            <rect x="13" y="9" width="3" height="3" :fill="effectiveColor" />
            <rect x="14" y="10" width="2" height="2" fill="#FF76A5" />
          </g>
          <rect x="9" y="13" width="2" height="1" fill="#FF76A5" />
        </g>

        <!-- 15. 好奇歪头 CURIOUS -->
        <g v-else-if="effectiveState === 'curious'" key="curious" class="cat-curious">
          <g class="cat-tail">
            <rect x="24" y="7" width="2" height="5" :fill="effectiveColor" />
            <rect x="25" y="6" width="2" height="2" :fill="effectiveColor" />
          </g>
          <rect x="3" y="10" width="21" height="7" :fill="effectiveColor" />
          <g class="curious-head">
            <rect x="6" y="5" width="2" height="3" :fill="effectiveColor" />
            <rect x="14" y="7" width="3" height="2" :fill="effectiveColor" />
            <rect x="5" y="7" width="12" height="6" :fill="effectiveColor" />
            <rect x="6" y="9" width="2" height="2" fill="#000" />
            <rect x="12" y="10" width="2" height="2" fill="#000" />
            <rect x="6" y="9" width="1" height="1" fill="#fff" />
            <rect x="12" y="10" width="1" height="1" fill="#fff" />
          </g>
          <g class="question-mark">
            <rect x="19" y="2" width="3" height="1" fill="#F59E0B" />
            <rect x="21" y="3" width="1" height="2" fill="#F59E0B" />
            <rect x="20" y="4" width="1" height="1" fill="#F59E0B" />
            <rect x="20" y="6" width="1" height="1" fill="#F59E0B" />
          </g>
        </g>

        <!-- 16. 磨爪挠挠 SCRATCHING -->
        <g v-else-if="effectiveState === 'scratching'" key="scratching" class="cat-body">
          <rect x="6" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="14" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="5" y="9" width="18" height="7" :fill="effectiveColor" />
          <rect x="1" y="6" width="3" height="11" fill="#A87343" />
          <rect x="1" y="9" width="3" height="1" fill="#D4A373" />
          <rect x="1" y="13" width="3" height="1" fill="#D4A373" />
          <g class="scratch-paw-1"><rect x="3" y="8" width="3" height="2" fill="#fff" /></g>
          <g class="scratch-paw-2"><rect x="3" y="12" width="3" height="2" fill="#fff" /></g>
          <g class="scratch-spark">
            <rect x="4" y="7" width="1" height="1" fill="#FBBF24" />
            <rect x="4" y="14" width="1" height="1" fill="#FBBF24" />
          </g>
        </g>

        <!-- 17. 呼噜治愈 PURRING -->
        <g v-else-if="effectiveState === 'purring'" key="purring" class="cat-purr">
          <g class="cat-tail">
            <rect x="23" y="11" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="9" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="21" height="7" :fill="effectiveColor" />
          <rect x="6" y="11" width="2" height="1" fill="#000" />
          <rect x="12" y="11" width="2" height="1" fill="#000" />
          <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="9" y="12" width="1" height="1" fill="#000" />
          <rect x="10" y="12" width="1" height="1" fill="#000" />
          <g class="purr-note-1">
            <rect x="24" y="4" width="2" height="2" fill="#06B6D4" />
            <rect x="25" y="3" width="1" height="3" fill="#06B6D4" />
          </g>
          <g class="purr-heart">
            <rect x="2" y="3" width="3" height="2" fill="#EC4899" />
            <rect x="3" y="5" width="1" height="1" fill="#EC4899" />
          </g>
        </g>

        <!-- 18. 吃小鱼干 EATING -->
        <g v-else-if="effectiveState === 'eating'" key="eating" class="cat-body">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="19" height="8" :fill="effectiveColor" />
          <rect x="6" y="10" width="2" height="1" fill="#000" />
          <rect x="12" y="10" width="2" height="1" fill="#000" />
          <g class="tasty-fish">
            <rect x="8" y="12" width="6" height="3" fill="#FBBF24" />
            <rect x="14" y="11" width="2" height="4" fill="#F59E0B" />
            <rect x="9" y="13" width="1" height="1" fill="#000" />
          </g>
          <g class="chewing-jaw">
            <rect x="7" y="14" width="3" height="2" fill="#fff" />
            <rect x="12" y="14" width="3" height="2" fill="#fff" />
          </g>
        </g>

        <!-- 19. 节拍摇摆 DANCING -->
        <g v-else-if="effectiveState === 'dancing'" key="dancing" class="cat-dance">
          <g class="cat-tail-dance">
            <rect x="23" y="6" width="2" height="6" :fill="effectiveColor" />
            <rect x="25" y="4" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="6" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="14" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="17" height="9" :fill="effectiveColor" />
          <rect x="1" y="9" width="3" height="2" fill="#fff" />
          <rect x="21" y="9" width="3" height="2" fill="#fff" />
          <rect x="6" y="9" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="1" fill="#000" />
          <g class="dance-note">
            <rect x="2" y="2" width="2" height="2" fill="#8B5CF6" />
            <rect x="3" y="1" width="1" height="3" fill="#8B5CF6" />
          </g>
        </g>

        <!-- 20. 打call应援 CHEERING -->
        <g v-else-if="effectiveState === 'cheering'" key="cheering" class="cat-cheer">
          <rect x="6" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="14" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="9" width="17" height="7" :fill="effectiveColor" />
          <rect x="7" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
          <g class="glowstick-pink">
            <rect x="1" y="1" width="2" height="8" fill="#EC4899" />
            <rect x="1" y="8" width="3" height="2" fill="#fff" />
          </g>
          <g class="glowstick-cyan">
            <rect x="22" y="1" width="2" height="8" fill="#06B6D4" />
            <rect x="21" y="8" width="3" height="2" fill="#fff" />
          </g>
        </g>

        <!-- 21. 专注打机 GAMING -->
        <g v-else-if="effectiveState === 'gaming'" key="gaming" class="cat-body">
          <rect x="6" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="14" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="18" height="8" :fill="effectiveColor" />
          <rect x="7" y="10" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="2" fill="#000" />
          <rect x="8" y="10" width="1" height="1" fill="#38BDF8" />
          <rect x="14" y="10" width="1" height="1" fill="#38BDF8" />
          <g class="gamepad">
            <rect x="6" y="12" width="12" height="4" fill="#374151" />
            <rect x="7" y="13" width="2" height="2" fill="#06B6D4" />
            <rect x="15" y="13" width="2" height="2" fill="#EF4444" />
            <rect x="6" y="13" width="2" height="2" fill="#fff" />
            <rect x="16" y="13" width="2" height="2" fill="#fff" />
          </g>
        </g>

        <!-- 22. 极客超频 HACKING -->
        <g v-else-if="effectiveState === 'hacking'" key="hacking" class="cat-body">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="19" height="8" :fill="effectiveColor" />
          <g class="sunglasses">
            <rect x="4" y="10" width="12" height="3" fill="#111827" />
            <rect x="6" y="10" width="2" height="1" fill="#10B981" />
            <rect x="12" y="10" width="2" height="1" fill="#10B981" />
          </g>
          <g class="hack-matrix">
            <rect x="1" y="14" width="8" height="2" fill="#064E3B" />
            <rect x="2" y="14" width="1" height="1" fill="#34D399" />
            <rect x="5" y="14" width="2" height="1" fill="#34D399" />
            <rect x="3" y="15" width="2" height="1" fill="#10B981" />
          </g>
          <g class="hack-paws">
            <rect x="3" y="13" width="3" height="2" fill="#fff" opacity="0.8" />
            <rect x="6" y="12" width="3" height="2" fill="#fff" opacity="0.9" />
          </g>
        </g>

        <!-- 23. 撒花庆祝 CELEBRATING -->
        <g v-else-if="effectiveState === 'celebrating'" key="celebrating" class="cat-celebrate">
          <rect x="5" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="5" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="7" width="18" height="9" :fill="effectiveColor" />
          <rect x="1" y="6" width="3" height="3" fill="#fff" />
          <rect x="20" y="6" width="3" height="3" fill="#fff" />
          <rect x="6" y="9" width="2" height="1" fill="#000" />
          <rect x="13" y="9" width="2" height="1" fill="#000" />
          <g class="confetti-stream">
            <rect x="3" y="1" width="2" height="2" fill="#FBBF24" />
            <rect x="10" y="2" width="2" height="2" fill="#EC4899" />
            <rect x="16" y="1" width="2" height="2" fill="#06B6D4" />
            <rect x="23" y="3" width="2" height="2" fill="#10B981" />
            <rect x="26" y="1" width="2" height="2" fill="#8B5CF6" />
          </g>
        </g>

        <!-- 24. 纸箱猫猫 BOX -->
        <g v-else-if="effectiveState === 'box'" key="box" class="cat-box">
          <rect x="3" y="9" width="24" height="9" fill="#B48450" />
          <rect x="3" y="9" width="24" height="2" fill="#C99B67" />
          <rect x="3" y="17" width="24" height="1" fill="#8D5C2C" />
          <rect x="1" y="8" width="4" height="2" fill="#C99B67" />
          <rect x="25" y="8" width="4" height="2" fill="#C99B67" />
          <rect x="14" y="13" width="2" height="2" fill="#8D5C2C" />
          <rect x="12" y="12" width="1" height="1" fill="#8D5C2C" />
          <rect x="14" y="11" width="1" height="1" fill="#8D5C2C" />
          <rect x="16" y="11" width="1" height="1" fill="#8D5C2C" />
          <rect x="17" y="12" width="1" height="1" fill="#8D5C2C" />
          <g class="box-peeker">
            <rect x="8" y="4" width="2" height="3" :fill="effectiveColor" />
            <rect x="18" y="4" width="2" height="3" :fill="effectiveColor" />
            <rect x="7" y="7" width="14" height="3" :fill="effectiveColor" />
            <rect x="9" y="7" width="2" height="2" fill="#000" />
            <rect x="17" y="7" width="2" height="2" fill="#000" />
            <rect x="9" y="7" width="1" height="1" fill="#fff" />
            <rect x="17" y="7" width="1" height="1" fill="#fff" />
          </g>
        </g>

        <!-- 25. 奔跑状态 RUNNING -->
        <g v-else-if="effectiveState === 'running'" key="running" class="cat-running">
          <g class="running-dust">
            <rect x="27" y="14" width="3" height="2" fill="#9CA3AF" />
            <rect x="30" y="13" width="2" height="1" fill="#D1D5DB" />
            <rect x="25" y="16" width="2" height="1" fill="#9CA3AF" />
          </g>
          <g class="running-tail">
            <rect x="23" y="9" width="6" height="2" :fill="effectiveColor" />
            <rect x="28" y="8" width="2" height="2" :fill="effectiveColor" />
          </g>
          <rect x="4" y="6" width="3" height="2" :fill="effectiveColor" />
          <rect x="11" y="6" width="3" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="13" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="16" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="19" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="21" height="3" :fill="effectiveColor" />
          <rect x="3" y="14" width="19" height="2" :fill="effectiveColor" />
          <rect x="5" y="10" width="3" height="1" fill="#000" />
          <rect x="12" y="10" width="3" height="1" fill="#000" />
          <rect x="8" y="13" width="2" height="1" fill="#000" />
          <g class="running-paw-fl">
            <rect x="4" y="15" width="3" height="2" fill="#fff" />
          </g>
          <g class="running-paw-fr">
            <rect x="8" y="15" width="3" height="2" fill="#fff" />
          </g>
          <g class="running-paw-bl">
            <rect x="17" y="15" width="3" height="2" fill="#fff" />
          </g>
          <g class="running-paw-br">
            <rect x="21" y="15" width="3" height="2" fill="#fff" />
          </g>
        </g>

        <!-- 26. 闪光恶魔 DEMON -->
        <g v-else-if="effectiveState === 'demon'" key="demon" class="cat-demon">
          <!-- 恶魔小蝙蝠翅膀 -->
          <g class="demon-wing-l">
            <rect x="1" y="5" width="2" height="2" fill="#EF4444" />
            <rect x="2" y="7" width="3" height="4" fill="#18181B" />
            <rect x="0" y="8" width="2" height="2" fill="#EF4444" />
          </g>
          <g class="demon-wing-r">
            <rect x="21" y="5" width="2" height="2" fill="#EF4444" />
            <rect x="19" y="7" width="3" height="4" fill="#18181B" />
            <rect x="22" y="8" width="2" height="2" fill="#EF4444" />
          </g>
          <!-- 恶魔小叉尾 -->
          <g class="demon-tail">
            <rect x="22" y="10" width="4" height="2" fill="#EF4444" />
            <rect x="25" y="8" width="2" height="3" fill="#EF4444" />
            <polygon points="28,7 32,5 32,9" fill="#EF4444" />
          </g>
          <!-- 恶魔犄角 -->
          <g class="demon-horns">
            <rect x="4" y="3" width="2" height="3" fill="#EF4444" />
            <rect x="3" y="2" width="2" height="2" fill="#F43F5E" />
            <rect x="14" y="3" width="2" height="3" fill="#EF4444" />
            <rect x="15" y="2" width="2" height="2" fill="#F43F5E" />
          </g>
          <!-- 身体本体 (暗绯色/深紫) -->
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="20" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="21" height="2" :fill="effectiveColor" />
          <rect x="2" y="12" width="22" height="3" :fill="effectiveColor" />
          <rect x="3" y="15" width="20" height="2" :fill="effectiveColor" />
          <!-- 邪魅发光金/红瞳 -->
          <g class="demon-eyes">
            <rect x="5" y="10" width="3" height="2" fill="#EF4444" />
            <rect x="6" y="10" width="1" height="2" fill="#FDE047" />
            <rect x="12" y="10" width="3" height="2" fill="#EF4444" />
            <rect x="13" y="10" width="1" height="2" fill="#FDE047" />
          </g>
          <!-- 小恶魔嘴角与小尖牙 -->
          <g class="demon-fangs">
            <rect x="7" y="13" width="6" height="1" fill="#000" />
            <rect x="8" y="14" width="1" height="2" fill="#fff" />
            <rect x="11" y="14" width="1" height="2" fill="#fff" />
          </g>
          <!-- 闪光恶魔星光 (金色与绯红粒子) -->
          <g class="demon-sparkles">
            <rect x="8" y="1" width="1" height="1" fill="#FDE047" />
            <rect x="18" y="1" width="2" height="2" fill="#F43F5E" />
            <rect x="2" y="12" width="1" height="1" fill="#FDE047" />
            <rect x="26" y="13" width="2" height="2" fill="#FDE047" />
          </g>
        </g>
        <!-- 27. 品尝咖啡 COFFEE -->
        <g v-else-if="effectiveState === 'coffee'" key="coffee" class="cat-coffee">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="19" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="21" height="4" :fill="effectiveColor" />
          <rect x="3" y="15" width="19" height="2" :fill="effectiveColor" />
          <rect x="5" y="10" width="3" height="1" fill="#000" />
          <rect x="12" y="10" width="3" height="1" fill="#000" />
          <rect x="3" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="15" y="12" width="2" height="1" fill="#FF76A5" />
          <g class="coffee-cup">
            <rect x="8" y="11" width="5" height="5" fill="#E2E8F0" />
            <rect x="8" y="11" width="5" height="1" fill="#94A3B8" />
            <rect x="9" y="12" width="3" height="1" fill="#78350F" />
            <rect x="13" y="12" width="2" height="3" fill="none" stroke="#94A3B8" stroke-width="1" />
            <rect x="7" y="13" width="2" height="2" fill="#fff" />
            <rect x="12" y="13" width="2" height="2" fill="#fff" />
          </g>
          <g class="coffee-steam">
            <rect x="9" y="8" width="1" height="2" fill="#CBD5E1" opacity="0.8" />
            <rect x="11" y="7" width="1" height="3" fill="#CBD5E1" opacity="0.8" />
          </g>
        </g>

        <!-- 28. 弹奏吉他 GUITAR -->
        <g v-else-if="effectiveState === 'guitar'" key="guitar" class="cat-guitar">
          <g class="cat-tail-guitar">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
            <rect x="26" y="6" width="2" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="18" height="8" :fill="effectiveColor" />
          <rect x="5" y="9" width="2" height="2" fill="#000" />
          <rect x="13" y="9" width="2" height="2" fill="#000" />
          <rect x="5" y="9" width="1" height="1" fill="#fff" />
          <rect x="13" y="9" width="1" height="1" fill="#fff" />
          <rect x="8" y="11" width="3" height="1" fill="#000" />
          <g class="guitar-instrument">
            <rect x="1" y="9" width="2" height="2" fill="#B45309" />
            <rect x="3" y="10" width="6" height="2" fill="#D97706" />
            <rect x="9" y="9" width="6" height="6" fill="#DC2626" />
            <rect x="10" y="8" width="4" height="8" fill="#DC2626" />
            <circle cx="12" cy="12" r="1.5" fill="#18181B" />
            <rect x="3" y="11" width="10" height="0.5" fill="#FDE047" />
            <rect x="11" y="10" width="2" height="2" fill="#fff" class="strum-paw" />
            <rect x="4" y="11" width="2" height="2" fill="#fff" />
          </g>
          <g class="guitar-notes">
            <rect x="17" y="4" width="2" height="2" fill="#EC4899" />
            <rect x="19" y="3" width="1" height="3" fill="#EC4899" />
            <rect x="22" y="6" width="2" height="2" fill="#3B82F6" />
            <rect x="24" y="5" width="1" height="3" fill="#3B82F6" />
          </g>
        </g>

        <!-- 29. 困倦呵欠 SLEEPY -->
        <g v-else-if="effectiveState === 'sleepy'" key="sleepy" class="cat-sleepy">
          <rect x="22" y="13" width="4" height="2" :fill="effectiveColor" />
          <rect x="25" y="12" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="2" height="2" :fill="effectiveColor" />
          <rect x="12" y="8" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="19" height="7" :fill="effectiveColor" />
          <rect x="4" y="16" width="17" height="1" :fill="effectiveColor" />
          <rect x="5" y="10" width="3" height="1" fill="#000" />
          <rect x="12" y="10" width="3" height="1" fill="#000" />
          <g class="sleepy-tear">
            <rect x="4" y="11" width="1" height="2" fill="#38BDF8" />
          </g>
          <g class="yawn-mouth">
            <rect x="8" y="11" width="4" height="4" fill="#000" />
            <rect x="9" y="13" width="2" height="2" fill="#F43F5E" />
          </g>
          <g class="yawn-bubble">
            <circle cx="16" cy="7" r="1.5" fill="#A855F7" opacity="0.6" />
            <circle cx="19" cy="4" r="2.5" fill="#A855F7" opacity="0.75" />
          </g>
        </g>

        <!-- 30. 忍者潜行 NINJA -->
        <g v-else-if="effectiveState === 'ninja'" key="ninja" class="cat-ninja">
          <rect x="4" y="8" width="2" height="2" :fill="effectiveColor" />
          <rect x="12" y="8" width="2" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="18" height="7" :fill="effectiveColor" />
          <rect x="21" y="9" width="3" height="2" :fill="effectiveColor" />
          <rect x="23" y="7" width="2" height="3" :fill="effectiveColor" />
          <rect x="2" y="9" width="15" height="2" fill="#18181B" />
          <rect x="7" y="9" width="4" height="2" fill="#E4E4E7" />
          <g class="ninja-ribbon">
            <rect x="0" y="8" width="3" height="1" fill="#EF4444" />
            <rect x="1" y="7" width="2" height="1" fill="#EF4444" />
          </g>
          <rect x="5" y="11" width="3" height="1" fill="#FDE047" />
          <rect x="11" y="11" width="3" height="1" fill="#FDE047" />
          <rect x="6" y="11" width="1" height="1" fill="#000" />
          <rect x="12" y="11" width="1" height="1" fill="#000" />
          <g class="ninja-shuriken">
            <polygon points="18,12 21,11 20,14 23,13 20,15 21,17 18,15 16,16 17,14 15,13" fill="#94A3B8" />
          </g>
        </g>

        <!-- 31. 垂钓时光 FISHING -->
        <g v-else-if="effectiveState === 'fishing'" key="fishing" class="cat-fishing">
          <rect x="5" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="11" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="15" height="9" :fill="effectiveColor" />
          <rect x="6" y="9" width="2" height="2" fill="#000" />
          <rect x="11" y="9" width="2" height="2" fill="#000" />
          <rect x="6" y="9" width="1" height="1" fill="#fff" />
          <rect x="11" y="9" width="1" height="1" fill="#fff" />
          <g class="fishing-rod">
            <line x1="14" y1="12" x2="28" y2="4" stroke="#B45309" stroke-width="1.5" />
            <line x1="28" y1="4" x2="28" y2="14" stroke="#94A3B8" stroke-width="0.8" stroke-dasharray="2,1" />
            <rect x="27" y="13" width="2" height="2" fill="#EF4444" class="fishing-bobber" />
            <rect x="25" y="16" width="6" height="1" fill="#38BDF8" opacity="0.6" />
          </g>
          <g class="jumping-fish">
            <rect x="29" y="10" width="3" height="2" fill="#F97316" />
            <polygon points="32,9 34,11 32,13" fill="#F97316" />
          </g>
        </g>

        <!-- 32. 施展魔法 MAGIC -->
        <g v-else-if="effectiveState === 'magic'" key="magic" class="cat-magic">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
          </g>
          <g class="wizard-hat">
            <polygon points="4,7 16,7 10,1" fill="#4C1D95" />
            <rect x="3" y="6" width="14" height="2" fill="#6D28D9" />
            <polygon points="10,1 12,0 12,2" fill="#FDE047" />
          </g>
          <rect x="3" y="8" width="18" height="8" :fill="effectiveColor" />
          <rect x="6" y="10" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="2" fill="#000" />
          <rect x="6" y="10" width="1" height="1" fill="#fff" />
          <rect x="13" y="10" width="1" height="1" fill="#fff" />
          <g class="magic-wand">
            <line x1="15" y1="13" x2="26" y2="4" stroke="#78350F" stroke-width="1.5" />
            <circle cx="27" cy="3" r="2.5" fill="#38BDF8" />
          </g>
          <g class="magic-sparkles">
            <rect x="24" y="0" width="2" height="2" fill="#FDE047" />
            <rect x="30" y="3" width="2" height="2" fill="#EC4899" />
            <rect x="27" y="7" width="1" height="1" fill="#A855F7" />
            <rect x="22" y="2" width="1" height="1" fill="#38BDF8" />
          </g>
        </g>

        <!-- 33. 雨中漫步 UMBRELLA -->
        <g v-else-if="effectiveState === 'umbrella'" key="umbrella" class="cat-umbrella">
          <g class="umbrella-item">
            <path d="M4,7 Q14,1 24,7 Z" fill="#10B981" />
            <rect x="3" y="7" width="22" height="1" fill="#059669" />
            <line x1="14" y1="7" x2="14" y2="14" stroke="#92400E" stroke-width="1.5" />
            <path d="M14,14 Q14,16 12,16" fill="none" stroke="#92400E" stroke-width="1.2" />
          </g>
          <rect x="7" y="9" width="2" height="2" :fill="effectiveColor" />
          <rect x="15" y="9" width="2" height="2" :fill="effectiveColor" />
          <rect x="6" y="11" width="14" height="6" :fill="effectiveColor" />
          <rect x="8" y="12" width="2" height="2" fill="#000" />
          <rect x="14" y="12" width="2" height="2" fill="#000" />
          <rect x="8" y="12" width="1" height="1" fill="#fff" />
          <rect x="14" y="12" width="1" height="1" fill="#fff" />
          <rect x="12" y="13" width="3" height="2" fill="#fff" />
          <g class="rain-drops">
            <rect x="2" y="4" width="1" height="2" fill="#60A5FA" />
            <rect x="26" y="5" width="1" height="2" fill="#60A5FA" />
            <rect x="1" y="12" width="1" height="2" fill="#60A5FA" />
            <rect x="28" y="11" width="1" height="2" fill="#60A5FA" />
          </g>
        </g>

        <!-- 34. 发射爱心 HEART -->
        <g v-else-if="effectiveState === 'heart'" key="heart" class="cat-heart">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="18" height="8" :fill="effectiveColor" />
          <path d="M5,10 Q6.5,8.5 8,10" fill="none" stroke="#000" stroke-width="1.2" />
          <path d="M12,10 Q13.5,8.5 15,10" fill="none" stroke="#000" stroke-width="1.2" />
          <rect x="4" y="11" width="3" height="2" fill="#FB7185" />
          <rect x="13" y="11" width="3" height="2" fill="#FB7185" />
          <rect x="8" y="13" width="2" height="2" fill="#fff" />
          <rect x="11" y="13" width="2" height="2" fill="#fff" />
          <g class="floating-heart-stream">
            <path d="M18,6 A2,2 0 0,1 21,6 A2,2 0 0,1 24,6 Q24,9 21,11 Q18,9 18,6 Z" fill="#F43F5E" class="heart-big" />
            <path d="M25,2 A1.5,1.5 0 0,1 27,2 A1.5,1.5 0 0,1 29,2 Q29,4 27,5 Q25,4 25,2 Z" fill="#FB7185" class="heart-small" />
          </g>
        </g>

        <!-- 35. 举重健身 WORKOUT -->
        <g v-else-if="effectiveState === 'workout'" key="workout" class="cat-workout">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="12" height="2" fill="#EF4444" />
          <rect x="4" y="7" width="12" height="1" fill="#fff" opacity="0.6" />
          <rect x="3" y="9" width="16" height="8" :fill="effectiveColor" />
          <rect x="5" y="11" width="2" height="1" fill="#000" />
          <rect x="11" y="11" width="2" height="1" fill="#000" />
          <rect x="14" y="9" width="1" height="2" fill="#38BDF8" class="sweat-drop" />
          <g class="dumbbell-l">
            <rect x="1" y="9" width="2" height="4" fill="#334155" />
            <rect x="3" y="10" width="2" height="2" fill="#64748B" />
            <rect x="4" y="10" width="2" height="2" fill="#fff" />
          </g>
          <g class="dumbbell-r">
            <rect x="17" y="9" width="2" height="2" fill="#64748B" />
            <rect x="19" y="9" width="2" height="4" fill="#334155" />
            <rect x="16" y="10" width="2" height="2" fill="#fff" />
          </g>
        </g>

        <!-- 36. DJ打碟 DJ -->
        <g v-else-if="effectiveState === 'dj'" key="dj" class="cat-dj">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="12" height="9" :fill="effectiveColor" />
          <g class="dj-headphones">
            <path d="M2,9 Q10,2 18,9" fill="none" stroke="#EF4444" stroke-width="1.8" />
            <rect x="1" y="8" width="3" height="4" rx="1" fill="#1E293B" />
            <rect x="16" y="8" width="3" height="4" rx="1" fill="#1E293B" />
          </g>
          <rect x="5" y="9" width="10" height="2" fill="#06B6D4" />
          <g class="dj-deck">
            <rect x="0" y="14" width="26" height="5" fill="#0F172A" />
            <circle cx="5" cy="16" r="3" fill="#18181B" stroke="#64748B" stroke-width="0.8" class="vinyl-l" />
            <circle cx="16" cy="16" r="3" fill="#18181B" stroke="#64748B" stroke-width="0.8" class="vinyl-r" />
            <rect x="4" y="14" width="2" height="2" fill="#fff" class="scratch-hand-l" />
            <rect x="15" y="14" width="2" height="2" fill="#fff" class="scratch-hand-r" />
            <rect x="22" y="15" width="1" height="3" fill="#10B981" class="eq-bar-1" />
            <rect x="24" y="14" width="1" height="4" fill="#F59E0B" class="eq-bar-2" />
          </g>
        </g>

        <!-- 37. 料理大厨 CHEF -->
        <g v-else-if="effectiveState === 'chef'" key="chef" class="cat-chef">
          <rect x="5" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="7" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="15" height="8" :fill="effectiveColor" />
          <g class="chef-hat">
            <rect x="6" y="6" width="9" height="2" fill="#E2E8F0" />
            <rect x="5" y="2" width="11" height="4" fill="#FFFFFF" />
            <circle cx="6" cy="2" r="2" fill="#FFFFFF" />
            <circle cx="10.5" cy="1" r="2.5" fill="#FFFFFF" />
            <circle cx="15" cy="2" r="2" fill="#FFFFFF" />
          </g>
          <rect x="6" y="10" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="2" fill="#000" />
          <rect x="6" y="10" width="1" height="1" fill="#fff" />
          <rect x="13" y="10" width="1" height="1" fill="#fff" />
          <g class="chef-pan">
            <rect x="16" y="12" width="6" height="2" fill="#18181B" />
            <ellipse cx="25" cy="13" rx="5" ry="2.5" fill="#334155" stroke="#18181B" stroke-width="0.8" />
            <rect x="14" y="11" width="3" height="2" fill="#fff" />
          </g>
          <g class="tossing-food">
            <ellipse cx="25" cy="7" rx="2.5" ry="1.5" fill="#FBBF24" />
            <circle cx="25" cy="7" r="0.8" fill="#F97316" />
          </g>
        </g>

        <!-- 38. 太空宇航 SPACE -->
        <g v-else-if="effectiveState === 'space'" key="space" class="cat-space">
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="8" width="16" height="8" :fill="effectiveColor" />
          <rect x="3" y="14" width="3" height="2" fill="#E2E8F0" />
          <rect x="16" y="14" width="3" height="2" fill="#E2E8F0" />
          <g class="space-helmet">
            <circle cx="10" cy="9" r="6.5" fill="rgba(56, 189, 248, 0.2)" stroke="#94A3B8" stroke-width="1.2" />
            <path d="M6,6 Q10,4 14,6" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.8" />
          </g>
          <rect x="7" y="9" width="2" height="2" fill="#000" />
          <rect x="12" y="9" width="2" height="2" fill="#000" />
          <rect x="7" y="9" width="1" height="1" fill="#fff" />
          <rect x="12" y="9" width="1" height="1" fill="#fff" />
          <path d="M20,12 Q24,16 28,11 T34,14" fill="none" stroke="#64748B" stroke-width="1" class="space-tether" />
          <g class="space-planet">
            <circle cx="28" cy="4" r="2" fill="#F59E0B" />
            <ellipse cx="28" cy="4" rx="4" ry="1" fill="none" stroke="#FDE047" stroke-width="0.6" />
          </g>
        </g>

        <!-- 默认兜底 DEFAULT FALLBACK (无论传入何种意外状态，绝不空白) -->
        <g v-else key="fallback" class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="effectiveColor" />
            <rect x="24" y="8" width="3" height="3" :fill="effectiveColor" />
            <rect x="26" y="7" width="2" height="2" :fill="effectiveColor" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="13" y="6" width="2" height="2" :fill="effectiveColor" />
          <rect x="4" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="12" y="7" width="4" height="2" :fill="effectiveColor" />
          <rect x="3" y="8" width="14" height="2" :fill="effectiveColor" />
          <rect x="3" y="9" width="17" height="2" :fill="effectiveColor" />
          <rect x="2" y="10" width="19" height="2" :fill="effectiveColor" />
          <rect x="2" y="11" width="21" height="4" :fill="effectiveColor" />
          <rect x="3" y="15" width="19" height="2" :fill="effectiveColor" />
          <rect x="5" y="10" width="2" height="2" fill="#000" />
          <rect x="12" y="10" width="2" height="2" fill="#000" />
          <rect x="5" y="10" width="1" height="1" fill="#fff" />
          <rect x="12" y="10" width="1" height="1" fill="#fff" />
          <rect x="8" y="12" width="3" height="1" fill="#000" />
          <rect x="9" y="13" width="1" height="1" fill="#000" />
          <rect x="3" y="12" width="2" height="1" fill="#FF76A5" />
          <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
        </g>
      </Transition>
    </svg>
  </div>
</template>

<style scoped>
.tx-miko {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: filter 0.2s ease, transform 0.15s ease;
}

.tx-miko svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* 动作平滑过渡 */
.miko-state-enter-active,
.miko-state-leave-active {
  transition: opacity 0.22s ease-in-out;
}
.miko-state-enter-from,
.miko-state-leave-to {
  opacity: 0;
}

/* 交互状态反馈：hover 仅柔和提亮增加光晕，严格不放大 */
.tx-miko.is-interactive {
  cursor: pointer;
}
.tx-miko.is-interactive:hover {
  filter: brightness(1.08) drop-shadow(0 2px 10px rgba(129, 13, 198, 0.32));
}
.tx-miko.is-interactive:active,
.tx-miko.is-clicked {
  transform: translateY(1.5px);
}

/* 闪光恶魔专属辉光与悬浮 */
.tx-miko.is-demon {
  filter: drop-shadow(0 2px 12px rgba(239, 68, 68, 0.55));
  animation: demonLevitate 2.4s ease-in-out infinite;
}

@keyframes demonLevitate {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* 漂浮爱心气泡 */
.miko-floating-particle {
  position: absolute;
  top: -12px;
  right: 12px;
  pointer-events: none;
  animation: floatUpParticle 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes floatUpParticle {
  0% { transform: translateY(0) scale(0.6); opacity: 0; }
  30% { transform: translateY(-6px) scale(1.2); opacity: 1; }
  100% { transform: translateY(-18px) scale(0.9); opacity: 0; }
}

/* 闪光恶魔光爆 */
.miko-demon-burst {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  animation: demonBurstZoom 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes demonBurstZoom {
  0% { transform: translateX(-50%) scale(0.2) rotate(0deg); opacity: 0; }
  40% { transform: translateX(-50%) scale(1.3) rotate(45deg); opacity: 1; }
  100% { transform: translateX(-50%) scale(1.6) rotate(90deg); opacity: 0; }
}

/* 1. 待命 IDLE */
@keyframes tailWag {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(10deg); }
}
@keyframes blinkEye {
  0%, 94%, 100% { transform: scaleY(1); }
  97% { transform: scaleY(0.1); }
}
@keyframes idleBreathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(0.5px); }
}
.state-idle .cat-tail {
  transform-origin: 23px 12px;
  animation: tailWag 2.6s ease-in-out infinite;
}
.state-idle .cat-eyes {
  transform-origin: 9px 12px;
  animation: blinkEye 4.2s infinite;
}
.state-idle .cat-body {
  animation: idleBreathe 3s ease-in-out infinite;
}

/* 2. 打字 WORKING */
@keyframes bongoPawLeft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes bongoPawRight {
  0%, 100% { transform: translateY(-2px); }
  50% { transform: translateY(0); }
}
@keyframes fastTail {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(15deg); }
}
.state-working .paw-l { animation: bongoPawLeft 0.18s ease-in-out infinite; }
.state-working .paw-r { animation: bongoPawRight 0.18s ease-in-out infinite; }
.state-working .cat-tail {
  transform-origin: 24px 12px;
  animation: fastTail 0.4s ease-in-out infinite;
}

/* 3. 思考 THINKING */
@keyframes sparkPulse {
  0%, 100% { transform: scale(0.85); opacity: 0.5; }
  50% { transform: scale(1.15); opacity: 1; }
}
@keyframes thinkFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}
.state-thinking .cat-sparkle {
  transform-origin: 19px 3px;
  animation: sparkPulse 1.2s ease-in-out infinite;
}
.state-thinking .cat-body { animation: thinkFloat 2s ease-in-out infinite; }

/* 4. 成功喜悦 SUCCESS */
@keyframes happyJump {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-3px); }
  60% { transform: translateY(-3px); }
}
@keyframes tailHappy {
  0%, 100% { transform: rotate(-10deg); }
  50% { transform: rotate(20deg); }
}
.state-success .cat-body { animation: happyJump 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
.state-success .cat-tail {
  transform-origin: 24px 11px;
  animation: tailHappy 0.3s ease-in-out infinite;
}

/* 5. 警觉确认 ALERT */
@keyframes alertPulse {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
.state-alert .cat-alert-mark { animation: alertPulse 0.6s ease-in-out infinite; }

/* 6. 异常报错 ERROR */
@keyframes errorShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1px); }
  75% { transform: translateX(1px); }
}
.state-error .cat-body { animation: errorShake 0.15s ease-in-out infinite; }

/* 7. 休眠蜷缩 SLEEPING */
@keyframes sleepBreathe {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.92); }
}
@keyframes zzzFloat {
  0% { transform: translate(0, 0); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translate(2px, -4px); opacity: 0; }
}
.state-sleeping .cat-body {
  transform-origin: 14px 16px;
  animation: sleepBreathe 3.5s ease-in-out infinite;
}
.state-sleeping .cat-zzz { animation: zzzFloat 2.4s ease-out infinite; }

/* 8. 多任务 JUGGLING */
@keyframes juggleOrbit1 {
  0% { transform: translate(0, 0); }
  33% { transform: translate(6px, -2px); }
  66% { transform: translate(12px, 2px); }
  100% { transform: translate(0, 0); }
}
@keyframes juggleOrbit2 {
  0% { transform: translate(0, 0); }
  33% { transform: translate(6px, 2px); }
  66% { transform: translate(-8px, -1px); }
  100% { transform: translate(0, 0); }
}
@keyframes juggleOrbit3 {
  0% { transform: translate(0, 0); }
  33% { transform: translate(-10px, -2px); }
  66% { transform: translate(-5px, 2px); }
  100% { transform: translate(0, 0); }
}
.state-juggling .juggle-ball-1 { animation: juggleOrbit1 0.9s linear infinite; }
.state-juggling .juggle-ball-2 { animation: juggleOrbit2 0.9s linear infinite; }
.state-juggling .juggle-ball-3 { animation: juggleOrbit3 0.9s linear infinite; }

/* 9. 扫地 SWEEPING */
@keyframes sweepBroom {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-15deg); }
}
.state-sweeping .broom {
  transform-origin: 2px 14px;
  animation: sweepBroom 0.6s ease-in-out infinite;
}

/* 10. 研读 READING */
@keyframes glanceEyes {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(1px); }
}
.state-reading .glasses { animation: glanceEyes 1.8s ease-in-out infinite; }

/* 11. 眩晕 DIZZY */
@keyframes dizzyTilt {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
@keyframes dizzyStars {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.state-dizzy .cat-body {
  transform-origin: 12px 14px;
  animation: dizzyTilt 0.8s ease-in-out infinite;
}
.state-dizzy .dizzy-stars {
  transform-origin: 13px 3px;
  animation: dizzyStars 2s linear infinite;
}

/* 12. 探头 PEEKING */
@keyframes peekRise {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes peekLook {
  0%, 100% { transform: translateX(0); }
  30% { transform: translateX(-1.5px); }
  70% { transform: translateX(1.5px); }
}
.state-peeking .cat-peek { animation: peekRise 2.8s ease-in-out infinite; }
.state-peeking .peek-eyes { animation: peekLook 2.8s ease-in-out infinite; }

/* 13. 猫式伸懒腰 STRETCHING */
@keyframes stretchBody {
  0%, 100% { transform: scaleX(1) translateY(0); }
  50% { transform: scaleX(1.06) translateY(0.5px); }
}
@keyframes stretchTail {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(8deg); }
}
.state-stretching .cat-stretch {
  transform-origin: 20px 16px;
  animation: stretchBody 2.8s ease-in-out infinite;
}
.state-stretching .cat-tail-stretch {
  transform-origin: 23px 8px;
  animation: stretchTail 2.8s ease-in-out infinite;
}

/* 14. 舔爪洗脸 BATHING */
@keyframes pawBath {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1px, -2px); }
  50% { transform: translate(-2px, 0); }
  75% { transform: translate(-1px, 1px); }
}
.state-bathing .paw-bath {
  transform-origin: 14px 11px;
  animation: pawBath 0.7s ease-in-out infinite;
}

/* 15. 好奇歪头 CURIOUS */
@keyframes curiousHeadTilt {
  0%, 100% { transform: rotate(12deg); }
  50% { transform: rotate(-8deg); }
}
@keyframes questionBob {
  0%, 100% { transform: translateY(0); opacity: 0.75; }
  50% { transform: translateY(-2px); opacity: 1; }
}
.state-curious .curious-head {
  transform-origin: 10px 13px;
  animation: curiousHeadTilt 2.2s ease-in-out infinite;
}
.state-curious .question-mark {
  animation: questionBob 1.4s ease-in-out infinite;
}

/* 16. 磨爪挠挠 SCRATCHING */
@keyframes scratchPawLeft {
  0%, 100% { transform: translateY(-1.5px); }
  50% { transform: translateY(1.5px); }
}
@keyframes scratchPawRight {
  0%, 100% { transform: translateY(1.5px); }
  50% { transform: translateY(-1.5px); }
}
@keyframes scratchSpark {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.state-scratching .scratch-paw-1 { animation: scratchPawLeft 0.16s ease-in-out infinite; }
.state-scratching .scratch-paw-2 { animation: scratchPawRight 0.16s ease-in-out infinite; }
.state-scratching .scratch-spark { animation: scratchSpark 0.16s ease-in-out infinite; }

/* 17. 呼噜治愈 PURRING */
@keyframes purrVibrate {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(0.4px, -0.4px); }
  50% { transform: translate(-0.4px, 0.4px); }
  75% { transform: translate(0.4px, 0.4px); }
}
@keyframes purrFloatNote {
  0% { transform: translateY(0) scale(0.8); opacity: 0; }
  40% { opacity: 1; }
  100% { transform: translateY(-5px) scale(1.1); opacity: 0; }
}
.state-purring .cat-purr { animation: purrVibrate 0.15s linear infinite; }
.state-purring .purr-note-1 { animation: purrFloatNote 1.8s ease-out infinite; }
.state-purring .purr-heart { animation: purrFloatNote 2.2s ease-out 0.8s infinite; }

/* 18. 吃小鱼干 EATING */
@keyframes chewJaw {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(1px); }
}
@keyframes fishWiggle {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-5deg); }
}
.state-eating .chewing-jaw { animation: chewJaw 0.3s ease-in-out infinite; }
.state-eating .tasty-fish {
  transform-origin: 10px 13px;
  animation: fishWiggle 0.6s ease-in-out infinite;
}

/* 19. 节拍摇摆 DANCING */
@keyframes danceSway {
  0%, 100% { transform: rotate(-6deg) translateY(0); }
  50% { transform: rotate(6deg) translateY(-1.5px); }
}
@keyframes danceTailSway {
  0%, 100% { transform: rotate(15deg); }
  50% { transform: rotate(-15deg); }
}
.state-dancing .cat-dance {
  transform-origin: 12px 16px;
  animation: danceSway 0.6s ease-in-out infinite;
}
.state-dancing .cat-tail-dance {
  transform-origin: 23px 11px;
  animation: danceTailSway 0.6s ease-in-out infinite;
}

/* 20. 打call应援 CHEERING */
@keyframes cheerWaveStickL {
  0%, 100% { transform: rotate(-18deg); }
  50% { transform: rotate(15deg); }
}
@keyframes cheerWaveStickR {
  0%, 100% { transform: rotate(18deg); }
  50% { transform: rotate(-15deg); }
}
@keyframes cheerBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
.state-cheering .cat-cheer { animation: cheerBounce 0.45s ease-in-out infinite; }
.state-cheering .glowstick-pink {
  transform-origin: 2px 8px;
  animation: cheerWaveStickL 0.45s ease-in-out infinite;
}
.state-cheering .glowstick-cyan {
  transform-origin: 23px 8px;
  animation: cheerWaveStickR 0.45s ease-in-out infinite;
}

/* 21. 专注打机 GAMING */
@keyframes buttonMashL {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(1px); }
}
@keyframes buttonMashR {
  0%, 100% { transform: translateY(1px); }
  50% { transform: translateY(0); }
}
.state-gaming .gamepad {
  animation: buttonMashL 0.12s linear infinite;
}

/* 22. 极客超频 HACKING */
@keyframes matrixFlicker {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes hyperPaws {
  0%, 100% { transform: translateY(-1px); }
  50% { transform: translateY(1px); }
}
.state-hacking .hack-matrix { animation: matrixFlicker 0.2s steps(2) infinite; }
.state-hacking .hack-paws { animation: hyperPaws 0.12s linear infinite; }

/* 23. 撒花庆祝 CELEBRATING */
@keyframes celebrateHop {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3.5px); }
}
@keyframes confettiFall {
  0% { transform: translateY(-3px) rotate(0deg); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translateY(10px) rotate(180deg); opacity: 0; }
}
.state-celebrating .cat-celebrate { animation: celebrateHop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
.state-celebrating .confetti-stream { animation: confettiFall 0.9s linear infinite; }

/* 24. 纸箱猫猫 BOX */
@keyframes boxHideSeek {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(3px); }
  60% { transform: translateY(3px); }
  80% { transform: translateY(-0.5px); }
}
.state-box .box-peeker { animation: boxHideSeek 3.6s ease-in-out infinite; }

/* 25. 奔跑 RUNNING */
@keyframes runGallop {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-2px) rotate(-2deg); }
}
@keyframes runPawFrontL {
  0%, 100% { transform: translate(1px, -2px); }
  50% { transform: translate(-2px, 1px); }
}
@keyframes runPawFrontR {
  0%, 100% { transform: translate(-2px, 1px); }
  50% { transform: translate(2px, -2px); }
}
@keyframes runPawBackL {
  0%, 100% { transform: translate(-2px, 1px); }
  50% { transform: translate(2px, -2px); }
}
@keyframes runPawBackR {
  0%, 100% { transform: translate(2px, -2px); }
  50% { transform: translate(-1px, 1px); }
}
@keyframes runTailWave {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-8deg); }
}
@keyframes dustPuff {
  0%, 100% { opacity: 0.2; transform: translateX(0); }
  50% { opacity: 0.9; transform: translateX(2px); }
}
.state-running .cat-running { animation: runGallop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
.state-running .running-paw-fl { animation: runPawFrontL 0.22s linear infinite; }
.state-running .running-paw-fr { animation: runPawFrontR 0.22s linear infinite; }
.state-running .running-paw-bl { animation: runPawBackL 0.22s linear infinite; }
.state-running .running-paw-br { animation: runPawBackR 0.22s linear infinite; }
.state-running .running-tail {
  transform-origin: 23px 10px;
  animation: runTailWave 0.22s ease-in-out infinite;
}
.state-running .running-dust { animation: dustPuff 0.22s linear infinite; }

/* 26. 闪光恶魔 DEMON */
@keyframes demonWingFlapL {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-18deg) translateY(-1px); }
}
@keyframes demonWingFlapR {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(18deg) translateY(-1px); }
}
@keyframes demonTailSwish {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(16deg); }
}
@keyframes demonSparkleGlint {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.2); }
}
.state-demon .demon-wing-l {
  transform-origin: 3px 8px;
  animation: demonWingFlapL 0.35s ease-in-out infinite;
}
.state-demon .demon-wing-r {
  transform-origin: 20px 8px;
  animation: demonWingFlapR 0.35s ease-in-out infinite;
}
.state-demon .demon-tail {
  transform-origin: 22px 10px;
  animation: demonTailSwish 0.6s ease-in-out infinite;
}
.state-demon .demon-sparkles { animation: demonSparkleGlint 0.8s ease-in-out infinite; }
/* 27. 品尝咖啡 COFFEE */
@keyframes coffeeSteamUp {
  0% { transform: translateY(0); opacity: 0.2; }
  50% { opacity: 0.8; }
  100% { transform: translateY(-4px); opacity: 0; }
}
@keyframes sipBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.8px); }
}
.state-coffee .coffee-steam { animation: coffeeSteamUp 1.6s ease-out infinite; }
.state-coffee .cat-coffee { animation: sipBob 2.4s ease-in-out infinite; }

/* 28. 弹奏吉他 GUITAR */
@keyframes guitarStrum {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(1.5px) rotate(-10deg); }
}
@keyframes guitarSway {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
@keyframes noteFloat {
  0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translate(2px, -6px) scale(1.1); opacity: 0; }
}
.state-guitar .strum-paw { animation: guitarStrum 0.18s ease-in-out infinite; }
.state-guitar .cat-guitar { transform-origin: 12px 14px; animation: guitarSway 0.6s ease-in-out infinite; }
.state-guitar .guitar-notes { animation: noteFloat 1.2s ease-out infinite; }

/* 29. 困倦呵欠 SLEEPY */
@keyframes yawnScale {
  0%, 100% { transform: scale(1); }
  45% { transform: scale(1.08) translateY(-1px); }
  75% { transform: scale(0.96) translateY(0.5px); }
}
@keyframes bubbleFloat {
  0% { transform: translateY(0) scale(0.8); opacity: 0; }
  40% { opacity: 0.8; }
  100% { transform: translateY(-5px) scale(1.2); opacity: 0; }
}
.state-sleepy .cat-sleepy { transform-origin: 10px 14px; animation: yawnScale 3.2s ease-in-out infinite; }
.state-sleepy .yawn-bubble { animation: bubbleFloat 2.4s ease-out infinite; }

/* 30. 忍者潜行 NINJA */
@keyframes ninjaFlicker {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2.5px); }
  75% { transform: translateX(2.5px); }
}
@keyframes ribbonWave {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-20deg) scaleX(1.1); }
}
@keyframes shurikenSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.state-ninja .cat-ninja { animation: ninjaFlicker 1.8s ease-in-out infinite; }
.state-ninja .ninja-ribbon { transform-origin: 2px 8px; animation: ribbonWave 0.4s ease-in-out infinite; }
.state-ninja .ninja-shuriken { transform-origin: 19px 14px; animation: shurikenSpin 0.35s linear infinite; }

/* 31. 垂钓时光 FISHING */
@keyframes bobberBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(1.5px); }
}
@keyframes fishLeap {
  0%, 100% { transform: translate(0, 4px) rotate(20deg); opacity: 0; }
  40%, 60% { transform: translate(-2px, -3px) rotate(-15deg); opacity: 1; }
  80% { transform: translate(-4px, 4px) rotate(45deg); opacity: 0; }
}
.state-fishing .fishing-bobber { animation: bobberBob 1.2s ease-in-out infinite; }
.state-fishing .jumping-fish { transform-origin: 31px 11px; animation: fishLeap 2.6s ease-in-out infinite; }

/* 32. 施展魔法 MAGIC */
@keyframes wandWave {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-12deg); }
}
@keyframes magicBurst {
  0%, 100% { transform: scale(0.8) rotate(0deg); opacity: 0.4; }
  50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
}
.state-magic .magic-wand { transform-origin: 15px 13px; animation: wandWave 0.8s ease-in-out infinite; }
.state-magic .magic-sparkles { transform-origin: 26px 4px; animation: magicBurst 1.2s linear infinite; }

/* 33. 雨中漫步 UMBRELLA */
@keyframes umbrellaTilt {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
}
@keyframes rainDropFall {
  0% { transform: translateY(-4px); opacity: 0; }
  40% { opacity: 0.9; }
  100% { transform: translateY(8px); opacity: 0; }
}
.state-umbrella .umbrella-item { transform-origin: 14px 14px; animation: umbrellaTilt 2.2s ease-in-out infinite; }
.state-umbrella .rain-drops { animation: rainDropFall 0.8s linear infinite; }

/* 34. 发射爱心 HEART */
@keyframes heartPulseStream {
  0% { transform: scale(0.6) translate(-2px, 2px); opacity: 0; }
  40% { opacity: 1; transform: scale(1) translate(0, 0); }
  100% { transform: scale(1.3) translate(4px, -6px); opacity: 0; }
}
@keyframes bodyHeartBob {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04) translateY(-1px); }
}
.state-heart .floating-heart-stream { animation: heartPulseStream 1.4s ease-out infinite; }
.state-heart .cat-heart { transform-origin: 10px 14px; animation: bodyHeartBob 0.7s ease-in-out infinite; }

/* 35. 举重健身 WORKOUT */
@keyframes liftWeights {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes sweatGlint {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; transform: translateY(1px); }
}
.state-workout .dumbbell-l,
.state-workout .dumbbell-r { animation: liftWeights 0.8s ease-in-out infinite; }
.state-workout .sweat-drop { animation: sweatGlint 0.8s ease-in-out infinite; }

/* 36. DJ打碟 DJ */
@keyframes vinylSpinL {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes vinylSpinR {
  0% { transform: rotate(360deg); }
  100% { transform: rotate(0deg); }
}
@keyframes scratchHandMove {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  75% { transform: translate(1px, 0); }
}
@keyframes eqDance {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1.2); }
}
.state-dj .vinyl-l { transform-origin: 5px 16px; animation: vinylSpinL 0.6s linear infinite; }
.state-dj .vinyl-r { transform-origin: 16px 16px; animation: vinylSpinR 0.6s linear infinite; }
.state-dj .scratch-hand-l { animation: scratchHandMove 0.15s linear infinite; }
.state-dj .scratch-hand-r { animation: scratchHandMove 0.18s linear infinite; }
.state-dj .eq-bar-1 { transform-origin: 22px 18px; animation: eqDance 0.25s ease-in-out infinite; }
.state-dj .eq-bar-2 { transform-origin: 24px 18px; animation: eqDance 0.3s ease-in-out infinite 0.1s; }

/* 37. 料理大厨 CHEF */
@keyframes panToss {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  35% { transform: rotate(-5deg) translateY(-1.5px); }
  50% { transform: rotate(3deg) translateY(0.5px); }
}
@keyframes foodFlip {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-7px) rotate(180deg); }
}
.state-chef .chef-pan { transform-origin: 14px 13px; animation: panToss 1.4s ease-in-out infinite; }
.state-chef .tossing-food { transform-origin: 25px 7px; animation: foodFlip 1.4s ease-in-out infinite; }

/* 38. 太空宇航 SPACE */
@keyframes zeroGravityFloat {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-3px) rotate(3deg); }
}
@keyframes tetherWave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.15) translateY(-1px); }
}
@keyframes planetOrbit {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(1.5px); }
}
.state-space .cat-space { transform-origin: 12px 12px; animation: zeroGravityFloat 3.6s ease-in-out infinite; }
.state-space .space-tether { animation: tetherWave 2.8s ease-in-out infinite; }
.state-space .space-planet { animation: planetOrbit 3s ease-in-out infinite; }
</style>
