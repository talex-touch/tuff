<script setup lang="ts">
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingHairline from './TuffLandingHairline.vue'
import TuffLandingSection from './TuffLandingSection.vue'

// Tuffex as a design specification, laid out as a bento: the window figure on a
// ruled board, the type and colour tokens, a continuous-curvature tile, motion,
// and the library's size. Token values are read from
// packages/tuffex/packages/components/style/variables.scss; the counts are
// floors (186 component directories, 224 zh docs pages on 2026-10-07).

const { t } = useI18n()

const INSTALL_COMMAND = 'npm i @talex-touch/tuffex'
const DOCS_HREF = '/docs/dev/components/foundations'

const copy = computed(() => ({
  eyebrow: t('landing.os.designSystem.eyebrow'),
  kicker: t('landing.os.designSystem.kicker'),
  headlineLead: t('landing.os.designSystem.headlineLead'),
  headlineAccent: t('landing.os.designSystem.headlineAccent'),
  figureIndex: t('landing.os.designSystem.figure.index'),
  figureTitle: t('landing.os.designSystem.figure.title'),
  figureLabel: t('landing.os.designSystem.figure.label'),
  cta: t('landing.os.designSystem.cta'),
  copyCommand: t('landing.os.designSystem.copyCommand'),
  copied: t('landing.os.designSystem.copied'),
  type: t('landing.os.designSystem.tokens.type.title'),
  typeNote: t('landing.os.designSystem.tokens.type.note'),
  color: t('landing.os.designSystem.tokens.color.title'),
  colorNote: t('landing.os.designSystem.tokens.color.note'),
  curve: t('landing.os.designSystem.tokens.curve.title'),
  curveG1: t('landing.os.designSystem.tokens.curve.g1'),
  curveG2: t('landing.os.designSystem.tokens.curve.g2'),
  curveNote: t('landing.os.designSystem.tokens.curve.note'),
  motion: t('landing.os.designSystem.tokens.motion.title'),
  motionNote: t('landing.os.designSystem.tokens.motion.note'),
  motionStrong: t('landing.os.designSystem.tokens.motion.strong'),
  motionSpring: t('landing.os.designSystem.tokens.motion.spring'),
  stats: t('landing.os.designSystem.stats.title'),
  statsNote: t('landing.os.designSystem.stats.note'),
}))

const stats = computed(() => [
  { key: 'components', value: '180+', label: t('landing.os.designSystem.stats.components') },
  { key: 'docs', value: '220+', label: t('landing.os.designSystem.stats.docs') },
  { key: 'themes', value: '3', label: t('landing.os.designSystem.stats.themes') },
])

const swatches = [
  { name: 'primary', hex: '#409eff' },
  { name: 'success', hex: '#4ade80' },
  { name: 'warning', hex: '#fbbf24' },
  { name: 'danger', hex: '#f87171' },
  { name: 'info', hex: '#909399' },
] as const

const typeScale = [12, 14, 16] as const

// ── Continuous curvature ───────────────────────────────────────────────────
// One corner of a rounded square, drawn as a superellipse quadrant between two
// straight edges. n = 2 is the circular arc a CSS border-radius draws (G1: the
// curvature jumps where arc meets edge); n > 2 lets it rise from zero (G2), the
// way Tuffex's squircle outline (TxOutlineBorder) does. The comb shows it.

// Room is left above and left of the corner for the comb, drawn outside.
const CORNER = { x: 44, y: 36, r: 72, edge: 40 } as const
const N_G1 = 2
const N_G2 = 4.6

const exponent = ref(N_G2)
let exponentTarget = N_G2

function cornerPoints(n: number): Array<[number, number]> {
  const { x, y, r } = CORNER
  const cx = x + r
  const cy = y + r
  const points: Array<[number, number]> = []
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * (Math.PI / 2)
    const px = cx - r * Math.cos(theta) ** (2 / n)
    const py = cy - r * Math.sin(theta) ** (2 / n)
    points.push([px, py])
  }
  return points
}

