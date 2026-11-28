<script setup lang="ts">
import { GLIDE, resolveCssEase, stepSpring } from '@talex-touch/tuffex/utils'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * One retarget, given to two movers at the same instant.
 *
 * The tween does what a CSS transition does when its value changes mid-flight: it
 * starts a fresh fixed-duration curve from where it stands, so its velocity becomes
 * whatever the new curve's starting slope makes of the new distance. The spring is
 * m·x″ + c·x′ + k·(x − target) = 0, integrated every frame by TuffEx's `stepSpring`;
 * a retarget moves only the target and the velocity carries over.
 *
 * Positions are lane fractions, 0..1. Time is the movers' own clock: it runs only
 * while something moves, and slower in slow motion, so the plots hold the motion
 * rather than the pauses between clicks.
 */

type Curve = 'ease-in-out' | 'ease-out-strong'
type Ease = (t: number) => number

interface Tween {
  from: number
  to: number
  start: number
  duration: number
  ease: Ease
}

interface Sample {
  t: number
  tweenP: number
  tweenV: number
  springP: number
  springV: number
  target: number
}

interface Jump {
  tween: [number, number]
  spring: [number, number]
}

/** Seconds of the movers' clock the plots keep. */
const WINDOW_S = 2
/** The settle band that sets the tween's duration, as a share of the move. */
const SETTLE_TOLERANCE = 0.01
const START = 0.1
const PUCK = 22
const LANE_PAD = 12
/** A long frame (a background tab) is clipped to this, so the movers never leap. */
const MAX_FRAME_S = 0.05
const REST_DISTANCE = 0.0005
const REST_SPEED = 0.005
const SLOW_FACTORS = [1, 4]
/** The scripted reversal turns back this far into the tween's duration… */
const SCRIPT_AT = 0.4
/** …towards a point this far along the way out. */
const SCRIPT_BACK = 0.3
const PLOT_W = 600
const PLOT_H = 100
const PLOT_PAD = 8
const POS_MIN = -0.15
const POS_MAX = 1.15

const { locale } = useI18n()

const copy = computed(() => {
  const tolerance = `${SETTLE_TOLERANCE * 100}%`
  return locale.value === 'zh'
    ? {
        lanes: '两条轨道：点击任意位置改道',
        hint: '点任意一条轨道，两个方块同时去那里；趁它们还在跑，再点一次别处。',
        tween: '贝塞尔补间',
        spring: '弹簧（stepSpring）',
        target: '目标',
        position: '位置',
        velocity: '速度',
        positionPlot: '最近一段时间里两个方块的位置曲线',
        velocityPlot: '最近一段时间里两个方块的速度曲线',
        window: `← 最近 ${WINDOW_S} 秒（方块自己的时钟）`,
        now: '现在',
        stiffness: '刚度 k',
        damping: '阻尼 c',
        mass: '质量 m',
        curve: '补间曲线',
        speed: '速度',
        realtime: '实时',
        slow: '慢放',
        demo: '演示一次中途折返',
        zeta: '阻尼比 ζ = c / 2√(km)',
        duration: '补间时长（弹簧稳定所需）',
        slope: '补间起步速度 / 平均速度',
        tweenJump: '改道瞬间 · 补间速度',
        springJump: '改道瞬间 · 弹簧速度',
        caption: `改道时，补间从当前位置按固定时长重起一条曲线，速度直接换成新曲线起点的斜率：ease-in-out 起点是平的，于是急停再起步；TuffEx 的 ease-out-strong 起点很陡，速度反而猛增。两种都和改道前的速度无关。弹簧每帧用 TuffEx 的 stepSpring 积分，改道只换目标，速度原样带过去。补间时长取当前 k / c / m 下弹簧回到 ${tolerance} 以内所需的时间，不打断时两者同时到达。`,
      }
    : {
        lanes: 'Two lanes: click anywhere to retarget',
        hint: 'Click either lane and both pucks head there; click somewhere else while they are still moving.',
        tween: 'Bezier tween',
        spring: 'Spring (stepSpring)',
        target: 'Target',
        position: 'Position',
        velocity: 'Velocity',
        positionPlot: 'Recent position traces of both pucks',
        velocityPlot: 'Recent velocity traces of both pucks',
        window: `← Last ${WINDOW_S} s (the pucks’ own clock)`,
        now: 'now',
        stiffness: 'Stiffness k',
        damping: 'Damping c',
        mass: 'Mass m',
        curve: 'Tween curve',
        speed: 'Speed',
        realtime: 'Real time',
        slow: 'Slow motion',
        demo: 'Play a mid-flight reversal',
        zeta: 'Damping ratio ζ = c / 2√(km)',
        duration: 'Tween duration (spring settle time)',
        slope: 'Tween start speed / average speed',
        tweenJump: 'At the retarget · tween velocity',
        springJump: 'At the retarget · spring velocity',
        caption: `On a retarget the tween starts a fresh fixed-duration curve from where it stands, and its velocity becomes the new curve’s starting slope: ease-in-out starts flat, so it stops dead and pulls away again; TuffEx’s ease-out-strong starts steep, so its velocity leaps instead. Neither has anything to do with the velocity before the retarget. The spring is integrated every frame by TuffEx’s stepSpring; a retarget moves only the target, and the velocity carries over. The tween lasts as long as the spring takes to settle within ${tolerance} at the current k / c / m, so uninterrupted, both arrive together.`,
      }
})

