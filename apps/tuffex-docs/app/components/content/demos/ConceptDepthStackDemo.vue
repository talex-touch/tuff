<script setup lang="ts">
import { createZIndexAllocator, DEFAULT_Z_INDEX_SEED } from '@talex-touch/tuffex/utils'
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'

/**
 * The open-order z-index model as an exploded stack: the page at the bottom, then every open
 * overlay in the order it opened. The figure runs its own instance of TuffEx's allocator, apart
 * from the one the page's real overlays share: a popover or a modal calls `next()`, a drawer
 * does what TxDrawer does, `refresh(10000)` and then `next()`. Closing hands no number back.
 * Planes sit `SPACING` apart whatever their values: only their order decides what covers what.
 *
 * Each layer is a 3D wrapper holding the plane, a flat focusable button, and its tag. The tag
 * is counter-rotated against the scene (rotateZ(−TURN) rotateX(−TILT) undoes rotateX(TILT)
 * rotateZ(TURN)), so it faces the reader while staying pinned to the plane's outer corner. The
 * wrappers avoid `opacity` and `overflow`, either of which would flatten the tag back onto the
 * plane, so the enter and leave motion fades the plane and the tag themselves.
 */

type Kind = 'popover' | 'modal' | 'drawer'

interface Layer {
  id: number
  kind: Kind
  z: number
  /** What the allocator was asked, as the readout prints it. */
  call: string
}

const KINDS: Kind[] = ['popover', 'modal', 'drawer']
/** TxDrawer's own seed, which it lifts the counter to before taking a number. */
const DRAWER_Z_INDEX_SEED = 10000
const MAX_LAYERS = 6
const PAGE_KEY = 'page'

const TILT = 56
const TURN = -38
const TILT_SIN = Math.sin((TILT * Math.PI) / 180)
const PLANE_W = 150
const PLANE_D = 96
/** How far the active plane rises out of the stack, in px. */
const LIFT = 8
const SPACING = 30
const STAGE_HEIGHT = 360
const TAG_TRANSFORM = `rotateZ(${-TURN}deg) rotateX(${-TILT}deg) translate(8px, -50%)`
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

const { locale } = useI18n()

const allocator = createZIndexAllocator()
const layers = ref<Layer[]>([])
const counter = ref(allocator.get())
const lastCall = ref('')
const hovered = ref<string | null>(null)
const selected = ref<string | null>(null)
const active = computed(() => hovered.value ?? selected.value)
let serial = 0

const copy = computed(() => locale.value === 'zh'
  ? {
      label: '按打开顺序取号的分层爆炸图',
      open: { popover: '打开 Popover', modal: '打开 Modal', drawer: '打开 Drawer' } as Record<Kind, string>,
      closeTop: '关闭最上层',
      counter: '计数器',
      lastCall: '上一次调用',
      top: '最上层',
      closed: (z: number) => `关闭 ${z}，不退号`,
      kinds: { popover: 'Popover（TxPopover、TxDropdownMenu 等）', modal: 'Modal（TxModal）', drawer: 'Drawer（TxDrawer）' } as Record<Kind, string>,
      layerRole: (layer: Layer, order: number) => `第 ${order} 个打开，${layer.call} 取到 ${layer.z}。`,
      page: '页面',
      pageRole: '页面本身不取号；组件内部写死的小数值只在各自的层叠上下文里排先后。',
      hint: '再打开或关闭几层，然后把指针移到某一层上，或用 Tab 键逐层查看它的号码从哪来。',
      full: `最多叠 ${MAX_LAYERS} 层，先关掉最上面的再开。`,
      caption: `计数器是图里单独建的一个 TuffEx createZIndexAllocator，与页面上真实浮层用的那个互不影响。打开 Popover 或 Modal 时调用 next()；打开 Drawer 时照 TxDrawer 的做法，先 refresh(${DRAWER_Z_INDEX_SEED}) 再 next()。关闭不退号，再打开时号码接着往上走。层间距只表示先后，不按数值比例。`,
    }
  : {
      label: 'Exploded view of overlays numbered in the order they open',
      open: { popover: 'Open popover', modal: 'Open modal', drawer: 'Open drawer' } as Record<Kind, string>,
      closeTop: 'Close the top one',
      counter: 'Counter',
      lastCall: 'Last call',
      top: 'Top',
      closed: (z: number) => `Closed ${z}; no number handed back`,
      kinds: { popover: 'Popover (TxPopover, TxDropdownMenu and the like)', modal: 'Modal (TxModal)', drawer: 'Drawer (TxDrawer)' } as Record<Kind, string>,
      layerRole: (layer: Layer, order: number) => `The ${ORDINALS[order - 1] ?? `${order}th`} to open; ${layer.call} gave it ${layer.z}.`,
      page: 'Page',
      pageRole: 'The page itself takes no number; the small literals inside components order layers only within their own stacking contexts.',
      hint: 'Open or close a few more, then point at a layer, or Tab through them, to see where its number came from.',
      full: `${MAX_LAYERS} layers at most; close the top one before opening another.`,
      caption: `The counter is the figure's own instance of TuffEx's createZIndexAllocator, separate from the one the page's real overlays use. Opening a popover or a modal calls next(); opening a drawer does what TxDrawer does, refresh(${DRAWER_Z_INDEX_SEED}) and then next(). Closing hands no number back, so the next one keeps climbing. The spacing shows order, not magnitude.`,
    })