const curve = computed(() => {
  const n = exponent.value
  const { x, y, r, edge } = CORNER
  const arc = cornerPoints(n)
  // Straight runs before and after, sampled so the comb shows their zero.
  const lead: Array<[number, number]> = []
  const tail: Array<[number, number]> = []
  for (let i = 0; i < 8; i++) {
    lead.push([x, y + r + edge * (1 - i / 8)])
    tail.push([x + r + edge * ((i + 1) / 8), y])
  }
  const path = [...lead, ...arc, ...tail]
  const d = path.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')

  // Discrete curvature from the circle through three neighbours, drawn along
  // the outward normal, where the teeth spread instead of crossing; the
  // envelope through their tips is the classic curvature plot.
  const COMB_SCALE = 1500
  const teeth: string[] = []
  const tips: Array<[number, number]> = []
  for (let i = 1; i < path.length - 1; i++) {
    const [ax, ay] = path[i - 1]!
    const [bx, by] = path[i]!
    const [qx, qy] = path[i + 1]!
    const area = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax)
    const ab = Math.hypot(bx - ax, by - ay)
    const bc = Math.hypot(qx - bx, qy - by)
    const ca = Math.hypot(ax - qx, ay - qy)
    const kappa = ab * bc * ca > 0 ? (2 * Math.abs(area)) / (ab * bc * ca) : 0
    const tx = qx - ax
    const ty = qy - ay
    const tl = Math.hypot(tx, ty) || 1
    // Normal pointing out of the shape (up-left of the corner).
    const nx = ty / tl
    const ny = -tx / tl
    const len = Math.min(kappa * COMB_SCALE, 30)
    const ex = bx + nx * len
    const ey = by + ny * len
    teeth.push(`M${bx.toFixed(2)} ${by.toFixed(2)} L${ex.toFixed(2)} ${ey.toFixed(2)}`)
    tips.push([ex, ey])
  }
  const envelope = tips.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')
  const g2 = n > 2.3
  return { d, teeth: teeth.join(' '), envelope, g2, readout: `n ${n.toFixed(1)} · ${g2 ? 'G2' : 'G1'}` }
})

// ── Pointer: tile spotlight, board guides, curve morph ─────────────────────

const rootRef = ref<HTMLElement | null>(null)
const bentoRef = ref<HTMLElement | null>(null)
const boardRef = ref<HTMLElement | null>(null)
const curveTileRef = ref<HTMLElement | null>(null)
const curveTrackRef = ref<HTMLElement | null>(null)

/** Knob position on the G1–G2 track, 0…1; it follows the pointer directly. */
const knob = ref(1)

const guide = ref({ x: 0, y: 0, visible: false })
const readout = ref('')

let frame = 0
let lastPointer: { x: number, y: number } | null = null

function applyPointer() {
  frame = 0
  const bento = bentoRef.value
  if (!bento || !lastPointer)
    return
  const { x, y } = lastPointer
  for (const tile of bento.querySelectorAll<HTMLElement>('[data-tile]')) {
    const r = tile.getBoundingClientRect()
    tile.style.setProperty('--px', `${x - r.left}px`)
    tile.style.setProperty('--py', `${y - r.top}px`)
  }
  const board = boardRef.value?.getBoundingClientRect()
  if (board) {
    const inside = x >= board.left && x <= board.right && y >= board.top && y <= board.bottom
    guide.value = { x: Math.round(x - board.left), y: Math.round(y - board.top), visible: inside }
  }
  const tile = curveTileRef.value?.getBoundingClientRect()
  const track = curveTrackRef.value?.getBoundingClientRect()
  if (tile && track && x >= tile.left && x <= tile.right && y >= tile.top && y <= tile.bottom) {
    // Measured against the track, so the knob sits under the pointer; left of
    // the track reads as G1, right of it as G2.
    const progress = Math.min(1, Math.max(0, (x - track.left) / track.width))
    knob.value = progress
    exponentTarget = N_G1 + (N_G2 - N_G1) * progress
    startMorph()
  }
}

function onPointerMove(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY }
  if (!frame)
    frame = requestAnimationFrame(applyPointer)
}

function onPointerLeave() {
  lastPointer = null
  guide.value = { ...guide.value, visible: false }
  for (const tile of bentoRef.value?.querySelectorAll<HTMLElement>('[data-tile]') ?? []) {
    tile.style.removeProperty('--px')
    tile.style.removeProperty('--py')
  }
}

function onCurveLeave() {
  knob.value = 1
  exponentTarget = N_G2
  startMorph()
}

let morphFrame = 0
const reduceMotion = ref(false)

