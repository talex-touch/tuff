<script setup lang="ts">
import { createSpringEase } from '@talex-touch/tuffex/utils'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TxCommandPalette } from '@talex-touch/tuffex/command-palette'
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import { useGlobalSearch } from '~/composables/useGlobalSearch'
import { currentOverlayLayer } from '~/utils/layers'

type SearchCommandItem = CommandPaletteItem & {
  to?: string
}

interface MotionFrame {
  x: number
  y: number
  scale: number
  /** How far the panel has faded in, as a share of each part's resting opacity. */
  opacity: number
  backdrop: number
}

/** An element, or one of its pseudo-elements, that fades with the panel. */
type FadeTarget = readonly [element: Element, pseudoElement?: string]

// Open: the panel fades in fast while it drifts in from the trigger's side and grows
// from 96%, settling on the house spring (`createSpringEase` defaults, ~3% overshoot,
// which on a 4% scale is under a pixel). Close is shorter so Esc reads as immediate.
const ENTER_MS = 440
const ENTER_FADE_MS = 140
const ENTER_SCALE = 0.96
const ENTER_DRIFT = { ratio: 0.06, max: 20 }
const BACKDROP_IN_MS = 200
const EXIT_MS = 160
const EXIT_SCALE = 0.97
const EXIT_DRIFT = { ratio: 0.03, max: 8 }
const BACKDROP_OUT_MS = 180
const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'
const SPRING_STOPS = 40

const { t } = useI18n()
const router = useRouter()
const {
  open,
  query,
  results,
  loading,
  unavailable,
  anchorRect,
  prefersReducedMotion,
  closeSearch,
  resetSearch,
  cancelSearch,
  preloadSearch,
  search,
} = useGlobalSearch()

const emptyText = computed(() => {
  if (loading.value)
    return t('search.loading')
  return unavailable.value ? t('search.unavailable') : t('search.empty')
})
// What the palette renders. It trails `open` on close so the exit can play on the live
// panel, and starts false so even the first open, which mounts this component, enters.
const paletteOpen = ref(false)
let motion: Animation[] = []
let springEasing: string | null = null
let scrollLockState: {
  htmlOverflow: string
  bodyPaddingRight: string
} | null = null

const hotspotCommands = computed<SearchCommandItem[]>(() => [
  {
    id: 'hotspot-start-guide',
    title: t('search.hotspots.startGuide.title'),
    description: t('search.hotspots.startGuide.description'),
    icon: 'i-carbon-rocket',
    keywords: ['guide', 'start', 'tutorial', '入门', '教程'],
    to: '/docs/guide/start',
  },
  {
    id: 'hotspot-developer-docs',
    title: t('search.hotspots.developerDocs.title'),
    description: t('search.hotspots.developerDocs.description'),
    icon: 'i-carbon-document',
    keywords: ['docs', 'developer', 'sdk', '文档', '开发'],
    to: '/docs',
  },
  {
    id: 'hotspot-plugin-store',
    title: t('search.hotspots.pluginStore.title'),
    description: t('search.hotspots.pluginStore.description'),
    icon: 'i-carbon-store',
    keywords: ['store', 'plugin', '插件', '商店'],
    to: '/store',
  },
  {
    id: 'hotspot-updates',
    title: t('search.hotspots.updates.title'),
    description: t('search.hotspots.updates.description'),
    icon: 'i-carbon-download',
    keywords: ['updates', 'download', 'release', '更新', '下载'],
    to: '/updates',
  },
])

const resultCommands = computed<SearchCommandItem[]>(() => {
  const queryKeyword = query.value.trim()
  return results.value.map((result) => {
    const sourceLabel = result.source === 'docs'
      ? t('search.category.docs')
      : result.source === 'page'
        ? t('search.category.pages')
        : t('search.category.features')
    const description = result.description
      ? `${sourceLabel} · ${result.description}`
      : sourceLabel
    return {
      id: result.id,
      title: result.title,
      description,
      icon: result.icon,
      keywords: [queryKeyword, ...(result.keywords ?? [])].filter(Boolean),
      to: result.to,
    }
  })
})

const commands = computed<SearchCommandItem[]>(() => {
  if (!query.value.trim())
    return hotspotCommands.value
  return resultCommands.value.slice(0, 4)
})

function onQueryUpdate(value: string) {
  // The palette clears its query once the exit has finished; the reset is ours to do.
  if (open.value)
    search(value)
}

