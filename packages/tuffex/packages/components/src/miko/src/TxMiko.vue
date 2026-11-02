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
})

const emit = defineEmits<MikoEmits>()

const reactionState = ref<MikoState | null>(null)
const randomState = ref<MikoState | null>(null)
const isClicked = ref(false)
const showFloatingHeart = ref(false)
let clickTimer: ReturnType<typeof setTimeout> | null = null
let clickCount = 0
let clickCountResetTimer: ReturnType<typeof setTimeout> | null = null
let randomTimer: ReturnType<typeof setTimeout> | null = null

const CASUAL_RANDOM_STATES: MikoState[] = [
  'idle',
  'stretching',
  'curious',
  'bathing',
  'purring',
  'box',
  'sleeping',
  'peeking',
  'reading',
  'eating',
  'dancing',
]

const CLICK_REACTIONS: MikoState[] = [
  'celebrating',
  'cheering',
  'success',
  'purring',
  'curious',
  'stretching',
]

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

const currentLabel = computed(() => mergedLabels.value[effectiveState.value] || effectiveState.value)
const computedAriaLabel = computed(() => props.ariaLabel || `Miko: ${currentLabel.value}`)

const rootStyle = computed<CSSProperties>(() => {
  const s = props.size
  let width = '72px'
  let height = '48px'

  if (typeof s === 'number') {
    width = `${s * 1.5}px`
    height = `${s}px`
  }
  else if (s === 'xs') {
    width = '36px'
    height = '24px'
  }
  else if (s === 'sm') {
    width = '48px'
    height = '32px'
  }
  else if (s === 'md') {
    width = '72px'
    height = '48px'
  }
  else if (s === 'lg') {
    width = '96px'
    height = '64px'
  }
  else if (typeof s === 'string') {
    width = s
    height = 'auto'
  }

  return {
    width,
    height,
    '--tx-miko-body-color': props.color,
  }
})

function scheduleRandomState() {
  if (!props.random)
    return
  if (randomTimer)
    clearTimeout(randomTimer)

  const jitter = (Math.random() - 0.5) * 2000
  const delay = Math.max(2500, props.randomInterval + jitter)

  randomTimer = setTimeout(() => {
    if (reactionState.value || (props.state && props.state !== 'idle')) {
      scheduleRandomState()
      return
    }

    const available = CASUAL_RANDOM_STATES.filter(s => s !== randomState.value)
    const next = available[Math.floor(Math.random() * available.length)]
    randomState.value = next
    emit('stateChange', next)
    emit('update:state', next)

    scheduleRandomState()
  }, delay)
}