function startMorph() {
  if (reduceMotion.value) {
    exponent.value = exponentTarget
    return
  }
  if (morphFrame)
    return
  const step = () => {
    const delta = exponentTarget - exponent.value
    if (Math.abs(delta) < 0.01) {
      exponent.value = exponentTarget
      morphFrame = 0
      return
    }
    exponent.value += delta * 0.18
    morphFrame = requestAnimationFrame(step)
  }
  morphFrame = requestAnimationFrame(step)
}

// ── Install command ────────────────────────────────────────────────────────

const copiedVisible = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function copyInstall() {
  if (!hasNavigator() || !navigator.clipboard)
    return
  try {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
  }
  catch {
    return
  }
  copiedVisible.value = true
  if (copiedTimer)
    clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copiedVisible.value = false
  }, 1400)
}

// ── Entrance ───────────────────────────────────────────────────────────────

const entered = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = rootRef.value
  if (!root || typeof IntersectionObserver === 'undefined') {
    entered.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    entered.value = true
    observer?.disconnect()
    observer = null
  }, { threshold: 0.18 })
  observer.observe(root)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame)
    cancelAnimationFrame(frame)
  if (morphFrame)
    cancelAnimationFrame(morphFrame)
  if (copiedTimer)
    clearTimeout(copiedTimer)
})
</script>