const full = computed(() => layers.value.length >= MAX_LAYERS)
const topLayer = computed(() => layers.value.at(-1) ?? null)
const activeIndex = computed(() => layers.value.findIndex(layer => String(layer.id) === active.value))
const activeLayer = computed(() => layers.value[activeIndex.value] ?? null)

const role = computed(() => {
  if (activeLayer.value)
    return { title: copy.value.kinds[activeLayer.value.kind], text: copy.value.layerRole(activeLayer.value, activeIndex.value + 1) }
  if (active.value === PAGE_KEY)
    return { title: copy.value.page, text: copy.value.pageRole }
  return null
})

const rise = SPACING * TILT_SIN

// The stack grows upwards as it opens; shifting it down by half its rise keeps it centred.
const sceneStyle = computed(() => ({
  width: `${PLANE_W}px`,
  height: `${PLANE_D}px`,
  transform: `translate(-50%, -50%) translateY(${(layers.value.length / 2) * rise}px) rotateX(${TILT}deg) rotateZ(${TURN}deg)`,
}))

function layerStyle(index: number, key: string) {
  const lift = active.value === key ? LIFT : 0
  return {
    'transform': `translateZ(${index * SPACING + lift}px)`,
    '--dz-fill': `${6 + index * 9}%`,
    '--dz-edge': `${28 + index * 8}%`,
  }
}

function open(kind: Kind) {
  if (full.value)
    return
  let call = 'next()'
  // TxDrawer: lift the counter to its seed first, then take the next number.
  if (kind === 'drawer') {
    allocator.refresh(DRAWER_Z_INDEX_SEED, 'drawer')
    call = `refresh(${DRAWER_Z_INDEX_SEED}) → next()`
  }
  const z = allocator.next()
  layers.value = [...layers.value, { id: ++serial, kind, z, call }]
  counter.value = allocator.get()
  lastCall.value = `${call} → ${z}`
}

function closeTop() {
  const top = topLayer.value
  if (!top)
    return
  layers.value = layers.value.slice(0, -1)
  if (active.value === String(top.id)) {
    hovered.value = null
    selected.value = null
  }
  counter.value = allocator.get()
  lastCall.value = copy.value.closed(top.z)
}

function onEnter(event: PointerEvent, key: string) {
  // A tap fires enter and leave around the click; the click selects instead.
  if (event.pointerType !== 'touch')
    hovered.value = key
}

function onLeave() {
  hovered.value = null
}

/** A dialog that opened a dropdown: the state the figure starts in. */
function seed() {
  allocator.reset(DEFAULT_Z_INDEX_SEED, 'figure')
  layers.value = []
  open('modal')
  open('popover')
}

function resetDemo() {
  hovered.value = null
  selected.value = null
  seed()
}