const stiffness = ref<number>(GLIDE.stiffness)
const damping = ref<number>(GLIDE.damping)
const mass = ref(1)
const curve = ref<Curve>('ease-in-out')
const slow = ref(1)
/** `--tx-ease-out-strong` as the page defines it, read on mount. */
const outStrongSpec = ref('ease-out')

const laneRef = ref<HTMLElement | null>(null)
/** Pixels a puck can travel along a lane. */
const travel = ref(0)
const tweenShown = ref(START)
const springShown = ref(START)
const lastJump = ref<Jump | null>(null)
const plot = shallowRef({ tweenP: '', springP: '', target: '', tweenV: '', springV: '', vmax: 0 })

let simTime = 0
let tween: Tween = { from: START, to: START, start: 0, duration: 0, ease: resolveCssEase('ease-in-out') }
let springP = START
let springV = 0
let target = START
let samples: Sample[] = []
let script: { at: number, to: number } | null = null
let frame = 0
let lastNow = 0
let resizeObserver: ResizeObserver | null = null

const springParams = computed(() => ({ stiffness: stiffness.value, damping: damping.value, mass: mass.value }))
const zeta = computed(() => damping.value / (2 * Math.sqrt(stiffness.value * mass.value)))
const ease = computed(() => resolveCssEase(curve.value === 'ease-in-out' ? 'ease-in-out' : outStrongSpec.value))

/** Seconds the spring takes, from rest, to stay within SETTLE_TOLERANCE of a unit step. */
function settleSeconds(k: number, c: number, m: number) {
  const params = { stiffness: k, damping: c, mass: m }
  const h = 1 / 240
  let p = 0
  let v = 0
  let t = 0
  let last = 0
  while (t < 30) {
    const next = stepSpring(p, v, 1, params, h)
    p = next[0]
    v = next[1]
    t += h
    const x = 1 - p
    if (Math.abs(x) > SETTLE_TOLERANCE)
      last = t
    // Damping only drains energy, so once all of it fits inside the band the spring stays there.
    else if (Math.sqrt(x * x + (m * v * v) / k) <= SETTLE_TOLERANCE)
      break
  }
  return last
}

const settleS = computed(() => settleSeconds(stiffness.value, damping.value, mass.value))

function slopeAt(curveFn: Ease, u: number) {
  const h = 1e-4
  return u + h <= 1 ? (curveFn(u + h) - curveFn(u)) / h : (curveFn(u) - curveFn(u - h)) / h
}

/** The chosen curve's starting slope: its start speed as a multiple of its average speed. */
const startSlope = computed(() => slopeAt(ease.value, 0))

function tweenState(t: number): [number, number] {
  const { from, to, start, duration } = tween
  const u = duration > 0 ? (t - start) / duration : 1
  if (u >= 1)
    return [to, 0]
  const at = Math.max(0, u)
  return [from + (to - from) * tween.ease(at), ((to - from) * slopeAt(tween.ease, at)) / duration]
}

function trimSamples() {
  const edge = simTime - WINDOW_S
  // One sample is kept left of the window so the lines reach its edge.
  let drop = 0
  while (drop + 1 < samples.length && samples[drop + 1]!.t <= edge)
    drop += 1
  if (drop)
    samples.splice(0, drop)
}

function pushSample(sample: Sample) {
  samples.push(sample)
  trimSamples()
}