<template>
  <TuffLandingSection
    :sticky="copy.eyebrow"
    section-class="relative h-full w-full flex flex-col justify-center"
    container-class="w-full h-full flex flex-col items-center"
  >
    <div ref="rootRef" class="DesignSpec" :class="{ 'is-entered': entered }">
      <header class="DesignSpec-Head">
        <p class="DesignSpec-Kicker">
          <span class="DesignSpec-KickerRule" aria-hidden="true" />
          {{ copy.kicker }}
        </p>
        <h2 class="DesignSpec-Title">
          <span>{{ copy.headlineLead }}</span>
          <span class="DesignSpec-TitleAccent">{{ copy.headlineAccent }}</span>
        </h2>
      </header>

      <div
        ref="bentoRef"
        class="DesignSpec-Bento"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      >
        <!-- FIG. 01: the window figure on a ruled board with cursor guides -->
        <figure ref="boardRef" class="DesignSpec-Tile DesignSpec-Board" data-tile>
          <span class="DesignSpec-Ruler is-top" aria-hidden="true" />
          <span class="DesignSpec-Ruler is-left" aria-hidden="true" />
          <span
            class="DesignSpec-Guide is-v"
            :class="{ 'is-on': guide.visible }"
            :style="{ transform: `translateX(${guide.x}px)` }"
            aria-hidden="true"
          />
          <span
            class="DesignSpec-Guide is-h"
            :class="{ 'is-on': guide.visible }"
            :style="{ transform: `translateY(${guide.y}px)` }"
            aria-hidden="true"
          />
          <span
            class="DesignSpec-Coord DesignSpec-Mono"
            :class="{ 'is-on': guide.visible }"
            :style="{ transform: `translate(${guide.x + 10}px, ${guide.y + 10}px)` }"
            aria-hidden="true"
          >x {{ guide.x }} · y {{ guide.y }}</span>

          <div class="DesignSpec-BoardHead">
            <span class="DesignSpec-Mono">{{ copy.figureIndex }}</span>
            <span class="DesignSpec-BoardTitle">{{ copy.figureTitle }}</span>
          </div>
          <div class="DesignSpec-Figure">
            <TuffLandingHairline
              class="DesignSpec-Hairline"
              figure="exploded"
              :intensity="0.62"
              :label="copy.figureLabel"
              @read="readout = $event"
            />
          </div>
          <div class="DesignSpec-BoardFoot" aria-hidden="true">
            <span class="DesignSpec-Readout DesignSpec-Mono">{{ readout }}</span>
          </div>
        </figure>

        <!-- 01 type -->
        <article class="DesignSpec-Tile DesignSpec-Type" data-tile>
          <header class="DesignSpec-TileHead">
            <span class="DesignSpec-Mono">01</span>
            <h3>{{ copy.type }}</h3>
          </header>
          <div class="DesignSpec-Stage" aria-hidden="true">
            <div class="DesignSpec-TypeSpecimen">
              <span class="DesignSpec-TypeAa">Aa</span>
              <span class="DesignSpec-TypeCjk">想到</span>
            </div>
            <div class="DesignSpec-TypeScale">
              <span v-for="size in typeScale" :key="size" :style="{ fontSize: `${size}px` }">{{ size }}</span>
            </div>
          </div>
          <p class="DesignSpec-Note">
            {{ copy.typeNote }}
          </p>
        </article>

        <!-- 02 colour: the swatch under the pointer opens up -->
        <article class="DesignSpec-Tile DesignSpec-Color" data-tile>
          <header class="DesignSpec-TileHead">
            <span class="DesignSpec-Mono">02</span>
            <h3>{{ copy.color }}</h3>
          </header>
          <div class="DesignSpec-Stage">
            <ul class="DesignSpec-Swatches">
              <li v-for="swatch in swatches" :key="swatch.name" :style="{ '--swatch': swatch.hex }">
                <span class="DesignSpec-Swatch" aria-hidden="true" />
                <span class="DesignSpec-SwatchName DesignSpec-Mono">{{ swatch.name }}</span>
                <span class="DesignSpec-SwatchHex DesignSpec-Mono">{{ swatch.hex }}</span>
              </li>
            </ul>
          </div>
          <p class="DesignSpec-Note">
            {{ copy.colorNote }}
          </p>
        </article>

        <!-- 03 continuous curvature: move across to go from G1 to G2 -->
        <article
          ref="curveTileRef"
          class="DesignSpec-Tile DesignSpec-Curve"
          data-tile
          @pointerleave="onCurveLeave"
        >
          <header class="DesignSpec-TileHead">
            <span class="DesignSpec-Mono">03</span>
            <h3>{{ copy.curve }}</h3>
            <span class="DesignSpec-CurveReadout DesignSpec-Mono" aria-hidden="true">{{ curve.readout }}</span>
          </header>
          <div class="DesignSpec-CurveBody">
            <svg class="DesignSpec-CurvePlot" viewBox="0 0 170 150" aria-hidden="true">
              <path class="DesignSpec-CurveTeeth" :class="{ 'is-g2': curve.g2 }" :d="curve.teeth" />
              <path class="DesignSpec-CurveEnvelope" :class="{ 'is-g2': curve.g2 }" :d="curve.envelope" />
              <path class="DesignSpec-CurveLine" :d="curve.d" />
            </svg>
            <div class="DesignSpec-CurveSide">
              <div class="DesignSpec-CurveScale" aria-hidden="true">
                <span :class="{ 'is-on': !curve.g2 }">{{ copy.curveG1 }}</span>
                <i ref="curveTrackRef" :style="{ '--p': knob }" />
                <span :class="{ 'is-on': curve.g2 }">{{ copy.curveG2 }}</span>
              </div>
              <p class="DesignSpec-CurveNote">
                {{ copy.curveNote }}
              </p>
            </div>
          </div>
        </article>

        <!-- 04 motion -->
        <article class="DesignSpec-Tile DesignSpec-Motion" data-tile>
          <header class="DesignSpec-TileHead">
            <span class="DesignSpec-Mono">04</span>
            <h3>{{ copy.motion }}</h3>
            <span class="DesignSpec-HeadTag DesignSpec-Mono">{{ copy.motionNote }}</span>
          </header>
          <div class="DesignSpec-Stage" aria-hidden="true">
            <svg class="DesignSpec-MotionPlot" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">
              <path class="DesignSpec-MotionAxis" d="M10 62 H112 M10 62 V8" />
              <path class="DesignSpec-MotionGuide" d="M10 18 H112" />
              <path class="DesignSpec-MotionLine is-strong" d="M10 62 C33 18 42 18 110 18" />
              <path class="DesignSpec-MotionLine is-spring" d="M10 62 C44 -6.6 74 18 110 18" />
            </svg>
            <div class="DesignSpec-Tracks">
              <span class="DesignSpec-Track is-strong"><i /><em>{{ copy.motionStrong }}</em></span>
              <span class="DesignSpec-Track is-spring"><i /><em>{{ copy.motionSpring }}</em></span>
            </div>
          </div>
        </article>

        <!-- size of the library -->
        <article class="DesignSpec-Tile DesignSpec-Stats" data-tile>
          <header class="DesignSpec-TileHead">
            <span class="DesignSpec-Mono">05</span>
            <h3>{{ copy.stats }}</h3>
          </header>
          <dl class="DesignSpec-StatList">
            <div v-for="stat in stats" :key="stat.key" class="DesignSpec-Stat">
              <dd>{{ stat.value }}</dd>
              <dt>{{ stat.label }}</dt>
            </div>
          </dl>
          <p class="DesignSpec-Note">
            {{ copy.statsNote }}
          </p>
        </article>
      </div>

      <footer class="DesignSpec-Foot">
        <NuxtLink class="DesignSpec-Cta" :to="DOCS_HREF">
          {{ copy.cta }}
          <span class="i-carbon-arrow-right" aria-hidden="true" />
        </NuxtLink>
        <button type="button" class="DesignSpec-Install" :aria-label="copy.copyCommand" @click="copyInstall">
          <span class="DesignSpec-InstallPrompt" aria-hidden="true">$</span>
          <code>{{ INSTALL_COMMAND }}</code>
          <span class="DesignSpec-InstallIcon" :class="{ 'is-done': copiedVisible }" aria-hidden="true">
            <span :class="copiedVisible ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
          </span>
          <span class="sr-only" aria-live="polite">{{ copiedVisible ? copy.copied : '' }}</span>
        </button>
      </footer>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.DesignSpec {
  --spec-line: rgba(246, 247, 244, 0.09);
  --spec-line-strong: rgba(246, 247, 244, 0.18);
  --spec-ink: #f6f7f4;
  --spec-muted: rgba(246, 247, 244, 0.56);
  --spec-faint: rgba(246, 247, 244, 0.36);
  --spec-board: #07080a;
  --spec-accent: #409eff;

  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: clamp(0.9rem, 2.2vh, 1.4rem);
  width: min(1180px, 100%);
  height: 100%;
  margin-inline: auto;
  /* The section shell already clears the nav; the bottom keeps the fixed
     eyebrow pill off the footer row. */
  padding: clamp(0.5rem, 2vh, 1.5rem) 1.5rem 5.6rem;
  box-sizing: border-box;
  color: var(--spec-ink);
  text-align: left;
}

