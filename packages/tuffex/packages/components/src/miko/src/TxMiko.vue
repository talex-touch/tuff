<script setup lang="ts">
import type { Component, CSSProperties } from 'vue'
import type { MikoEmits, MikoProps, MikoState } from './types'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { MIKO_DEFAULT_COLOR, MIKO_DEFAULT_LABELS } from './types'
import './miko.css'

defineOptions({
  name: 'TxMiko',
})

const props = withDefaults(defineProps<MikoProps>(), {
  state: 'idle',
  size: 'md',
  color: MIKO_DEFAULT_COLOR,
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

const stateLoaders = {
  idle: () => import('./states/IdleState.vue'),
  working: () => import('./states/WorkingState.vue'),
  thinking: () => import('./states/ThinkingState.vue'),
  success: () => import('./states/SuccessState.vue'),
  alert: () => import('./states/AlertState.vue'),
  error: () => import('./states/ErrorState.vue'),
  sleeping: () => import('./states/SleepingState.vue'),
  juggling: () => import('./states/JugglingState.vue'),
  sweeping: () => import('./states/SweepingState.vue'),
  reading: () => import('./states/ReadingState.vue'),
  dizzy: () => import('./states/DizzyState.vue'),
  peeking: () => import('./states/PeekingState.vue'),
  stretching: () => import('./states/StretchingState.vue'),
  bathing: () => import('./states/BathingState.vue'),
  curious: () => import('./states/CuriousState.vue'),
  scratching: () => import('./states/ScratchingState.vue'),
  purring: () => import('./states/PurringState.vue'),
  eating: () => import('./states/EatingState.vue'),
  dancing: () => import('./states/DancingState.vue'),
  cheering: () => import('./states/CheeringState.vue'),
  gaming: () => import('./states/GamingState.vue'),
  hacking: () => import('./states/HackingState.vue'),
  celebrating: () => import('./states/CelebratingState.vue'),
  box: () => import('./states/BoxState.vue'),
  running: () => import('./states/RunningState.vue'),
  demon: () => import('./states/DemonState.vue'),
  coffee: () => import('./states/CoffeeState.vue'),
  guitar: () => import('./states/GuitarState.vue'),
  sleepy: () => import('./states/SleepyState.vue'),
  ninja: () => import('./states/NinjaState.vue'),
  fishing: () => import('./states/FishingState.vue'),
  magic: () => import('./states/MagicState.vue'),
  umbrella: () => import('./states/UmbrellaState.vue'),
  heart: () => import('./states/HeartState.vue'),
  workout: () => import('./states/WorkoutState.vue'),
  dj: () => import('./states/DjState.vue'),
  chef: () => import('./states/ChefState.vue'),
  space: () => import('./states/SpaceState.vue'),
}

const fallbackLoader = () => import('./states/FallbackState.vue')
const stateComponents = new Map<string, Component>(
  Object.entries(stateLoaders).map(([state, load]): [string, Component] => [state, defineAsyncComponent(load)]),
)
const fallbackComponent = defineAsyncComponent(fallbackLoader)

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

const stateComponent = computed(() => stateComponents.get(effectiveState.value) ?? fallbackComponent)
const stateKey = computed(() => (stateComponents.has(effectiveState.value) ? effectiveState.value : 'fallback'))

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
  if (isDemonMode.value && props.color === MIKO_DEFAULT_COLOR) {
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

onMounted(() => {
  const preloadStates = () => {
    for (const load of [...Object.values(stateLoaders), fallbackLoader])
      load()
  }
  if (typeof requestIdleCallback === 'function')
    requestIdleCallback(preloadStates)
  else
    setTimeout(preloadStates, 200)
})

onUnmounted(() => {
  if (randomTimer)
    clearTimeout(randomTimer)
  if (clickTimer)
    clearTimeout(clickTimer)
  if (demonTimer)
    clearTimeout(demonTimer)
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
        <component :is="stateComponent" :key="stateKey" :color="effectiveColor" />
      </Transition>
    </svg>
  </div>
</template>