function onPaletteModelUpdate(value: boolean) {
  if (!value)
    closeSearch()
}

function onSelect(item: CommandPaletteItem) {
  const target = (item as SearchCommandItem).to
  if (target)
    navigateTo(target)
}

function getPanelElement() {
  return document.querySelector<HTMLElement>('.NexusGlobalSearchPanel')
}

function getOverlayElement() {
  return document.querySelector<HTMLElement>('.NexusGlobalSearchOverlay')
}

/**
 * Publish the layer TxCommandPalette just allocated so the panel rides the same
 * number as its backdrop instead of relying on implicit stacking order.
 */
function syncSearchLayer() {
  const overlay = getOverlayElement()
  if (!overlay)
    return
  overlay.style.setProperty('--nexus-search-layer', String(currentOverlayLayer()))
}

/**
 * `overflow: hidden` on the root keeps the scroll offset, so the docs sidebar and outline
 * stay stuck where they were. Pinning the body with `position: fixed` moved the scroll onto
 * the body instead and carried both out of view behind the overlay. The padding stands in for
 * a classic scrollbar, which would otherwise vanish and shift the page sideways.
 */
function lockPageScroll() {
  if (!import.meta.client || scrollLockState)
    return
  const root = document.documentElement
  const scrollbarWidth = window.innerWidth - root.clientWidth
  scrollLockState = {
    htmlOverflow: root.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight,
  }
  root.style.overflow = 'hidden'
  if (scrollbarWidth > 0)
    document.body.style.paddingRight = `${scrollbarWidth}px`
}

function unlockPageScroll() {
  if (!import.meta.client || !scrollLockState)
    return
  document.documentElement.style.overflow = scrollLockState.htmlOverflow
  document.body.style.paddingRight = scrollLockState.bodyPaddingRight
  scrollLockState = null
}

/**
 * The house spring as a CSS `linear()` easing, so WAAPI can run it on the compositor.
 * Same fallback as tuffex's `resolveTransition` where `linear()` is unsupported.
 */
function resolveSpringEasing() {
  if (springEasing)
    return springEasing
  if (!CSS.supports('transition-timing-function', 'linear(0, 1)')) {
    springEasing = 'cubic-bezier(0.22, 1, 0.36, 1)'
    return springEasing
  }
  const ease = createSpringEase()
  const stops = Array.from({ length: SPRING_STOPS + 1 }, (_, index) =>
    Math.round(ease(index / SPRING_STOPS) * 1e4) / 1e4)
  springEasing = `linear(${stops.join(', ')})`
  return springEasing
}

/**
 * A short offset from the panel's resting centre towards the trigger. The panel used to
 * morph out of the 32px trigger itself, squashing its content to half its aspect ratio;
 * a hint of direction keeps the link to the button without the distortion.
 */
function resolveDrift(panel: HTMLElement, drift: { ratio: number, max: number }) {
  const anchor = anchorRect.value
  if (!anchor)
    return { x: 0, y: 0 }
  // Offsets ignore transforms, so this is the resting centre even mid-animation.
  const dx = anchor.left + anchor.width / 2 - (panel.offsetLeft + panel.offsetWidth / 2)
  const dy = anchor.top + anchor.height / 2 - (panel.offsetTop + panel.offsetHeight / 2)
  const distance = Math.hypot(dx, dy)
  if (!distance)
    return { x: 0, y: 0 }
  const length = Math.min(drift.max, distance * drift.ratio)
  return { x: dx / distance * length, y: dy / distance * length }
}

/**
 * What fades with the panel. Not the panel itself: an element whose opacity animates is the
 * backdrop root of every backdrop filter inside it, so the palette's material would sample nothing
 * but the panel for the whole motion. As in TxCommandPalette's own fade, the parts fade instead:
 * the body, the rim and shadow, and the surface, layer by layer while a layer blurs, and whole
 * when none does (high contrast drops them).
 */
function fadeTargets(panel: HTMLElement): FadeTarget[] {
  const targets: FadeTarget[] = [[panel, '::after']]
  const body = panel.querySelector('.tx-command-palette__body')
  if (body)
    targets.push([body])
  const surface = panel.querySelector('.tx-command-palette__surface')
  if (!surface)
    return targets
  const blurs = Array.from(surface.querySelectorAll('.tx-base-surface__layer--glass, .tx-base-surface__layer--filter'))
    .some(layer => getComputedStyle(layer).display !== 'none')
  if (!blurs) {
    targets.push([surface])
    return targets
  }
  targets.push([surface, '::before'])
  for (const layer of Array.from(surface.querySelectorAll('.tx-base-surface__layer')))
    targets.push([layer])
  return targets
}