.DesignSpec-Mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--spec-faint);
}

/* ── Head ─────────────────────────────────────────────────────────────── */
.DesignSpec-Kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.7rem;
  color: var(--spec-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.22em;
}

.DesignSpec-KickerRule {
  width: 1.6rem;
  height: 1px;
  background: var(--spec-line-strong);
}

/* Inline runs, not flex: CJK punctuation already carries its own space, and
   the English lead keeps a trailing one in the message. */
.DesignSpec-Title {
  margin: 0;
  font-size: clamp(1.9rem, 3.4vw, 3rem);
  font-weight: 760;
  line-height: 1.08;
  letter-spacing: -0.01em;
  word-break: keep-all;
}

.DesignSpec-TitleAccent {
  color: var(--spec-muted);
}

/* ── Bento ────────────────────────────────────────────────────────────── */
.DesignSpec-Bento {
  display: grid;
  grid-template-columns: 1.1fr 1.1fr 1fr 1fr;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.85rem;
  min-height: 0;
}

.DesignSpec-Board { grid-column: 1 / 3; grid-row: 1 / 4; }
.DesignSpec-Type { grid-column: 3; grid-row: 1; }
.DesignSpec-Color { grid-column: 4; grid-row: 1; }
.DesignSpec-Curve { grid-column: 3 / 5; grid-row: 2; }
.DesignSpec-Motion { grid-column: 3; grid-row: 3; }
.DesignSpec-Stats { grid-column: 4; grid-row: 3; }

/* Every tile carries a light that follows the pointer: a soft fill and a
   brighter run of border nearest to it. --px/--py are set per tile. */
.DesignSpec-Tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 0;
  margin: 0;
  border-radius: 16px;
  background:
    radial-gradient(240px circle at var(--px, -400px) var(--py, -400px), rgba(246, 247, 244, 0.06), transparent 70%),
    rgba(246, 247, 244, 0.015);
  box-shadow: inset 0 0 0 1px var(--spec-line);
  padding: 0.85rem 0.95rem;
  overflow: hidden;
  opacity: 0;
  transform: translate3d(0, 10px, 0);
  transition:
    opacity 620ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 620ms cubic-bezier(0.23, 1, 0.32, 1);
}

.DesignSpec-Tile::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: radial-gradient(200px circle at var(--px, -400px) var(--py, -400px), rgba(246, 247, 244, 0.42), transparent 70%);
  pointer-events: none;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}

.is-entered .DesignSpec-Tile {
  opacity: 1;
  transform: none;
}

.DesignSpec-Type { transition-delay: 60ms; }
.DesignSpec-Color { transition-delay: 110ms; }
.DesignSpec-Curve { transition-delay: 160ms; }
.DesignSpec-Motion { transition-delay: 210ms; }
.DesignSpec-Stats { transition-delay: 260ms; }