function redraw(tweenP: number) {
  tweenShown.value = tweenP
  springShown.value = springP
  const t0 = simTime - WINDOW_S
  const x = (t: number) => (Math.max(0, t - t0) / WINDOW_S) * PLOT_W
  const posY = (p: number) => {
    const clamped = Math.min(POS_MAX, Math.max(POS_MIN, p))
    return PLOT_H - PLOT_PAD - ((clamped - POS_MIN) / (POS_MAX - POS_MIN)) * (PLOT_H - 2 * PLOT_PAD)
  }
  let vmax = 0
  for (const sample of samples)
    vmax = Math.max(vmax, Math.abs(sample.tweenV), Math.abs(sample.springV))
  const scale = vmax > 1e-6 ? vmax : 1
  const velY = (v: number) => PLOT_H / 2 - (v / scale) * (PLOT_H / 2 - PLOT_PAD)
  const line = (pick: (sample: Sample) => [number, number]) => samples
    .map((sample) => {
      const [px, py] = pick(sample)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
  plot.value = {
    tweenP: line(sample => [x(sample.t), posY(sample.tweenP)]),
    springP: line(sample => [x(sample.t), posY(sample.springP)]),
    target: line(sample => [x(sample.t), posY(sample.target)]),
    tweenV: line(sample => [x(sample.t), velY(sample.tweenV)]),
    springV: line(sample => [x(sample.t), velY(sample.springV)]),
    vmax,
  }
}

function snapshot(): Sample {
  const [tweenP, tweenV] = tweenState(simTime)
  return { t: simTime, tweenP, tweenV, springP, springV, target }
}

/** Points both movers at `to`. The tween restarts; the spring keeps its state. */
function retarget(to: number) {
  const before = snapshot()
  tween = { from: before.tweenP, to, start: simTime, duration: settleS.value, ease: ease.value }
  target = to
  const after = snapshot()
  lastJump.value = { tween: [before.tweenV, after.tweenV], spring: [before.springV, after.springV] }
  // Both sides of the instant, so the plots draw the change as a vertical step.
  pushSample(before)
  pushSample(after)
}

function step(now: number) {
  frame = 0
  const wall = lastNow ? Math.min((now - lastNow) / 1000, MAX_FRAME_S) : 0
  lastNow = now
  const dt = wall / slow.value
  simTime += dt
  if (script && simTime >= script.at) {
    const to = script.to
    script = null
    retarget(to)
  }
  const next = stepSpring(springP, springV, target, springParams.value, dt)
  springP = next[0]
  springV = next[1]
  const tweenDone = simTime - tween.start >= tween.duration
  const springDone = Math.abs(target - springP) < REST_DISTANCE && Math.abs(springV) < REST_SPEED
  const resting = tweenDone && springDone && !script
  if (resting) {
    springP = target
    springV = 0
  }
  const sample = snapshot()
  pushSample(sample)
  redraw(sample.tweenP)
  if (resting) {
    lastNow = 0
    return
  }
  frame = requestAnimationFrame(step)
}

function ensureLoop() {
  if (frame)
    return
  lastNow = 0
  frame = requestAnimationFrame(step)
}

function steer(to: number) {
  retarget(to)
  redraw(tweenState(simTime)[0])
  ensureLoop()
}

/** Both movers at rest at `position`; the plots keep their history. */
function restAt(position: number) {
  tween = { from: position, to: position, start: simTime, duration: 0, ease: ease.value }
  springP = position
  springV = 0
  target = position
  pushSample(snapshot())
}

function onLanePointer(event: PointerEvent) {
  const lane = event.currentTarget as HTMLElement
  if (!travel.value)
    return
  const left = lane.getBoundingClientRect().left
  const to = (event.clientX - left - LANE_PAD - PUCK / 2) / travel.value
  script = null
  steer(Math.min(1, Math.max(0, to)))
}

function playReversal() {
  const far = target < 0.5 ? 1 - START : START
  const near = far === START ? 1 - START : START
  restAt(near)
  steer(far)
  script = { at: simTime + tween.duration * SCRIPT_AT, to: near + (far - near) * SCRIPT_BACK }
}

function puckStyle(position: number) {
  const reach = travel.value ? LANE_PAD / travel.value : 0
  const shown = Math.min(1 + reach, Math.max(-reach, position))
  return { translate: `${(LANE_PAD + shown * travel.value).toFixed(2)}px 0` }
}

function formatVelocity(value: number) {
  return travel.value ? `${Math.round(value * travel.value)}` : '—'
}

function jumpText(pair: [number, number] | undefined) {
  return pair ? `${formatVelocity(pair[0])} → ${formatVelocity(pair[1])} px/s` : '—'
}

const tweenJumped = computed(() => {
  const pair = lastJump.value?.tween
  return Boolean(pair && Math.abs(pair[1] - pair[0]) * travel.value >= 1)
})

function formatSlider(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function measureLane() {
  const lane = laneRef.value
  if (lane)
    travel.value = Math.max(0, lane.clientWidth - 2 * LANE_PAD - PUCK)
}

function startHistory() {
  simTime = 0
  samples = []
  pushSample({ t: -WINDOW_S, tweenP: START, tweenV: 0, springP: START, springV: 0, target: START })
  restAt(START)
  redraw(START)
}

function resetDemo() {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  lastNow = 0
  script = null
  stiffness.value = GLIDE.stiffness
  damping.value = GLIDE.damping
  mass.value = 1
  curve.value = 'ease-in-out'
  slow.value = 1
  lastJump.value = null
  startHistory()
}

onMounted(() => {
  const token = getComputedStyle(document.documentElement).getPropertyValue('--tx-ease-out-strong').trim()
  if (token)
    outStrongSpec.value = token
  measureLane()
  if (laneRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measureLane()
      redraw(tweenState(simTime)[0])
    })
    resizeObserver.observe(laneRef.value)
  }
  startHistory()
})

onBeforeUnmount(() => {
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="si-root" :caption="copy.caption">
    <div class="si">
      <p class="si__hint">
        {{ copy.hint }}
      </p>
      <div class="si__lanes" role="group" :aria-label="copy.lanes">
        <div class="si-lane-head">
          <span class="si-swatch is-tween" />{{ copy.tween }}
          <span class="cfig-badge cfig-mono">{{ curve === 'ease-in-out' ? 'ease-in-out' : outStrongSpec }}</span>
        </div>
        <div ref="laneRef" class="si-lane" @pointerdown="onLanePointer">
          <span class="si-lane__target" :style="puckStyle(tween.to)" />
          <span class="si-puck is-tween" :style="puckStyle(tweenShown)" />
        </div>
        <div class="si-lane-head">
          <span class="si-swatch is-spring" />{{ copy.spring }}
          <span class="cfig-badge cfig-mono">k {{ formatSlider(stiffness) }} · c {{ formatSlider(damping) }} · m {{ formatSlider(mass) }}</span>
        </div>
        <div class="si-lane" @pointerdown="onLanePointer">
          <span class="si-lane__target" :style="puckStyle(tween.to)" />
          <span class="si-puck is-spring" :style="puckStyle(springShown)" />
        </div>
      </div>

      <div class="si-plots">
        <div class="si-plot-head">
          <span>{{ copy.position }}</span>
          <span class="cfig-legend">
            <span class="cfig-legend__item" style="--swatch: var(--si-tween)"><span class="cfig-legend__swatch" />{{ copy.tween }}</span>
            <span class="cfig-legend__item" style="--swatch: var(--si-spring)"><span class="cfig-legend__swatch" />{{ copy.spring }}</span>
            <span class="cfig-legend__item" style="--swatch: var(--cfig-muted)"><span class="cfig-legend__swatch is-dashed" />{{ copy.target }}</span>
          </span>
        </div>
        <svg class="si-plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" preserveAspectRatio="none" role="img" :aria-label="copy.positionPlot">
          <polyline class="si-plot__line is-target" :points="plot.target" />
          <polyline class="si-plot__line is-tween" :points="plot.tweenP" />
          <polyline class="si-plot__line is-spring" :points="plot.springP" />
        </svg>
        <div class="si-plot-head">
          <span>{{ copy.velocity }}</span>
          <span class="cfig-mono si-plot-scale">±{{ formatVelocity(plot.vmax) }} px/s</span>
        </div>
        <svg class="si-plot" :viewBox="`0 0 ${PLOT_W} ${PLOT_H}`" preserveAspectRatio="none" role="img" :aria-label="copy.velocityPlot">
          <line class="si-plot__zero" x1="0" :y1="PLOT_H / 2" :x2="PLOT_W" :y2="PLOT_H / 2" />
          <polyline class="si-plot__line is-tween" :points="plot.tweenV" />
          <polyline class="si-plot__line is-spring" :points="plot.springV" />
        </svg>
        <div class="si-plot-axis">
          <span>{{ copy.window }}</span>
          <span>{{ copy.now }}</span>
        </div>
      </div>
    </div>

    <template #controls>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.stiffness }}</span>
        <TxSlider v-model="stiffness" :min="40" :max="800" :step="10" show-value :format-value="formatSlider" :aria-label="copy.stiffness" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.damping }}</span>
        <TxSlider v-model="damping" :min="2" :max="80" :step="1" show-value :format-value="formatSlider" :aria-label="copy.damping" />
      </label>
      <label class="cfig-control">
        <span class="cfig-control__label">{{ copy.mass }}</span>
        <TxSlider v-model="mass" :min="0.25" :max="4" :step="0.25" show-value :format-value="formatSlider" :aria-label="copy.mass" />
      </label>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.curve }}</span>
        <TxRadioGroup v-model="curve">
          <TxRadio value="ease-in-out">
            ease-in-out
          </TxRadio>
          <TxRadio value="ease-out-strong">
            ease-out-strong
          </TxRadio>
        </TxRadioGroup>
      </div>
      <div class="cfig-control">
        <span class="cfig-control__label">{{ copy.speed }}</span>
        <TxRadioGroup v-model="slow">
          <TxRadio v-for="factor in SLOW_FACTORS" :key="factor" :value="factor">
            {{ factor === 1 ? copy.realtime : `${copy.slow} ×${factor}` }}
          </TxRadio>
        </TxRadioGroup>
      </div>
      <TxButton size="sm" variant="secondary" @click="playReversal">
        {{ copy.demo }}
      </TxButton>
    </template>

    <template #readout>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.zeta }}</span>
        <span class="cfig-stat__value">{{ zeta.toFixed(2) }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.duration }}</span>
        <span class="cfig-stat__value">{{ Math.round(settleS * 1000) }} ms</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.slope }}</span>
        <span class="cfig-stat__value">{{ startSlope.toFixed(2) }}</span>
      </span>
      <span class="cfig-stat" :class="tweenJumped ? 'is-fail' : ''">
        <span class="cfig-stat__label">{{ copy.tweenJump }}</span>
        <span class="cfig-stat__value">{{ jumpText(lastJump?.tween) }}</span>
      </span>
      <span class="cfig-stat" :class="lastJump ? 'is-pass' : ''">
        <span class="cfig-stat__label">{{ copy.springJump }}</span>
        <span class="cfig-stat__value">{{ jumpText(lastJump?.spring) }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.si-root {
  --si-tween: var(--tx-color-warning, #e6a23c);
  --si-spring: var(--tx-color-primary, #409eff);
}

.si {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.si__hint {
  margin: 0;
  color: var(--cfig-muted);
  font-size: 12px;
}

.si__lanes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.si-lane-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: 12px;
  font-weight: 600;
}

.si-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.si-swatch.is-tween,
.si-puck.is-tween {
  background: var(--si-tween);
}

.si-swatch.is-spring,
.si-puck.is-spring {
  background: var(--si-spring);
}

.si-lane {
  position: relative;
  height: 38px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--cfig-line);
  cursor: crosshair;
  touch-action: manipulation;
}

.si-puck,
.si-lane__target {
  position: absolute;
  top: 8px;
  left: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
}

.si-lane__target {
  box-shadow: inset 0 0 0 1.5px var(--cfig-muted);
  opacity: 0.55;
}

.si-plots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.si-plot-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  color: var(--cfig-muted);
  font-size: 12px;
}

.si-plot-scale {
  font-size: 11px;
}

.cfig-legend__swatch.is-dashed {
  background: repeating-linear-gradient(90deg, var(--swatch) 0 3px, transparent 3px 5px);
}

.si-plot {
  display: block;
  width: 100%;
  height: 84px;
  border-radius: 8px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--cfig-line);
}

.si-plot__line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.si-plot__line.is-tween {
  stroke: var(--si-tween);
}

.si-plot__line.is-spring {
  stroke: var(--si-spring);
}

.si-plot__line.is-target {
  stroke: var(--cfig-muted);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.si-plot__zero {
  stroke: var(--cfig-line-strong);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.si-plot-axis {
  display: flex;
  justify-content: space-between;
  color: var(--cfig-muted);
  font-size: 11px;
}
</style>