function readOpacity([element, pseudoElement]: FadeTarget) {
  return Number.parseFloat(getComputedStyle(element, pseudoElement).opacity)
}

/** Fades a part from `from` to `to`, each a share of the opacity it rests at. */
function fade(target: FadeTarget, from: number, to: number, options: KeyframeAnimationOptions) {
  const [element, pseudoElement] = target
  const rest = readOpacity(target)
  return element.animate([{ opacity: from * rest }, { opacity: to * rest }], { ...options, pseudoElement })
}

function readFrame(panel: HTMLElement, overlay: HTMLElement): MotionFrame {
  const style = getComputedStyle(panel)
  const [x = 0, y = 0] = style.translate === 'none'
    ? []
    : style.translate.split(' ').map(value => Number.parseFloat(value))
  // The body rests fully opaque, so its opacity is the share every part has faded to.
  const body = panel.querySelector('.tx-command-palette__body')
  return {
    x,
    y,
    scale: style.scale === 'none' ? 1 : Number.parseFloat(style.scale),
    opacity: body ? readOpacity([body]) : 1,
    backdrop: readOpacity([overlay, '::before']),
  }
}

function isMoving() {
  return motion.some(animation => animation.playState === 'running')
}

function cancelMotion() {
  for (const animation of motion)
    animation.cancel()
  motion = []
}

/**
 * Starts from wherever an interrupted exit left the panel, so reopening mid-close turns
 * around instead of jumping back to the start.
 */
function playEnter(panel: HTMLElement, overlay: HTMLElement) {
  overlay.style.pointerEvents = ''
  overlay.style.opacity = ''
  const interrupted = isMoving() ? readFrame(panel, overlay) : null
  cancelMotion()
  if (prefersReducedMotion())
    return
  const drift = resolveDrift(panel, ENTER_DRIFT)
  const from = interrupted ?? { x: drift.x, y: drift.y, scale: ENTER_SCALE, opacity: 0, backdrop: 0 }
  // The parts' resting opacities are read here, with the interrupted motion cancelled.
  motion = [
    overlay.animate(
      [{ opacity: from.backdrop }, { opacity: 1 }],
      { duration: BACKDROP_IN_MS, easing: EASE_OUT, pseudoElement: '::before' },
    ),
    ...fadeTargets(panel).map(target =>
      fade(target, from.opacity, 1, { duration: ENTER_FADE_MS, easing: EASE_OUT })),
    panel.animate(
      [{ translate: `${from.x}px ${from.y}px`, scale: from.scale }, { translate: '0px 0px', scale: 1 }],
      { duration: ENTER_MS, easing: resolveSpringEasing() },
    ),
  ]
}

/**
 * Resolves once the exit has played, or immediately when there is nothing to play.
 * `fill: 'forwards'` keeps the panel hidden until the palette removes it.
 */