seed()

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure :caption="copy.caption" :stage-height="STAGE_HEIGHT">
    <div class="dz" :style="{ height: `${STAGE_HEIGHT}px` }" role="group" :aria-label="copy.label">
      <div class="dz__scene" :style="sceneStyle">
        <div
          class="dz__layer is-page"
          :class="{ 'is-active': active === PAGE_KEY }"
          :style="layerStyle(0, PAGE_KEY)"
          @pointerenter="onEnter($event, PAGE_KEY)"
          @pointerleave="onLeave"
          @click="selected = PAGE_KEY"
        >
          <button
            type="button"
            class="dz__plane"
            :aria-label="`${copy.page}: ${copy.pageRole}`"
            @focus="selected = PAGE_KEY"
          />
          <span class="dz__tag" aria-hidden="true" :style="{ transform: TAG_TRANSFORM }">
            <span>page</span>
            <span class="dz__tag-value">auto</span>
          </span>
        </div>
        <TransitionGroup name="dz-layer">
          <div
            v-for="(layer, index) in layers"
            :key="layer.id"
            class="dz__layer"
            :class="[`is-${layer.kind}`, { 'is-active': active === String(layer.id) }]"
            :style="layerStyle(index + 1, String(layer.id))"
            @pointerenter="onEnter($event, String(layer.id))"
            @pointerleave="onLeave"
            @click="selected = String(layer.id)"
          >
            <button
              type="button"
              class="dz__plane"
              :aria-label="`${layer.kind} ${layer.z}: ${copy.layerRole(layer, index + 1)}`"
              @focus="selected = String(layer.id)"
            />
            <span class="dz__tag" aria-hidden="true" :style="{ transform: TAG_TRANSFORM }">
              <span>{{ layer.kind }}</span>
              <span class="dz__tag-value">{{ layer.z }}</span>
            </span>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <template #controls>
      <TxButton v-for="kind in KINDS" :key="kind" size="sm" variant="secondary" :disabled="full" @click="open(kind)">
        {{ copy.open[kind] }}
      </TxButton>
      <TxButton size="sm" variant="secondary" :disabled="!topLayer" @click="closeTop">
        {{ copy.closeTop }}
      </TxButton>
    </template>

    <template #readout>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.counter }}</span>
        <span class="cfig-stat__value">{{ counter }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.lastCall }}</span>
        <span class="cfig-stat__value cfig-mono">{{ lastCall || '—' }}</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.top }}</span>
        <span class="cfig-stat__value">{{ topLayer ? `${topLayer.kind} ${topLayer.z}` : '—' }}</span>
      </span>
      <span class="dz__role" :class="{ 'is-hint': !role }">
        <template v-if="role">
          <strong>{{ role.title }}</strong>
          {{ role.text }}
        </template>
        <template v-else>
          {{ full ? copy.full : copy.hint }}
        </template>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.dz {
  position: relative;
  perspective: 1400px;
  perspective-origin: 50% 40%;
}

.dz__scene {
  position: absolute;
  top: 50%;
  /* Shifted left so the stack and the tags on its right sit centred together. */
  left: calc(50% - 46px);
  transform-style: preserve-3d;
  transition: transform 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.dz__layer {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 160ms ease;
}

.dz__plane {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--cfig-accent) var(--dz-edge), var(--cfig-line-strong));
  border-radius: 10px;
  background: color-mix(in srgb, color-mix(in srgb, var(--cfig-accent) var(--dz-fill), var(--tx-bg-color, #fff)) 88%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  appearance: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dz__layer.is-page .dz__plane {
  border-style: dashed;
}

.dz__layer.is-active .dz__plane {
  border-color: var(--cfig-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cfig-accent) 45%, transparent);
}

.dz__plane:focus-visible {
  outline: 2px solid var(--cfig-accent);
  outline-offset: 2px;
}

.dz__tag {
  position: absolute;
  top: 100%;
  left: 100%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid var(--cfig-line);
  border-radius: 6px;
  background: var(--tx-bg-color, #fff);
  color: var(--cfig-ink);
  font-family: var(--cfig-mono);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transform-origin: 0 0;
}

.dz__tag-value {
  color: var(--cfig-muted);
  font-variant-numeric: tabular-nums;
}

.dz__layer.is-active .dz__tag {
  border-color: var(--cfig-accent);
  color: var(--cfig-accent);
}

/* A layer drops onto the stack from above, and lifts away the same way. */
.dz-layer-enter-active,
.dz-layer-leave-active {
  transition:
    transform 160ms ease,
    translate 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.dz-layer-enter-active .dz__plane,
.dz-layer-enter-active .dz__tag,
.dz-layer-leave-active .dz__plane,
.dz-layer-leave-active .dz__tag {
  transition:
    opacity 220ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dz-layer-enter-from,
.dz-layer-leave-to {
  translate: 0 0 36px;
}

.dz-layer-enter-from .dz__plane,
.dz-layer-enter-from .dz__tag,
.dz-layer-leave-to .dz__plane,
.dz-layer-leave-to .dz__tag {
  opacity: 0;
}

.dz__role {
  flex: 1 1 220px;
  align-self: center;
  min-width: 0;
  color: var(--cfig-ink);
  font-size: 12px;
  text-wrap: pretty;
}

.dz__role strong {
  margin-right: 6px;
  font-weight: 600;
}

.dz__role.is-hint {
  color: var(--cfig-muted);
}

@media (prefers-reduced-motion: reduce) {
  .dz__scene,
  .dz__layer,
  .dz__plane,
  .dz-layer-enter-active,
  .dz-layer-leave-active,
  .dz-layer-enter-active .dz__plane,
  .dz-layer-enter-active .dz__tag,
  .dz-layer-leave-active .dz__plane,
  .dz-layer-leave-active .dz__tag {
    transition: none;
  }
}
</style>