.DesignSpec-TileHead {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}

.DesignSpec-TileHead h3 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 650;
}

.DesignSpec-Stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 0.7rem;
  min-height: 0;
}

.DesignSpec-Note {
  margin: 0;
  color: var(--spec-faint);
  font-size: 0.74rem;
}

/* ── Board ────────────────────────────────────────────────────────────── */
.DesignSpec-Board {
  padding: 1.2rem 1.2rem 0.9rem 1.5rem;
  background:
    radial-gradient(240px circle at var(--px, -400px) var(--py, -400px), rgba(246, 247, 244, 0.05), transparent 70%),
    radial-gradient(circle at 1px 1px, rgba(246, 247, 244, 0.07) 1px, transparent 0) 0 0 / 18px 18px,
    var(--spec-board);

  --hairline-plate: var(--spec-board);
  --hairline-hi: #f6f7f4;
  --hairline-edge: #a5a8b2;
  --hairline-mid: #4f525b;
  --hairline-lo: #24262c;
}

/* Rulers along the top and left edges, ticked every 8px, major every 40px. */
.DesignSpec-Ruler {
  position: absolute;
  pointer-events: none;
  opacity: 0.8;
}

.DesignSpec-Ruler.is-top {
  top: 0;
  left: 0;
  right: 0;
  height: 9px;
  background:
    repeating-linear-gradient(90deg, rgba(246, 247, 244, 0.22) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, rgba(246, 247, 244, 0.1) 0 1px, transparent 1px 8px);
  background-size: 100% 9px, 100% 5px;
  background-repeat: no-repeat;
}

.DesignSpec-Ruler.is-left {
  top: 0;
  bottom: 0;
  left: 0;
  width: 9px;
  background:
    repeating-linear-gradient(180deg, rgba(246, 247, 244, 0.22) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(180deg, rgba(246, 247, 244, 0.1) 0 1px, transparent 1px 8px);
  background-size: 9px 100%, 5px 100%;
  background-repeat: no-repeat;
}

/* Cursor guides and the coordinate read-out, as in a design canvas. */
.DesignSpec-Guide {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}

.DesignSpec-Guide.is-v {
  width: 1px;
  height: 100%;
  background: repeating-linear-gradient(180deg, rgba(64, 158, 255, 0.55) 0 4px, transparent 4px 8px);
}

.DesignSpec-Guide.is-h {
  width: 100%;
  height: 1px;
  background: repeating-linear-gradient(90deg, rgba(64, 158, 255, 0.55) 0 4px, transparent 4px 8px);
}

.DesignSpec-Coord {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.9);
  padding: 0.1rem 0.35rem;
  color: #fff;
  font-size: 0.62rem;
  pointer-events: none;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 160ms ease;
}

.DesignSpec-Guide.is-on,
.DesignSpec-Coord.is-on {
  opacity: 1;
}