function triggerReaction(state: MikoState, duration = 1800) {
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
  }, 350)
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

  const randomReaction = CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)]
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

    <svg viewBox="0 0 36 24" shape-rendering="crispEdges">
      <!-- 1. 待命 IDLE -->
      <g v-if="effectiveState === 'idle'" class="cat-body">
        <g class="cat-tail">
          <rect x="23" y="10" width="3" height="2" :fill="color" />
          <rect x="24" y="8" width="3" height="3" :fill="color" />
          <rect x="23" y="7" width="2" height="2" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="14" height="2" :fill="color" />
        <rect x="3" y="9" width="17" height="2" :fill="color" />
        <rect x="2" y="10" width="20" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <g class="cat-eyes">
          <rect x="5" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
        </g>
        <rect x="8" y="13" width="1" height="1" fill="#000" />
        <rect x="10" y="13" width="1" height="1" fill="#000" />
        <rect x="9" y="14" width="1" height="1" fill="#000" />
      </g>

      <!-- 2. 执行打字 WORKING -->
      <g v-else-if="effectiveState === 'working'" class="cat-body">
        <g class="cat-tail">
          <rect x="24" y="7" width="2" height="5" :fill="color" />
          <rect x="25" y="5" width="3" height="3" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="14" height="2" :fill="color" />
        <rect x="3" y="9" width="18" height="2" :fill="color" />
        <rect x="2" y="10" width="21" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
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
          <rect x="4" y="15" width="2" height="1" :fill="color" />
        </g>
        <g class="paw-r">
          <rect x="9" y="14" width="2" height="2" fill="#fff" />
          <rect x="9" y="15" width="2" height="1" :fill="color" />
        </g>
      </g>

      <!-- 3. 思考灵感 THINKING -->
      <g v-else-if="effectiveState === 'thinking'" class="cat-body">
        <g class="cat-tail">
          <rect x="24" y="8" width="2" height="4" :fill="color" />
          <rect x="25" y="6" width="3" height="3" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="14" height="2" :fill="color" />
        <rect x="3" y="9" width="17" height="2" :fill="color" />
        <rect x="2" y="10" width="21" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <!-- 向上看的大眼睛 -->
        <rect x="5" y="10" width="2" height="2" fill="#000" />
        <rect x="13" y="10" width="2" height="2" fill="#000" />
        <!-- 灵感灯泡/星火 -->
        <g class="cat-sparkle">
          <rect x="18" y="2" width="3" height="3" fill="#FFD700" />
          <rect x="19" y="1" width="1" height="5" fill="#FFD700" />
          <rect x="17" y="3" width="5" height="1" fill="#FFD700" />
        </g>
      </g>

      <!-- 4. 成功喜悦 SUCCESS -->
      <g v-else-if="effectiveState === 'success'" class="cat-body">
        <g class="cat-tail">
          <rect x="24" y="5" width="2" height="6" :fill="color" />
          <rect x="23" y="3" width="3" height="3" :fill="color" />
        </g>
        <rect x="5" y="5" width="2" height="2" :fill="color" />
        <rect x="13" y="5" width="2" height="2" :fill="color" />
        <rect x="4" y="6" width="4" height="2" :fill="color" />
        <rect x="12" y="6" width="4" height="2" :fill="color" />
        <rect x="3" y="7" width="14" height="2" :fill="color" />
        <rect x="3" y="8" width="18" height="2" :fill="color" />
        <rect x="2" y="9" width="21" height="2" :fill="color" />
        <rect x="2" y="10" width="22" height="2" :fill="color" />
        <rect x="2" y="11" width="23" height="3" :fill="color" />
        <rect x="3" y="14" width="21" height="2" :fill="color" />
        <!-- 开心眯眼 (弯月状) -->
        <rect x="4" y="10" width="1" height="1" fill="#000" />
        <rect x="5" y="9" width="2" height="1" fill="#000" />
        <rect x="7" y="10" width="1" height="1" fill="#000" />
        <rect x="12" y="10" width="1" height="1" fill="#000" />
        <rect x="13" y="9" width="2" height="1" fill="#000" />
        <rect x="15" y="10" width="1" height="1" fill="#000" />
        <!-- 腮红与小嘴 -->
        <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
        <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
        <rect x="9" y="12" width="2" height="1" fill="#000" />
      </g>

      <!-- 5. 警觉确认 ALERT -->
      <g v-else-if="effectiveState === 'alert'" class="cat-body">
        <!-- 飞机耳 -->
        <rect x="2" y="7" width="4" height="2" :fill="color" />
        <rect x="14" y="7" width="4" height="2" :fill="color" />
        <rect x="1" y="8" width="5" height="1" :fill="color" />
        <rect x="14" y="8" width="5" height="1" :fill="color" />
        <rect x="3" y="9" width="17" height="2" :fill="color" />
        <rect x="2" y="10" width="21" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <rect x="5" y="10" width="2" height="3" fill="#000" />
        <rect x="13" y="10" width="2" height="3" fill="#000" />
        <!-- 叹号 ! -->
        <g class="cat-alert-mark">
          <rect x="19" y="1" width="2" height="4" fill="#EF4444" />
          <rect x="19" y="6" width="2" height="2" fill="#EF4444" />
        </g>
      </g>

      <!-- 6. 异常报错 ERROR -->
      <g v-else-if="effectiveState === 'error'" class="cat-body">
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="17" height="2" :fill="color" />
        <rect x="2" y="10" width="21" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <!-- 叉叉眼 (X X) -->
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
        <!-- 冷汗滴 -->
        <rect x="1" y="9" width="1" height="2" fill="#60A5FA" />
      </g>

      <!-- 7. 休眠蜷缩 SLEEPING -->
      <g v-else-if="effectiveState === 'sleeping'" class="cat-body">
        <!-- 趴得更平更团 -->
        <rect x="4" y="9" width="20" height="7" :fill="color" />
        <rect x="6" y="8" width="15" height="1" :fill="color" />
        <rect x="5" y="16" width="18" height="1" :fill="color" />
        <!-- 贴平的小耳朵 -->
        <rect x="6" y="8" width="2" height="1" :fill="color" />
        <rect x="12" y="8" width="2" height="1" :fill="color" />
        <!-- 闭眼安睡线 (- -) -->
        <rect x="7" y="12" width="3" height="1" fill="#000" />
        <rect x="13" y="12" width="3" height="1" fill="#000" />
        <!-- 尾巴搭在身上 -->
        <rect x="19" y="13" width="5" height="2" :fill="color" />
        <!-- Zzz 气泡 -->
        <g class="cat-zzz">
          <text x="23" y="8" font-size="6" font-family="monospace" font-weight="bold" fill="#A78BFA">Z</text>
          <text x="27" y="5" font-size="4" font-family="monospace" font-weight="bold" fill="#A78BFA">z</text>
        </g>
      </g>

      <!-- 8. 多任务抛球 JUGGLING -->
      <g v-else-if="effectiveState === 'juggling'" class="cat-body">
        <rect x="5" y="7" width="2" height="2" :fill="color" />
        <rect x="13" y="7" width="2" height="2" :fill="color" />
        <rect x="4" y="8" width="4" height="2" :fill="color" />
        <rect x="12" y="8" width="4" height="2" :fill="color" />
        <rect x="3" y="9" width="16" height="2" :fill="color" />
        <rect x="2" y="11" width="20" height="5" :fill="color" />
        <!-- 双手抛接球 -->
        <g class="juggle-ball-1"><rect x="6" y="2" width="3" height="3" fill="#10B981" /></g>
        <g class="juggle-ball-2"><rect x="14" y="1" width="3" height="3" fill="#3B82F6" /></g>
        <g class="juggle-ball-3"><rect x="21" y="3" width="3" height="3" fill="#F59E0B" /></g>
        <!-- 专注圆眼 -->
        <rect x="6" y="11" width="2" height="2" fill="#000" />
        <rect x="13" y="11" width="2" height="2" fill="#000" />
      </g>

      <!-- 9. 扫地整理 SWEEPING -->
      <g v-else-if="effectiveState === 'sweeping'" class="cat-body">
        <rect x="7" y="6" width="2" height="2" :fill="color" />
        <rect x="14" y="6" width="2" height="2" :fill="color" />
        <rect x="5" y="8" width="16" height="8" :fill="color" />
        <!-- 小扫帚 -->
        <g class="broom">
          <rect x="3" y="6" width="1" height="8" fill="#B45309" />
          <rect x="1" y="14" width="4" height="3" fill="#FDE047" />
        </g>
        <!-- 灰尘小泡泡 -->
        <rect x="6" y="16" width="1" height="1" fill="#9CA3AF" />
        <rect x="8" y="15" width="1" height="1" fill="#9CA3AF" />
      </g>

      <!-- 10. 代码研读 READING -->
      <g v-else-if="effectiveState === 'reading'" class="cat-body">
        <rect x="7" y="6" width="2" height="2" :fill="color" />
        <rect x="15" y="6" width="2" height="2" :fill="color" />
        <rect x="5" y="8" width="18" height="8" :fill="color" />
        <!-- 展开的书卷/屏幕 -->
        <rect x="2" y="11" width="6" height="5" fill="#E5E7EB" />
        <rect x="3" y="12" width="4" height="1" fill="#4B5563" />
        <rect x="3" y="14" width="3" height="1" fill="#4B5563" />
        <!-- 戴眼镜或认真眼神 -->
        <g class="glasses">
          <rect x="7" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
          <rect x="12" y="10" width="3" height="2" fill="none" stroke="#000" stroke-width="1" />
        </g>
      </g>

      <!-- 11. 互动眩晕 DIZZY -->
      <g v-else-if="effectiveState === 'dizzy'" class="cat-body">
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="3" y="8" width="18" height="8" :fill="color" />
        <!-- 螺旋蚊香眼 -->
        <g class="spiral-eyes">
          <rect x="5" y="10" width="3" height="1" fill="#000" />
          <rect x="7" y="11" width="1" height="1" fill="#000" />
          <rect x="5" y="12" width="2" height="1" fill="#000" />
          <rect x="13" y="10" width="3" height="1" fill="#000" />
          <rect x="15" y="11" width="1" height="1" fill="#000" />
          <rect x="13" y="12" width="2" height="1" fill="#000" />
        </g>
        <!-- 头顶冒星星 -->
        <g class="dizzy-stars">
          <rect x="9" y="2" width="2" height="2" fill="#FBBF24" />
          <rect x="17" y="3" width="1" height="1" fill="#FBBF24" />
        </g>
      </g>

      <!-- 12. 边栏探头 PEEKING -->
      <g v-else-if="effectiveState === 'peeking'" class="cat-peek">
        <rect x="4" y="10" width="2" height="4" :fill="color" />
        <rect x="14" y="10" width="2" height="4" :fill="color" />
        <rect x="3" y="13" width="15" height="10" :fill="color" />
        <!-- 探头大眼睛 -->
        <rect x="6" y="15" width="2" height="2" fill="#000" />
        <rect x="12" y="15" width="2" height="2" fill="#000" />
      </g>

      <!-- 13. 猫式伸懒腰 STRETCHING -->
      <g v-else-if="effectiveState === 'stretching'" class="cat-stretch">
        <g class="cat-tail-stretch">
          <rect x="23" y="2" width="2" height="8" :fill="color" />
          <rect x="24" y="1" width="3" height="3" :fill="color" />
        </g>
        <!-- 前身下压伸展 -->
        <rect x="5" y="11" width="2" height="2" :fill="color" />
        <rect x="11" y="11" width="2" height="2" :fill="color" />
        <rect x="4" y="12" width="9" height="4" :fill="color" />
        <!-- 后背高耸撅臀 -->
        <rect x="12" y="9" width="12" height="7" :fill="color" />
        <!-- 向前伸平的双爪 -->
        <rect x="1" y="15" width="4" height="2" :fill="color" />
        <rect x="1" y="15" width="2" height="1" fill="#FF76A5" />
        <!-- 眯眼享受 -->
        <rect x="5" y="13" width="2" height="1" fill="#000" />
        <rect x="9" y="13" width="2" height="1" fill="#000" />
      </g>

      <!-- 14. 舔爪洗脸 BATHING -->
      <g v-else-if="effectiveState === 'bathing'" class="cat-body">
        <g class="cat-tail">
          <rect x="23" y="10" width="3" height="2" :fill="color" />
          <rect x="24" y="8" width="3" height="3" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="3" y="8" width="18" height="8" :fill="color" />
        <!-- 一睁一闭眼睛 -->
        <rect x="6" y="11" width="2" height="2" fill="#000" />
        <rect x="12" y="11" width="2" height="1" fill="#000" />
        <!-- 抬起的舔脸爪子与小舌头 -->
        <g class="paw-bath">
          <rect x="13" y="9" width="3" height="3" :fill="color" />
          <rect x="14" y="10" width="2" height="2" fill="#FF76A5" />
        </g>
        <rect x="9" y="13" width="2" height="1" fill="#FF76A5" />
      </g>

      <!-- 15. 好奇歪头 CURIOUS -->
      <g v-else-if="effectiveState === 'curious'" class="cat-curious">
        <g class="cat-tail">
          <rect x="24" y="7" width="2" height="5" :fill="color" />
          <rect x="25" y="6" width="2" height="2" :fill="color" />
        </g>
        <!-- 趴卧身体 -->
        <rect x="3" y="10" width="21" height="7" :fill="color" />
        <!-- 歪斜头部组 -->
        <g class="curious-head">
          <rect x="6" y="5" width="2" height="3" :fill="color" />
          <rect x="14" y="7" width="3" height="2" :fill="color" />
          <rect x="5" y="7" width="12" height="6" :fill="color" />
          <!-- 好奇的大圆眼 -->
          <rect x="6" y="9" width="2" height="2" fill="#000" />
          <rect x="12" y="10" width="2" height="2" fill="#000" />
          <rect x="6" y="9" width="1" height="1" fill="#fff" />
          <rect x="12" y="10" width="1" height="1" fill="#fff" />
        </g>
        <!-- 头顶冒问号 ? -->
        <g class="question-mark">
          <rect x="19" y="2" width="3" height="1" fill="#F59E0B" />
          <rect x="21" y="3" width="1" height="2" fill="#F59E0B" />
          <rect x="20" y="4" width="1" height="1" fill="#F59E0B" />
          <rect x="20" y="6" width="1" height="1" fill="#F59E0B" />
        </g>
      </g>

      <!-- 16. 磨爪挠挠 SCRATCHING -->
      <g v-else-if="effectiveState === 'scratching'" class="cat-body">
        <rect x="6" y="7" width="2" height="2" :fill="color" />
        <rect x="14" y="7" width="2" height="2" :fill="color" />
        <rect x="5" y="9" width="18" height="7" :fill="color" />
        <!-- 猫抓板柱子 -->
        <rect x="1" y="6" width="3" height="11" fill="#A87343" />
        <rect x="1" y="9" width="3" height="1" fill="#D4A373" />
        <rect x="1" y="13" width="3" height="1" fill="#D4A373" />
        <!-- 双爪交替抓抓 -->
        <g class="scratch-paw-1"><rect x="3" y="8" width="3" height="2" fill="#fff" /></g>
        <g class="scratch-paw-2"><rect x="3" y="12" width="3" height="2" fill="#fff" /></g>
        <!-- 金色抓痕光点 -->
        <g class="scratch-spark">
          <rect x="4" y="7" width="1" height="1" fill="#FBBF24" />
          <rect x="4" y="14" width="1" height="1" fill="#FBBF24" />
        </g>
      </g>

      <!-- 17. 呼噜治愈 PURRING -->
      <g v-else-if="effectiveState === 'purring'" class="cat-purr">
        <g class="cat-tail">
          <rect x="23" y="11" width="3" height="2" :fill="color" />
          <rect x="24" y="9" width="3" height="3" :fill="color" />
        </g>
        <!-- 圆润面包块 -->
        <rect x="5" y="7" width="2" height="2" :fill="color" />
        <rect x="13" y="7" width="2" height="2" :fill="color" />
        <rect x="3" y="9" width="21" height="7" :fill="color" />
        <!-- 眯眼月牙笑 -->
        <rect x="6" y="11" width="2" height="1" fill="#000" />
        <rect x="12" y="11" width="2" height="1" fill="#000" />
        <!-- 腮红与小猫嘴 (w) -->
        <rect x="4" y="12" width="2" height="1" fill="#FF76A5" />
        <rect x="14" y="12" width="2" height="1" fill="#FF76A5" />
        <rect x="9" y="12" width="1" height="1" fill="#000" />
        <rect x="10" y="12" width="1" height="1" fill="#000" />
        <!-- 飘出的音符与爱心 -->
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
      <g v-else-if="effectiveState === 'eating'" class="cat-body">
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="3" y="8" width="19" height="8" :fill="color" />
        <!-- 满足闭眼 -->
        <rect x="6" y="10" width="2" height="1" fill="#000" />
        <rect x="12" y="10" width="2" height="1" fill="#000" />
        <!-- 双爪抱着的小金鱼干 -->
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
      <g v-else-if="effectiveState === 'dancing'" class="cat-dance">
        <g class="cat-tail-dance">
          <rect x="23" y="6" width="2" height="6" :fill="color" />
          <rect x="25" y="4" width="3" height="3" :fill="color" />
        </g>
        <rect x="6" y="5" width="2" height="2" :fill="color" />
        <rect x="14" y="5" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="17" height="9" :fill="color" />
        <!-- 左右张开律动的小爪子 -->
        <rect x="1" y="9" width="3" height="2" fill="#fff" />
        <rect x="21" y="9" width="3" height="2" fill="#fff" />
        <!-- 眨眼放电与音符 -->
        <rect x="6" y="9" width="2" height="2" fill="#000" />
        <rect x="13" y="10" width="2" height="1" fill="#000" />
        <g class="dance-note">
          <rect x="2" y="2" width="2" height="2" fill="#8B5CF6" />
          <rect x="3" y="1" width="1" height="3" fill="#8B5CF6" />
        </g>
      </g>

      <!-- 20. 打call应援 CHEERING -->
      <g v-else-if="effectiveState === 'cheering'" class="cat-cheer">
        <rect x="6" y="7" width="2" height="2" :fill="color" />
        <rect x="14" y="7" width="2" height="2" :fill="color" />
        <rect x="4" y="9" width="17" height="7" :fill="color" />
        <rect x="7" y="11" width="2" height="2" fill="#000" />
        <rect x="13" y="11" width="2" height="2" fill="#000" />
        <!-- 左手粉红荧光棒 -->
        <g class="glowstick-pink">
          <rect x="1" y="1" width="2" height="8" fill="#EC4899" />
          <rect x="1" y="8" width="3" height="2" fill="#fff" />
        </g>
        <!-- 右手亮青荧光棒 -->
        <g class="glowstick-cyan">
          <rect x="22" y="1" width="2" height="8" fill="#06B6D4" />
          <rect x="21" y="8" width="3" height="2" fill="#fff" />
        </g>
      </g>

      <!-- 21. 专注打机 GAMING -->
      <g v-else-if="effectiveState === 'gaming'" class="cat-body">
        <rect x="6" y="6" width="2" height="2" :fill="color" />
        <rect x="14" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="8" width="18" height="8" :fill="color" />
        <!-- 超专注眼睛 -->
        <rect x="7" y="10" width="2" height="2" fill="#000" />
        <rect x="13" y="10" width="2" height="2" fill="#000" />
        <rect x="8" y="10" width="1" height="1" fill="#38BDF8" />
        <rect x="14" y="10" width="1" height="1" fill="#38BDF8" />
        <!-- 迷你手柄 (红蓝配色) -->
        <g class="gamepad">
          <rect x="6" y="12" width="12" height="4" fill="#374151" />
          <!-- 蓝十字键与红AB键 -->
          <rect x="7" y="13" width="2" height="2" fill="#06B6D4" />
          <rect x="15" y="13" width="2" height="2" fill="#EF4444" />
          <!-- 正在搓键的双爪 -->
          <rect x="6" y="13" width="2" height="2" fill="#fff" />
          <rect x="16" y="13" width="2" height="2" fill="#fff" />
        </g>
      </g>

      <!-- 22. 极客超频 HACKING -->
      <g v-else-if="effectiveState === 'hacking'" class="cat-body">
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="3" y="8" width="19" height="8" :fill="color" />
        <!-- 酷炫黑客墨镜与绿光反光 -->
        <g class="sunglasses">
          <rect x="4" y="10" width="12" height="3" fill="#111827" />
          <rect x="6" y="10" width="2" height="1" fill="#10B981" />
          <rect x="12" y="10" width="2" height="1" fill="#10B981" />
        </g>
        <!-- 极速残影敲击键盘与绿色代码流 -->
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
      <g v-else-if="effectiveState === 'celebrating'" class="cat-celebrate">
        <rect x="5" y="5" width="2" height="2" :fill="color" />
        <rect x="13" y="5" width="2" height="2" :fill="color" />
        <rect x="3" y="7" width="18" height="9" :fill="color" />
        <!-- 双爪高举欢呼 -->
        <rect x="1" y="6" width="3" height="3" fill="#fff" />
        <rect x="20" y="6" width="3" height="3" fill="#fff" />
        <!-- 笑脸眯眼 -->
        <rect x="6" y="9" width="2" height="1" fill="#000" />
        <rect x="13" y="9" width="2" height="1" fill="#000" />
        <!-- 满天飘洒彩色纸屑 -->
        <g class="confetti-stream">
          <rect x="3" y="1" width="2" height="2" fill="#FBBF24" />
          <rect x="10" y="2" width="2" height="2" fill="#EC4899" />
          <rect x="16" y="1" width="2" height="2" fill="#06B6D4" />
          <rect x="23" y="3" width="2" height="2" fill="#10B981" />
          <rect x="26" y="1" width="2" height="2" fill="#8B5CF6" />
        </g>
      </g>

      <!-- 24. 纸箱猫猫 BOX -->
      <g v-else-if="effectiveState === 'box'" class="cat-box">
        <!-- 纸箱本体 -->
        <rect x="3" y="9" width="24" height="9" fill="#B48450" />
        <rect x="3" y="9" width="24" height="2" fill="#C99B67" />
        <rect x="3" y="17" width="24" height="1" fill="#8D5C2C" />
        <!-- 纸箱侧翻盖 -->
        <rect x="1" y="8" width="4" height="2" fill="#C99B67" />
        <rect x="25" y="8" width="4" height="2" fill="#C99B67" />
        <!-- 纸箱印的爪印标志 -->
        <rect x="14" y="13" width="2" height="2" fill="#8D5C2C" />
        <rect x="12" y="12" width="1" height="1" fill="#8D5C2C" />
        <rect x="14" y="11" width="1" height="1" fill="#8D5C2C" />
        <rect x="16" y="11" width="1" height="1" fill="#8D5C2C" />
        <rect x="17" y="12" width="1" height="1" fill="#8D5C2C" />
        <!-- 箱子里探出头的小猫 -->
        <g class="box-peeker">
          <rect x="8" y="4" width="2" height="3" :fill="color" />
          <rect x="18" y="4" width="2" height="3" :fill="color" />
          <rect x="7" y="7" width="14" height="3" :fill="color" />
          <!-- 两只乌黑发亮的大眼睛 -->
          <rect x="9" y="7" width="2" height="2" fill="#000" />
          <rect x="17" y="7" width="2" height="2" fill="#000" />
          <rect x="9" y="7" width="1" height="1" fill="#fff" />
          <rect x="17" y="7" width="1" height="1" fill="#fff" />
        </g>
      </g>
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
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
}

.tx-miko svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* 交互状态反馈 */
.tx-miko.is-interactive {
  cursor: pointer;
}
.tx-miko.is-interactive:hover {
  transform: translateY(-2px) scale(1.06);
}
.tx-miko.is-interactive:active,
.tx-miko.is-clicked {
  transform: scale(0.92) translateY(2px);
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
  0%, 100% { transform: translateY(8px); }
  35%, 75% { transform: translateY(0); }
}
@keyframes peekLook {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(2px); }
}
.state-peeking .cat-peek { animation: peekRise 3.5s ease-in-out infinite; }
.state-peeking .cat-eyes { animation: peekLook 3.5s ease-in-out infinite; }

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
</style>
