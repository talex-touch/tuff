<script setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { TxTransitionPush } from '@talex-touch/tuffex/transition'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The card of the ⌘K panel (`views/meta/MetaOverlay.vue`): a header naming the item, over one page
 * at a time — the action list, the Flow targets, the Flow confirmation. A page pushes in from the
 * inline end and goes back the other way, under a header and a card that stay where they are; the
 * card's height follows the pages, eased only while they switch (`TxTransitionPush`).
 *
 * The owner keeps what is its own: the dim the card sits on, where it is anchored (the custom
 * properties of `resolveMetaPanelCssVars`, set on the owner's root), the keyboard, and the pages.
 * It renders the current page into the default slot as one keyed root with the class
 * `MetaPanel-Page`, built from `MetaPanelList` and `MetaPanelFilter` (or the confirmation). That
 * content carries the owner's scope id, not this one, so the styles below reach it through
 * `:deep()`.
 */

const props = defineProps<{
  /** Header text, and the dialog's accessible name. */
  title: string
  icon: ITuffIcon
  /**
   * The owner window's motion gate (`useMotionGate().shouldAnimate`). Passed in, not called
   * here: a window has one gate, and a second call would be a second writer of the low-battery
   * attribute.
   */
  shouldAnimate: () => boolean
  /** Key of the page on screen. */
  page: string
  /** Which way the next page switch goes: `forward` pushes in, `back` returns. */
  direction: 'forward' | 'back'
  /** Draws the back button: there is a page to go back to. */
  canGoBack: boolean
}>()

const emit = defineEmits<{
  /** The back button was pressed. */
  (e: 'back'): void
}>()

const { t } = useI18n()

/**
 * How long a page switch slides, and the header's fades and glide below with it. With the motion
 * gate closed it is 0: the page is swapped in place.
 */
const PAGE_SWITCH_MS = 220
/** The curve the pages slide on, given to `TxTransitionPush` too, so the header moves with them. */
const PAGE_SWITCH_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)'

const headerIconRef = ref<{ $el?: unknown } | null>(null)
const headerTitleRef = ref<HTMLElement | null>(null)
let leadLeft: number | null = null
let leadAnimations: Animation[] = []

/** The icon and the title: the pair the back button pushes along. */
function headerLead(): HTMLElement[] {
  return [headerIconRef.value?.$el, headerTitleRef.value].filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )
}

/**
 * The icon and the title glide when the back button comes or goes. The button joins the row as the
 * switch starts and leaves it at once (out of flow while it fades), so the pair beside it lands in
 * its new place in one frame; read on both sides of the patch, it eases there with the page instead.
 * Read mid-glide, the first position is where the pair is drawn, so a quick back-and-forth turns
 * around in place.
 */
watch(
  () => props.canGoBack,
  () => {
    leadLeft = headerTitleRef.value?.getBoundingClientRect().left ?? null
  },
  { flush: 'pre' }
)
watch(
  () => props.canGoBack,
  () => {
    const first = leadLeft
    leadLeft = null
    // Dropped before the last position is read, which must be the layout's, not the old glide's.
    for (const animation of leadAnimations) animation.cancel()
    leadAnimations = []
    const title = headerTitleRef.value
    if (first === null || !title || !props.shouldAnimate()) return
    const dx = first - title.getBoundingClientRect().left
    if (Math.abs(dx) < 0.5) return
    leadAnimations = headerLead()
      .filter((el) => typeof el.animate === 'function')
      .map((el) =>
        el.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], {
          duration: PAGE_SWITCH_MS,
          easing: PAGE_SWITCH_EASING
        })
      )
  },
  { flush: 'post' }
)
</script>

<template>
  <section
    class="MetaPanel"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :data-page="props.page"
  >
    <header class="MetaPanel-Header">
      <Transition name="meta-panel-header">
        <button
          v-if="canGoBack"
          type="button"
          class="MetaPanel-Back"
          :aria-label="t('layout.back')"
          :title="t('layout.back')"
          @click="emit('back')"
        >
          <i class="MetaPanel-BackIcon i-ri-arrow-left-s-line" aria-hidden="true" />
        </button>
      </Transition>
      <TuffIcon ref="headerIconRef" :icon="icon" :size="16" class="MetaPanel-HeaderIcon" />
      <span ref="headerTitleRef" class="MetaPanel-HeaderTitle" :title="title">{{ title }}</span>
      <Transition name="meta-panel-header">
        <span v-if="$slots['header-meta']" class="MetaPanel-HeaderMeta">
          <slot name="header-meta" />
        </span>
      </Transition>
    </header>

    <TxTransitionPush
      class="MetaPanel-Body"
      :direction="direction"
      :duration="shouldAnimate() ? PAGE_SWITCH_MS : 0"
      :easing="PAGE_SWITCH_EASING"
    >
      <slot />
    </TxTransitionPush>
  </section>
</template>

<style scoped lang="scss">
.MetaPanel {
  position: absolute;
  right: var(--meta-panel-right);
  bottom: var(--meta-panel-bottom);
  display: flex;
  flex-direction: column;
  width: var(--meta-panel-width);
  max-width: calc(100vw - 2 * var(--meta-panel-right));
  max-height: min(
    var(--meta-panel-max-height),
    calc(100vh - var(--meta-panel-top) - var(--meta-panel-bottom))
  );
  overflow: hidden;
  border-radius: 12px;
  background: var(--tx-bg-color);
  // A ring, not a border, next to a shadow (tuffex-design-rules).
  box-shadow:
    0 0 0 1px var(--tx-border-color-lighter),
    var(--tx-elevation-4);
  transform-origin: bottom right;
}

.MetaPanel-Header {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--meta-header-height);
  padding: 0 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.MetaPanel-Back {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  // Pulls the chevron's own side bearing to the header's edge.
  margin-left: -4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 1px;
  }
}

.MetaPanel-BackIcon {
  display: inline-block;
  width: 16px;
  height: 16px;
  font-size: 16px;
}

.MetaPanel-HeaderIcon {
  flex: none;
}

.MetaPanel-HeaderTitle {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.MetaPanel-HeaderMeta {
  flex: none;
  margin-left: auto;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

// The back button and the page name fade while the page under them pushes. Out of the row as
// they leave, so the title moves once, as the switch starts (the glide above eases it), and not
// again when the fade ends.
.meta-panel-header-enter-active,
.meta-panel-header-leave-active {
  transition: opacity 0.22s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.meta-panel-header-enter-from,
.meta-panel-header-leave-to {
  opacity: 0;
}

.MetaPanel-Back.meta-panel-header-leave-active {
  position: absolute;
  left: 12px;
}

.MetaPanel-HeaderMeta.meta-panel-header-leave-active {
  position: absolute;
  right: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .meta-panel-header-enter-active,
  .meta-panel-header-leave-active {
    transition: none;
  }
}

// The pages lay out as the list did: the card caps its height, and the page's list scrolls inside
// it. A column here, not TxTransitionPush's flow root, so a capped card squeezes the page instead
// of cutting it off.
.MetaPanel-Body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.MetaPanel-Body :deep(.MetaPanel-Page) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
</style>