.DesignSpec-BoardHead,
.DesignSpec-BoardFoot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.DesignSpec-BoardTitle {
  color: var(--spec-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

/* The figure keeps its own 5:4 ratio; size it by whichever side runs out. */
.DesignSpec-Figure {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  container-type: size;
}

.DesignSpec-Hairline {
  width: min(100cqw, 125cqh);
}

.DesignSpec-Readout {
  flex-shrink: 0;
  min-width: 9rem;
  margin-left: auto;
  text-align: right;
  color: var(--spec-muted);
}

/* ── 01 type ──────────────────────────────────────────────────────────── */
.DesignSpec-TypeSpecimen {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  line-height: 1;
}

.DesignSpec-TypeAa {
  font-family: Inter, 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(2rem, 5.2vh, 3.2rem);
  font-weight: 500;
  transition: letter-spacing 360ms cubic-bezier(0.23, 1, 0.32, 1);
}

.DesignSpec-Type:hover .DesignSpec-TypeAa {
  letter-spacing: 0.06em;
}

.DesignSpec-TypeCjk {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: clamp(1.5rem, 3.8vh, 2.3rem);
  font-weight: 500;
  color: var(--spec-muted);
}

.DesignSpec-TypeScale {
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  color: var(--spec-muted);
  font-weight: 500;
}

/* ── 02 colour ────────────────────────────────────────────────────────── */
.DesignSpec-Swatches {
  display: flex;
  gap: 0.35rem;
  height: clamp(2.6rem, 9vh, 5rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

.DesignSpec-Swatches li {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  background: var(--swatch);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  overflow: hidden;
  transition: flex-grow 420ms cubic-bezier(0.23, 1, 0.32, 1);
}

.DesignSpec-Swatches li:hover {
  flex-grow: 3.2;
}

.DesignSpec-Swatch {
  position: absolute;
  inset: 0;
}

.DesignSpec-SwatchName,
.DesignSpec-SwatchHex {
  position: absolute;
  left: 0.45rem;
  color: rgba(0, 0, 0, 0.72);
  font-size: 0.6rem;
  letter-spacing: 0;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 240ms ease;
}

.DesignSpec-SwatchName { top: 0.4rem; font-weight: 600; }
.DesignSpec-SwatchHex { bottom: 0.4rem; }

.DesignSpec-Swatches li:hover .DesignSpec-SwatchName,
.DesignSpec-Swatches li:hover .DesignSpec-SwatchHex {
  opacity: 1;
}

/* ── 03 continuous curvature ──────────────────────────────────────────── */
.DesignSpec-CurveReadout,
.DesignSpec-HeadTag {
  margin-left: auto;
  color: var(--spec-muted);
}

.DesignSpec-CurveBody {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.9rem;
  flex: 1;
  min-height: 0;
}

.DesignSpec-CurvePlot {
  width: 100%;
  height: 100%;
  max-height: 100%;
}

.DesignSpec-CurveLine,
.DesignSpec-CurveTeeth,
.DesignSpec-CurveEnvelope {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.DesignSpec-CurveLine {
  stroke: var(--spec-ink);
  stroke-width: 1.6;
}

.DesignSpec-CurveTeeth {
  stroke: rgba(246, 247, 244, 0.22);
  stroke-width: 1;
  transition: stroke 240ms ease;
}

.DesignSpec-CurveEnvelope {
  stroke: rgba(246, 247, 244, 0.5);
  stroke-width: 1;
  transition: stroke 240ms ease;
}

.DesignSpec-CurveTeeth.is-g2 { stroke: rgba(64, 158, 255, 0.32); }
.DesignSpec-CurveEnvelope.is-g2 { stroke: var(--spec-accent); }

.DesignSpec-CurveSide {
  display: grid;
  gap: 0.55rem;
  align-content: center;
  min-width: 0;
}

.DesignSpec-CurveScale {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  color: var(--spec-faint);
  font-size: 0.7rem;
}

.DesignSpec-CurveScale span {
  transition: color 240ms ease;
}

.DesignSpec-CurveScale span.is-on {
  color: var(--spec-ink);
}

/* A track with a knob at the current exponent. */
.DesignSpec-CurveScale i {
  position: relative;
  height: 1px;
  background: var(--spec-line-strong);
}

.DesignSpec-CurveScale i::after {
  content: '';
  position: absolute;
  top: -3px;
  left: calc(var(--p, 1) * 100%);
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--spec-accent);
  transform: translateX(-50%);
  transition: left 90ms ease-out;
}

.DesignSpec-CurveNote {
  margin: 0;
  color: var(--spec-muted);
  font-size: 0.74rem;
  line-height: 1.5;
}

/* ── 04 motion ────────────────────────────────────────────────────────── */
.DesignSpec-MotionPlot {
  width: 100%;
  height: clamp(2.4rem, 8vh, 5.6rem);
  overflow: visible;
}

.DesignSpec-MotionAxis,
.DesignSpec-MotionGuide,
.DesignSpec-MotionLine {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.DesignSpec-MotionAxis { stroke: var(--spec-line-strong); stroke-width: 1; }
.DesignSpec-MotionGuide { stroke: var(--spec-line); stroke-width: 1; stroke-dasharray: 3 3; }
.DesignSpec-MotionLine { stroke-width: 1.4; }
.DesignSpec-MotionLine.is-strong { stroke: var(--spec-ink); }
.DesignSpec-MotionLine.is-spring { stroke: var(--spec-accent); }

.DesignSpec-Tracks {
  display: grid;
  gap: 0.35rem;
}

.DesignSpec-Track {
  position: relative;
  display: flex;
  align-items: center;
  height: 0.9rem;
  border-bottom: 1px dashed var(--spec-line);
}

.DesignSpec-Track i {
  position: absolute;
  left: 0;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--spec-ink);
  transition: left 900ms cubic-bezier(0.23, 1, 0.32, 1);
}

.DesignSpec-Track.is-spring i {
  background: var(--spec-accent);
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}

.DesignSpec-Track em {
  margin-left: auto;
  color: var(--spec-faint);
  font-size: 0.66rem;
  font-style: normal;
}

.DesignSpec-Motion:hover .DesignSpec-Track i {
  left: calc(100% - 7px - 3.6rem);
}

/* ── 05 stats ─────────────────────────────────────────────────────────── */
.DesignSpec-StatList {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  flex: 1;
  align-content: center;
  gap: 0.6rem;
  margin: 0;
}

.DesignSpec-Stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.DesignSpec-Stat dd {
  margin: 0;
  font-size: clamp(1.25rem, 3.4vh, 1.9rem);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.DesignSpec-Stat dt {
  color: var(--spec-faint);
  font-size: 0.72rem;
}

/* ── Foot ─────────────────────────────────────────────────────────────── */
.DesignSpec-Foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
}

.DesignSpec-Cta {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.6rem;
  border-radius: 999px;
  background: var(--spec-ink);
  padding: 0 1.2rem;
  color: #07080a;
  font-size: 0.9rem;
  font-weight: 680;
  text-decoration: none;
  transition: background-color 180ms ease, transform 180ms ease;
}

.DesignSpec-Cta:hover {
  background: rgba(246, 247, 244, 0.86);
  transform: translateY(-1px);
}

/* Landing sections strip button borders, so the outline is a box-shadow. */
.DesignSpec-Install {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.6rem;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--spec-line-strong);
  padding: 0 0.45rem 0 1rem;
  color: var(--spec-muted);
  cursor: pointer;
  transition: box-shadow 180ms ease, color 180ms ease;
}

.DesignSpec-Install:hover {
  color: var(--spec-ink);
  box-shadow: inset 0 0 0 1px rgba(246, 247, 244, 0.32);
}

.DesignSpec-Install code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
}

.DesignSpec-InstallPrompt {
  color: var(--spec-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
}

/* A 1.8rem pad holding a 1rem glyph; the glyph itself was being stretched to
   the pad's size before. */
.DesignSpec-InstallIcon {
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.06);
  font-size: 0.95rem;
  transition: background-color 180ms ease, color 180ms ease;
}

.DesignSpec-Install:hover .DesignSpec-InstallIcon {
  background: rgba(246, 247, 244, 0.12);
}

.DesignSpec-InstallIcon.is-done {
  color: #4ade80;
}

.DesignSpec-InstallIcon > span {
  width: 1em;
  height: 1em;
}

.DesignSpec-Cta:focus-visible,
.DesignSpec-Install:focus-visible {
  box-shadow:
    inset 0 0 0 1px var(--spec-line-strong),
    0 0 0 2px rgba(64, 158, 255, 0.8);
  outline: none;
}

/* Short desktop windows: give the height to the board and the curve. */
@media (min-width: 769px) and (max-height: 820px) {
  .DesignSpec-Kicker {
    margin-bottom: 0.4rem;
  }

  .DesignSpec-Tracks {
    display: none;
  }

  .DesignSpec-Note {
    display: none;
  }
}

@media (max-width: 1100px) {
  .DesignSpec-Bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto;
  }

  .DesignSpec-Board,
  .DesignSpec-Type,
  .DesignSpec-Color,
  .DesignSpec-Curve,
  .DesignSpec-Motion,
  .DesignSpec-Stats {
    grid-column: auto;
    grid-row: auto;
  }

  .DesignSpec-Board,
  .DesignSpec-Curve {
    grid-column: 1 / -1;
  }

  .DesignSpec-Board {
    min-height: 22rem;
  }
}

@media (max-width: 768px) {
  .DesignSpec {
    height: auto;
    padding: 1rem 1.15rem 6rem;
  }

  .DesignSpec-Bento {
    grid-template-columns: minmax(0, 1fr);
  }

  .DesignSpec-Board {
    min-height: 0;
  }

  .DesignSpec-Figure {
    container-type: inline-size;
  }

  .DesignSpec-Hairline {
    width: 100%;
  }

  .DesignSpec-CurveBody {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .DesignSpec-Tile {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .DesignSpec-Track i,
  .DesignSpec-Swatches li,
  .DesignSpec-TypeAa {
    transition: none;
  }
}
</style>