function playExit(): Promise<void> {
  const panel = getPanelElement()
  const overlay = getOverlayElement()
  if (!panel || !overlay) {
    cancelMotion()
    return Promise.resolve()
  }
  const from = readFrame(panel, overlay)
  cancelMotion()
  // Let a click land on the page while the backdrop is still fading out.
  overlay.style.pointerEvents = 'none'
  if (prefersReducedMotion()) {
    overlay.style.opacity = '0'
    return Promise.resolve()
  }
  const drift = resolveDrift(panel, EXIT_DRIFT)
  const options: KeyframeAnimationOptions = { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' }
  motion = [
    overlay.animate(
      [{ opacity: from.backdrop }, { opacity: 0 }],
      { ...options, duration: BACKDROP_OUT_MS, pseudoElement: '::before' },
    ),
    ...fadeTargets(panel).map(target => fade(target, from.opacity, 0, options)),
    panel.animate(
      [{ translate: `${from.x}px ${from.y}px`, scale: from.scale }, { translate: `${drift.x}px ${drift.y}px`, scale: EXIT_SCALE }],
      options,
    ),
  ]
  return Promise.all(motion.map(animation => animation.finished)).then(() => undefined)
}

async function show() {
  lockPageScroll()
  preloadSearch()
  paletteOpen.value = true
  await nextTick()
  const panel = getPanelElement()
  const overlay = getOverlayElement()
  if (!open.value || !panel || !overlay)
    return
  syncSearchLayer()
  playEnter(panel, overlay)
  // A reopen during the exit keeps the same palette, which only focuses on a fresh open.
  if (!overlay.contains(document.activeElement))
    overlay.querySelector<HTMLInputElement>('.tx-command-palette__input')?.focus()
}

function hide() {
  unlockPageScroll()
  cancelSearch()
  if (!paletteOpen.value)
    return
  playExit().then(() => {
    if (open.value)
      return
    // The finished animations go with the overlay; cancelling them here would flash it.
    motion = []
    paletteOpen.value = false
    resetSearch()
  }, () => {
    // Cancelled by a reopen, which now owns the panel.
  })
}

watch(open, (value) => {
  if (value)
    void show()
  else
    hide()
})

// Closes as a navigation starts rather than when it lands. One already under way when the search
// opened, from a link clicked just before the trigger, lands after it, and closing then undid the
// open the reader had only just asked for.
const removeNavigationGuard = router.beforeEach(() => {
  if (open.value)
    closeSearch()
})

// Mounted by an open, this shows straight away rather than from onMounted, which waits for the
// whole page when the open came while it was still loading. Mounted idle, it fetches the index
// now, so the first search does not wait for it: over a slow link that took seconds.
if (open.value)
  void show()
else
  preloadSearch()

onBeforeUnmount(() => {
  removeNavigationGuard()
  cancelMotion()
  cancelSearch()
  unlockPageScroll()
})
</script>

<template>
  <TxCommandPalette
    :model-value="paletteOpen"
    :query="query"
    :commands="commands"
    :placeholder="t('search.placeholder')"
    :empty-text="emptyText"
    overlay-class="NexusGlobalSearchOverlay"
    panel-class="NexusGlobalSearchPanel"
    :max-height="195"
    @update:model-value="onPaletteModelUpdate"
    @update:query="onQueryUpdate"
    @select="onSelect"
  >
    <template #empty="{ emptyText: slotEmptyText }">
      <div class="NexusGlobalSearchEmpty">
        <span class="i-carbon-search-locate" aria-hidden="true" />
        <span>{{ slotEmptyText }}</span>
      </div>
    </template>

    <template #footer>
      <div class="NexusGlobalSearchFooter">
        <div
          class="NexusGlobalSearchShortcuts"
          :aria-label="t('search.shortcuts.label')"
        >
          <span class="NexusGlobalSearchShortcut">
            <kbd>⌘/Ctrl K</kbd>
            <span>{{ t('search.shortcuts.open') }}</span>
          </span>
          <span class="NexusGlobalSearchShortcut">
            <kbd>/</kbd>
            <span>{{ t('search.shortcuts.quickOpen') }}</span>
          </span>
          <span class="NexusGlobalSearchShortcut">
            <kbd>Esc</kbd>
            <span>{{ t('search.shortcuts.close') }}</span>
          </span>
        </div>
        <div class="NexusGlobalSearchPowered">
          {{ t('search.poweredBy') }}
        </div>
      </div>
    </template>
  </TxCommandPalette>
</template>

<style scoped lang="scss">
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay) {
  // Optical centre instead of the base flex-start layout. Top and bottom padding
  // must stay equal for the centring maths below to hold; the padding only acts
  // as a safety margin once the panel runs out of room.
  align-items: center;
  padding: 16px;
  overscroll-behavior: contain;
  touch-action: none;
}

// On the palette's dim layer, not the overlay: the overlay fading would be the panel's backdrop
// root, and the panel's material would sample only the backdrop instead of the page.
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay::before) {
  background:
    linear-gradient(180deg, rgba(4, 7, 13, 0.58), rgba(4, 7, 13, 0.74)),
    rgba(4, 7, 13, 0.36);
}

// The backdrop and panel are animated with WAAPI in the script. The palette's own CSS
// fades would compete with that (a running CSS transition outranks an animation), so they
// are switched off here: the classes still come and go, but change nothing.
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay.tx-command-palette-moving) {
  --tx-command-palette-fade: none;
}

:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay.tx-command-palette-enter-active::before),
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay.tx-command-palette-leave-active::before) {
  transition: none;
}

:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay.tx-command-palette-enter-from::before),
:global(.NexusGlobalSearchOverlay.tx-command-palette__overlay.tx-command-palette-leave-to::before) {
  opacity: 1;
}

:global(.NexusGlobalSearchPanel.tx-command-palette__panel) {
  // The panel reserves 30vh below itself, which pushes the flex-centred box up by
  // half of that. Resting top therefore lands on `50vh - panelHeight / 2 - 15vh`,
  // i.e. the optical centre rather than the geometric one. The open and close motion
  // only animates `translate` and `scale`, which settle back to none, so this stays
  // the resting position without any JS coordinate maths.
  margin-bottom: 30vh;
  position: relative;
  z-index: var(--nexus-search-layer, 1);
  width: min(593px, calc(100vw - 32px));
  border-radius: 21px;
}

// The rim and the shadow are the palette's own layer, so they fade with the panel's parts.
:global(.NexusGlobalSearchPanel.tx-command-palette__panel::after) {
  border-color: color-mix(in srgb, var(--tx-border-color, #d4d7de) 62%, transparent);
  box-shadow:
    0 18px 55px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

:global(.NexusGlobalSearchPanel .tx-command-palette__search) {
  min-height: 52px;
  padding: 0 18px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__search-icon) {
  color: var(--tx-text-color-secondary, #8b8f98);
}

:global(.NexusGlobalSearchPanel .tx-command-palette__input) {
  font-size: 18px;
  font-weight: 500;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__list) {
  // As tall as its cap, so hotspots, one hit and the empty state all give the panel
  // the same height. The panel is centred, and every change in height used to move
  // the input up or down by half of it while the user was typing.
  min-height: var(--tx-command-palette-max);
  padding: 10px;
  gap: 5px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__item) {
  min-height: 44px;
  border-radius: 12px;
  padding: 7px 10px;
  gap: 10px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__icon) {
  width: 21px;
  flex: 0 0 21px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__icon .tuff-icon),
:global(.NexusGlobalSearchPanel .tx-command-palette__search-icon .tuff-icon) {
  font-size: 21px !important;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__title) {
  font-size: 16px;
  line-height: 1.25;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__desc) {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.NexusGlobalSearchEmpty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 13px;
}

.NexusGlobalSearchEmpty span:first-child {
  font-size: 23px;
}

:global(.NexusGlobalSearchPanel .tx-command-palette__empty) {
  flex: 1;
  min-height: 75px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}

.NexusGlobalSearchFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 13px 10px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #ebeef5) 72%, transparent);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.NexusGlobalSearchShortcuts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  max-width: 390px;
}

.NexusGlobalSearchShortcut {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.NexusGlobalSearchShortcut kbd {
  min-width: 23px;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #d4d7de) 78%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 84%, transparent);
  color: var(--tx-text-color-primary, #303133);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  text-align: center;
}

.NexusGlobalSearchPowered {
  flex: 0 0 auto;
  white-space: nowrap;
  font-weight: 500;
}

:global(.dark .NexusGlobalSearchPanel.tx-command-palette__panel::after) {
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__search) {
  border-bottom-color: rgba(255, 255, 255, 0.13);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__item.is-active) {
  background: rgba(255, 255, 255, 0.08);
}

:global(.dark .NexusGlobalSearchPanel .tx-command-palette__shortcut) {
  border-color: rgba(255, 255, 255, 0.14);
}

:global(.dark .NexusGlobalSearchFooter) {
  border-top-color: rgba(255, 255, 255, 0.1);
}

:global(.dark .NexusGlobalSearchShortcut kbd) {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}

@media (max-width: 640px) {
  :global(.NexusGlobalSearchOverlay.tx-command-palette__overlay) {
    padding: 12px 10px;
  }

  :global(.NexusGlobalSearchPanel.tx-command-palette__panel) {
    // Short viewports (and the on-screen keyboard) leave far less headroom, so
    // lift by 7.5vh instead of 15vh to keep the panel fully on screen.
    margin-bottom: 15vh;
    width: calc(100vw - 20px);
    border-radius: 14px;
  }

  :global(.NexusGlobalSearchPanel .tx-command-palette__search) {
    min-height: 40px;
    padding: 0 12px;
  }

  :global(.NexusGlobalSearchPanel .tx-command-palette__input) {
    font-size: 14px;
  }

  .NexusGlobalSearchFooter {
    align-items: flex-start;
    flex-direction: column;
  }

  .NexusGlobalSearchPowered {
    white-space: normal;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
