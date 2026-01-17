<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'
import TxTabHeader from './TxTabHeader.vue'
import TxTabItem from './TxTabItem.vue'

const qualifiedName = ['TxTabItem', 'TxTabItemGroup', 'TxTabHeader']

export default defineComponent({
  name: 'TxTabs',
  props: {
    modelValue: String,
    defaultValue: String,
    placement: { type: String, default: 'left' },
    offset: { type: Number, default: 0 },
    navMinWidth: { type: Number, default: 220 },
    navMaxWidth: { type: Number, default: 320 },
    contentPadding: { type: Number, default: 12 },
    contentScrollable: { type: Boolean, default: true },
    autoHeight: { type: Boolean, default: false },
    autoWidth: { type: Boolean, default: false },
    indicatorVariant: { type: String, default: 'line' },
    indicatorMotion: { type: String, default: 'stretch' },
    indicatorMotionStrength: { type: Number, default: 1 },
    autoHeightDurationMs: { type: Number, default: 250 },
    autoHeightEasing: { type: String, default: 'ease' },
    animation: { type: Object as PropType<any>, default: undefined },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { slots, emit, expose }) {
    const activeNode = ref<any>()
    const slotWrapper = ref<any>()
    const autoSizerRef = ref<any>()

    const placement = computed(() => {
      const v = props.placement
      return (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') ? v : 'left'
    })

    const isVertical = computed(() => placement.value === 'left' || placement.value === 'right')

    const indicatorVariant = computed(() => {
      const v = props.indicatorVariant
      if (v === 'line' || v === 'pill' || v === 'block' || v === 'dot' || v === 'outline')
        return v
      return 'line'
    })

    const indicatorMotion = computed(() => {
      const v = props.indicatorMotion
      if (v === 'stretch' || v === 'warp' || v === 'glide' || v === 'snap' || v === 'spring')
        return v
      return 'stretch'
    })

    const indicatorMotionStrength = computed(() => {
      return typeof props.indicatorMotionStrength === 'number'
        ? Math.max(0, props.indicatorMotionStrength)
        : 1
    })

    function getNodeName(vnode: any): string {
      return vnode?.props?.name ?? ''
    }

    function setActive(vnode: any) {
      activeNode.value = vnode
      emit('update:modelValue', getNodeName(vnode))
      emit('change', getNodeName(vnode))
    }

    const animationSize = computed(() => {
      const raw = props.animation?.size
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: props.autoHeightDurationMs,
          easing: props.autoHeightEasing,
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : props.autoHeightDurationMs,
          easing: typeof raw.easing === 'string' ? raw.easing : props.autoHeightEasing,
        }
      }
      return {
        enabled: !!(props.autoHeight || props.autoWidth),
        durationMs: props.autoHeightDurationMs,
        easing: props.autoHeightEasing,
      }
    })

    const animationIndicator = computed(() => {
      const raw = props.animation?.indicator
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: 180,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 180,
          easing: typeof raw.easing === 'string' ? raw.easing : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }
      }
      return {
        enabled: true,
        durationMs: 180,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      }
    })

    const animationNav = computed(() => {
      const raw = props.animation?.nav
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: 220,
          easing: 'ease',
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 220,
          easing: typeof raw.easing === 'string' ? raw.easing : 'ease',
        }
      }
      return {
        enabled: true,
        durationMs: 220,
        easing: 'ease',
      }
    })

    const animationContent = computed(() => {
      const raw = props.animation?.content
      if (typeof raw === 'boolean')
        return { enabled: raw }
      if (raw && typeof raw === 'object')
        return { enabled: raw.enabled !== false }
      return { enabled: true }
    })

    const widthAnimEnabled = computed(() => {
      return animationSize.value.enabled && !!props.autoWidth
    })

    const heightAnimEnabled = computed(() => {
      return animationSize.value.enabled && (!!props.autoHeight || !props.contentScrollable)
    })

    const contentScrollable = computed(() => {
      return props.contentScrollable && !heightAnimEnabled.value
    })

    const sizeAnimEnabled = computed(() => {
      return widthAnimEnabled.value || heightAnimEnabled.value
    })

    async function runAutoHeight(action: () => void) {
      if (!sizeAnimEnabled.value) {
        action()
        return
      }

      const api = autoSizerRef.value
      if (api?.flip) {
        await api.flip(async () => {
          action()
        })
        return
      }

      action()
      api?.refresh?.()
    }

    async function exposedFlip(action: () => void | Promise<void>) {
      const api = autoSizerRef.value
      if (api?.flip)
        return api.flip(action)
      return action()
    }

    async function exposedAction(fn: any, optionsOrDetect?: any) {
      const api = autoSizerRef.value
      if (api?.action)
        return api.action(fn, optionsOrDetect)
      await fn(undefined)
      return { changedKeys: [] as string[] }
    }

    expose({
      refresh: () => autoSizerRef.value?.refresh?.(),
      flip: exposedFlip,
      action: exposedAction,
      size: () => autoSizerRef.value?.size?.value,
    })

    function findByName(name: string): any {
      const nodes = slots.default?.() ?? []
      return nodes.find(n => n?.props?.name === name)
    }

    const pointerElRef = ref<HTMLElement | null>(null)
    const pointerInnerElRef = ref<HTMLElement | null>(null)
    const navElRef = ref<HTMLElement | null>(null)
    const navInnerElRef = ref<HTMLElement | null>(null)

    const contentRootElRef = ref<HTMLElement | null>(null)

    let contentResizeObserver: ResizeObserver | null = null
    let autoSizerRefreshMicrotask: Promise<void> | null = null

    let pointerAnimTimer: number | null = null

    onBeforeUnmount(() => {
      if (pointerAnimTimer != null)
        window.clearTimeout(pointerAnimTimer)
      pointerAnimTimer = null

      if (contentResizeObserver) {
        contentResizeObserver.disconnect()
        contentResizeObserver = null
      }
      autoSizerRefreshMicrotask = null
    })

    function scheduleAutoSizerRefresh() {
      if (!sizeAnimEnabled.value)
        return
      if (autoSizerRefreshMicrotask)
        return

      autoSizerRefreshMicrotask = Promise.resolve().then(() => {
        autoSizerRefreshMicrotask = null
        autoSizerRef.value?.refresh?.()
      })
    }

    // Disabled continuous content ResizeObserver to avoid flicker loops
    // AutoSizer will only refresh on manual tab switches, not content changes
    watch(
      () => [contentRootElRef.value, sizeAnimEnabled.value] as const,
      ([el, enabled]) => {
        if (contentResizeObserver) {
          contentResizeObserver.disconnect()
          contentResizeObserver = null
        }
        // ResizeObserver disabled - only refresh on tab switch, not content change
      },
      { immediate: true },
    )

    function playPointerAnim() {
      const el = pointerInnerElRef.value
      if (!el)
        return

      const motions = ['stretch', 'warp', 'glide', 'snap', 'spring'] as const
      for (const m of motions) {
        el.classList.remove(`tx-tabs__pointer--motion-${m}-x`)
        el.classList.remove(`tx-tabs__pointer--motion-${m}-y`)
      }

      const cls = isVertical.value
        ? `tx-tabs__pointer--motion-${indicatorMotion.value}-y`
        : `tx-tabs__pointer--motion-${indicatorMotion.value}-x`

      void el.offsetWidth
      el.classList.add(cls)

      if (pointerAnimTimer != null)
        window.clearTimeout(pointerAnimTimer)
      pointerAnimTimer = window.setTimeout(() => {
        el.classList.remove(cls)
        pointerAnimTimer = null
      }, Math.max(120, (animationIndicator.value?.durationMs ?? 180) + 120))
    }

    function applyPointerFor(vnodeOrEl: any) {
      const pointerEl = pointerElRef.value
      const nodeEl = (vnodeOrEl?.el ?? vnodeOrEl) as HTMLElement | undefined
      const navInnerEl = navInnerElRef.value
      if (!pointerEl || !nodeEl || !navInnerEl)
        return

      const nodeRect = nodeEl.getBoundingClientRect()
      const navInnerRect = navInnerEl.getBoundingClientRect()
      const diff = props.offset || 0

      pointerEl.style.opacity = '1'

      pointerEl.style.width = ''
      pointerEl.style.height = ''

      const variant = indicatorVariant.value

      if (isVertical.value) {
        const topBase = nodeRect.top - navInnerRect.top + navInnerEl.scrollTop
        const leftBase = nodeRect.left - navInnerRect.left + navInnerEl.scrollLeft

        const navInnerWidth = navInnerEl.clientWidth

        if (variant === 'block' || variant === 'outline') {
          pointerEl.style.transform = `translate3d(${leftBase}px, ${topBase}px, 0)`
          pointerEl.style.width = `${nodeRect.width}px`
          pointerEl.style.height = `${nodeRect.height}px`
        }
        else if (variant === 'dot') {
          const top = topBase + nodeRect.height * 0.5 - 4
          const x = placement.value === 'right' ? (navInnerWidth - 8 - 8) : 8
          pointerEl.style.transform = `translate3d(${x}px, ${top}px, 0)`
          pointerEl.style.height = `8px`
          pointerEl.style.width = `8px`
        }
        else {
          const top = topBase + nodeRect.height * 0.2 + diff
          const thickness = variant === 'pill' ? 6 : 3
          const x = placement.value === 'right' ? (navInnerWidth - thickness) : 0
          pointerEl.style.transform = `translate3d(${x}px, ${top}px, 0)`
          pointerEl.style.width = `${thickness}px`
          pointerEl.style.height = `${nodeRect.height * 0.6}px`
        }
      }
      else {
        const topBase = nodeRect.top - navInnerRect.top + navInnerEl.scrollTop
        const leftBase = nodeRect.left - navInnerRect.left + navInnerEl.scrollLeft

        const navInnerHeight = navInnerEl.clientHeight

        if (variant === 'block' || variant === 'outline') {
          pointerEl.style.transform = `translate3d(${leftBase}px, ${topBase}px, 0)`
          pointerEl.style.width = `${nodeRect.width}px`
          pointerEl.style.height = `${nodeRect.height}px`
        }
        else if (variant === 'dot') {
          const left = leftBase + nodeRect.width * 0.5 - 4
          const y = placement.value === 'bottom' ? 8 : (navInnerHeight - 8 - 8)
          pointerEl.style.transform = `translate3d(${left}px, ${y}px, 0)`
          pointerEl.style.width = `8px`
          pointerEl.style.height = `8px`
        }
        else {
          const left = leftBase + nodeRect.width * 0.2 + diff
          const thickness = variant === 'pill' ? 6 : 3
          const y = placement.value === 'bottom' ? 0 : (navInnerHeight - thickness)
          pointerEl.style.transform = `translate3d(${left}px, ${y}px, 0)`
          pointerEl.style.width = `${nodeRect.width * 0.6}px`
          pointerEl.style.height = `${thickness}px`
        }
      }

      playPointerAnim()
    }

    function createTab(vnode: any): any {
      const tab = h(TxTabItem, {
        ...vnode.props,
        active: activeNode.value?.props?.name === vnode.props?.name,
        onClick: () => {
          if (vnode.props?.disabled)
            return
          const el = slotWrapper.value?.el as HTMLElement | undefined
          if (el) {
            if (animationContent.value.enabled)
              el.classList.remove('tx-tabs-zoom')
            void runAutoHeight(() => setActive(vnode)).then(() => {
              nextTick(() => {
                applyPointerFor(tab)
                if (animationContent.value.enabled)
                  el.classList.add('tx-tabs-zoom')
              })
            })
          }
        },
      })

      const isDefault = !!vnode.props?.activation
      if (!activeNode.value && isDefault) {
        setActive(vnode)
        nextTick(() => applyPointerFor(tab))
      }

      return tab
    }

    function renderTabs(): any[] {
      let tabHeader: any = null
      const nodes = slots.default?.() ?? []

      const filtered = nodes
        .filter((slot) => {
          const type = slot?.type
          return type && typeof type === 'object' && 'name' in type && type.name && qualifiedName.includes(type.name as string)
        })
        .map((child) => {
          const childName = (child?.type as any)?.name

          if (childName === 'TxTabHeader') {
            tabHeader = child
            return null
          }
          if (childName === 'TxTabItemGroup') {
            return h('div', { class: 'tx-tabs__group' }, [
              h('div', { class: 'tx-tabs__group-name' }, child.props?.name),
              child.children && typeof child.children === 'object' && 'default' in child.children && typeof child.children.default === 'function'
                ? child.children.default?.()?.map(createTab)
                : [],
            ])
          }
          return createTab(child)
        })
        .filter(Boolean)

      return [filtered, tabHeader]
    }

    function renderContent(tabHeader: any) {
      if (!activeNode.value) {
        return h('div', { class: 'tx-tabs__empty' }, 'No tab selected')
      }

      const contentWrapper = h('div', { class: 'tx-tabs__content-wrapper' }, activeNode.value.children?.default?.())
      const content = contentScrollable.value
        ? h('div', { class: 'tx-tabs__content-scroll' }, [contentWrapper])
        : contentWrapper

      if (tabHeader) {
        const headerVNode = h(
          TxTabHeader,
          { ...tabHeader.props, node: activeNode.value },
          tabHeader.children,
        )
        return [headerVNode, content]
      }

      return content
    }

    watch(
      () => props.modelValue,
      (val) => {
        if (!val)
          return
        const node = findByName(val)
        if (node) {
          void runAutoHeight(() => {
            activeNode.value = node
          }).then(() => {
            nextTick(() => {
              const el = navInnerElRef.value?.querySelector('.tx-tab-item.is-active')
              applyPointerFor(el)
            })
          })
        }
      },
      { immediate: true },
    )

    watch(
      () => props.defaultValue,
      (val) => {
        if (!val || props.modelValue)
          return
        const node = findByName(val)
        if (node) {
          void runAutoHeight(() => setActive(node)).then(() => {
            nextTick(() => {
              const el = navInnerElRef.value?.querySelector('.tx-tab-item.is-active')
              applyPointerFor(el)
            })
          })
        }
      },
      { immediate: true },
    )

    return () => {
      const [tabs, tabHeader] = renderTabs()

      const navRightSlot = slots['nav-right']?.()

      const pointer = h(
        'div',
        {
          ref: pointerElRef,
          class: 'tx-tabs__pointer',
        },
        [
          h('div', {
            ref: pointerInnerElRef,
            class: 'tx-tabs__pointer-inner',
          }),
        ],
      )

      const selectSlot = h(
        'div',
        {
          ref: (el: any) => (contentRootElRef.value = el),
          class: ['tx-tabs__select-slot', { 'tx-tabs-zoom': animationContent.value.enabled }],
        },
        renderContent(tabHeader),
      )
      slotWrapper.value = selectSlot

      const outerClass = contentScrollable.value
        ? 'tx-tabs__auto-sizer tx-tabs__auto-sizer--fill'
        : 'tx-tabs__auto-sizer overflow-hidden'

      const content = h(
        TxAutoSizer,
        {
          ref: (el: any) => (autoSizerRef.value = el),
          width: widthAnimEnabled.value,
          height: heightAnimEnabled.value,
          durationMs: animationSize.value.durationMs,
          easing: animationSize.value.easing,
          outerClass,
        },
        {
          default: () => selectSlot,
        },
      )

      const navStyle = isVertical.value
        ? {
            minWidth: `${props.navMinWidth}px`,
            maxWidth: `${props.navMaxWidth}px`,
          }
        : undefined

      const nav = h(
        'div',
        {
          ref: (el: any) => (navElRef.value = el),
          class: 'tx-tabs__nav',
          style: navStyle,
        },
        [
          h(
            'div',
            {
              class: 'tx-tabs__nav-bar',
            },
            [
              h(
                'div',
                {
                  ref: (el: any) => (navInnerElRef.value = el),
                  class: 'tx-tabs__nav-inner',
                },
                [...tabs, pointer],
              ),
              navRightSlot
                ? h('div', { class: 'tx-tabs__nav-extra' }, navRightSlot)
                : null,
            ],
          ),
        ],
      )

      const main = h(
        'div',
        {
          class: 'tx-tabs__main',
          style: { padding: `${props.contentPadding}px` },
        },
        [content],
      )

      const reverse = placement.value === 'right' || placement.value === 'bottom'
      const children = reverse ? [main, nav] : [nav, main]

      return h(
        'div',
        {
          class: [
            'tx-tabs',
            `tx-tabs--${placement.value}`,
            `tx-tabs--indicator-${indicatorVariant.value}`,
            `tx-tabs--motion-${indicatorMotion.value}`,
            {
              'tx-tabs--auto-height': heightAnimEnabled.value,
              'tx-tabs--auto-width': !!props.autoWidth,
              'tx-tabs--indicator-anim': animationIndicator.value.enabled,
              'tx-tabs--nav-anim': animationNav.value.enabled,
              'tx-tabs--content-anim': animationContent.value.enabled,
            },
          ],
          style: {
            '--tx-tabs-indicator-duration': `${animationIndicator.value.durationMs}ms`,
            '--tx-tabs-indicator-easing': animationIndicator.value.easing,
            '--tx-tabs-indicator-strength': `${indicatorMotionStrength.value}`,
            '--tx-tabs-nav-duration': `${animationNav.value.durationMs}ms`,
            '--tx-tabs-nav-easing': animationNav.value.easing,
          } as any,
        },
        children,
      )
    }
  },
})
</script>

<style lang="scss" scoped>
.tx-tabs {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
}

.tx-tabs--auto-width {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
}

.tx-tabs--auto-width .tx-tabs__main {
  flex: 0 1 auto;
}

.tx-tabs--auto-width .tx-tabs__auto-sizer,
.tx-tabs--auto-width .tx-tabs__select-slot,
.tx-tabs--auto-width .tx-tabs__content-scroll {
  width: auto;
  max-width: 100%;
}

.tx-tabs__nav {
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tx-border-color, #dcdfe6);
  box-sizing: border-box;
}

.tx-tabs__nav-bar {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.tx-tabs--top .tx-tabs__nav-bar,
.tx-tabs--bottom .tx-tabs__nav-bar {
  flex-direction: row;
  align-items: center;
}

.tx-tabs--left .tx-tabs__nav-bar,
.tx-tabs--right .tx-tabs__nav-bar {
  flex-direction: column;
}

.tx-tabs__nav-extra {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 8px;
}

.tx-tabs--nav-anim .tx-tabs__nav {
  transition:
    min-width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    max-width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    flex-basis var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease);
}

.tx-tabs__nav-inner {
  position: relative;
  padding: 8px 6px;
  flex: 1;
  min-height: 0;
}

.tx-tabs__group {
  margin-top: 6px;
}

.tx-tabs__group-name {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  opacity: 0.9;
}

.tx-tabs__pointer {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  border-radius: 50px;
  opacity: 0;
  transform: translate3d(0, 0, 0);
  transform-origin: center;
  will-change: top, left, right, bottom, width, height, opacity, transform;
  z-index: 0;
}

.tx-tabs__pointer-inner {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background-color: var(--tx-color-primary, #409eff);
  transform: scale(1);
  transform-origin: center;
  will-change: transform, opacity;
}

.tx-tabs__nav-inner :deep(.tx-tab-item) {
  position: relative;
  z-index: 1;
}

.tx-tabs--indicator-pill .tx-tabs__pointer {
  width: 6px;
  border-radius: 999px;
}

.tx-tabs--top.tx-tabs--indicator-pill .tx-tabs__pointer,
.tx-tabs--bottom.tx-tabs--indicator-pill .tx-tabs__pointer {
  height: 6px;
  width: auto;
}

.tx-tabs--indicator-dot .tx-tabs__pointer {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.tx-tabs--indicator-block .tx-tabs__pointer {
  border-radius: 12px;
}

.tx-tabs--indicator-block .tx-tabs__pointer-inner {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-tabs--indicator-outline .tx-tabs__pointer {
  border-radius: 12px;
}

.tx-tabs--indicator-outline .tx-tabs__pointer-inner {
  background: transparent;
  border: 1.5px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-stretch-x {
  animation: tx-tabs-pointer-stretch-x calc(var(--tx-tabs-indicator-duration, 180ms) + 160ms)
    cubic-bezier(0.34, 1.56, 0.64, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-stretch-y {
  animation: tx-tabs-pointer-stretch-y calc(var(--tx-tabs-indicator-duration, 180ms) + 160ms)
    cubic-bezier(0.34, 1.56, 0.64, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-warp-x {
  animation: tx-tabs-pointer-warp-x calc(var(--tx-tabs-indicator-duration, 180ms) + 170ms)
    cubic-bezier(0.2, 1.3, 0.2, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-warp-y {
  animation: tx-tabs-pointer-warp-y calc(var(--tx-tabs-indicator-duration, 180ms) + 170ms)
    cubic-bezier(0.2, 1.3, 0.2, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-glide-x {
  animation: tx-tabs-pointer-glide-x calc(var(--tx-tabs-indicator-duration, 180ms) + 120ms)
    cubic-bezier(0.22, 0.9, 0.2, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-glide-y {
  animation: tx-tabs-pointer-glide-y calc(var(--tx-tabs-indicator-duration, 180ms) + 120ms)
    cubic-bezier(0.22, 0.9, 0.2, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-snap-x {
  animation: tx-tabs-pointer-snap-x calc(var(--tx-tabs-indicator-duration, 180ms) + 90ms)
    cubic-bezier(0.3, 1.1, 0.3, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-snap-y {
  animation: tx-tabs-pointer-snap-y calc(var(--tx-tabs-indicator-duration, 180ms) + 90ms)
    cubic-bezier(0.3, 1.1, 0.3, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-spring-x {
  animation: tx-tabs-pointer-spring-x calc(var(--tx-tabs-indicator-duration, 180ms) + 220ms)
    cubic-bezier(0.34, 1.56, 0.64, 1)
    both;
}

.tx-tabs__pointer-inner.tx-tabs__pointer--motion-spring-y {
  animation: tx-tabs-pointer-spring-y calc(var(--tx-tabs-indicator-duration, 180ms) + 220ms)
    cubic-bezier(0.34, 1.56, 0.64, 1)
    both;
}

@keyframes tx-tabs-pointer-stretch-x {
  0% { transform: scaleX(calc(1 + ((0.96 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  42% { transform: scaleX(calc(1 + ((1.26 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  72% { transform: scaleX(calc(1 + ((0.99 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleX(1); }
}

@keyframes tx-tabs-pointer-stretch-y {
  0% { transform: scaleY(calc(1 + ((0.96 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  42% { transform: scaleY(calc(1 + ((1.26 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  72% { transform: scaleY(calc(1 + ((0.99 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleY(1); }
}

@keyframes tx-tabs-pointer-warp-x {
  0% { transform: scaleX(calc(1 + ((0.92 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  32% { transform: scaleX(calc(1 + ((1.34 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  62% { transform: scaleX(calc(1 + ((0.97 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleX(1); }
}

@keyframes tx-tabs-pointer-warp-y {
  0% { transform: scaleY(calc(1 + ((0.92 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  32% { transform: scaleY(calc(1 + ((1.34 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  62% { transform: scaleY(calc(1 + ((0.97 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleY(1); }
}

@keyframes tx-tabs-pointer-glide-x {
  0% { transform: scaleX(calc(1 + ((0.98 - 1) * var(--tx-tabs-indicator-strength, 1)))); opacity: 0.85; }
  55% { transform: scaleX(calc(1 + ((1.14 - 1) * var(--tx-tabs-indicator-strength, 1)))); opacity: 1; }
  100% { transform: scaleX(1); opacity: 1; }
}

@keyframes tx-tabs-pointer-glide-y {
  0% { transform: scaleY(calc(1 + ((0.98 - 1) * var(--tx-tabs-indicator-strength, 1)))); opacity: 0.85; }
  55% { transform: scaleY(calc(1 + ((1.14 - 1) * var(--tx-tabs-indicator-strength, 1)))); opacity: 1; }
  100% { transform: scaleY(1); opacity: 1; }
}

@keyframes tx-tabs-pointer-snap-x {
  0% { transform: scaleX(calc(1 + ((0.94 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  70% { transform: scaleX(calc(1 + ((1.22 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleX(1); }
}

@keyframes tx-tabs-pointer-snap-y {
  0% { transform: scaleY(calc(1 + ((0.94 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  70% { transform: scaleY(calc(1 + ((1.22 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleY(1); }
}

@keyframes tx-tabs-pointer-spring-x {
  0% { transform: scaleX(calc(1 + ((0.92 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  40% { transform: scaleX(calc(1 + ((1.32 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  66% { transform: scaleX(calc(1 + ((0.96 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  82% { transform: scaleX(calc(1 + ((1.06 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleX(1); }
}

@keyframes tx-tabs-pointer-spring-y {
  0% { transform: scaleY(calc(1 + ((0.92 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  40% { transform: scaleY(calc(1 + ((1.32 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  66% { transform: scaleY(calc(1 + ((0.96 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  82% { transform: scaleY(calc(1 + ((1.06 - 1) * var(--tx-tabs-indicator-strength, 1)))); }
  100% { transform: scaleY(1); }
}

.tx-tabs--indicator-anim .tx-tabs__pointer {
  transition: opacity var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease),
    transform var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease),
    width var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease),
    height var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease);
}

.tx-tabs--right {
  flex-direction: row-reverse;
}

.tx-tabs--top {
  flex-direction: column;
}

.tx-tabs--bottom {
  flex-direction: column-reverse;
}

.tx-tabs--top .tx-tabs__nav,
.tx-tabs--bottom .tx-tabs__nav {
  flex-direction: row;
  border-right: none;
}

.tx-tabs--top .tx-tabs__nav {
  border-bottom: 1px solid var(--tx-border-color, #dcdfe6);
}

.tx-tabs--bottom .tx-tabs__nav {
  border-top: 1px solid var(--tx-border-color, #dcdfe6);
}

.tx-tabs--top .tx-tabs__nav-inner,
.tx-tabs--bottom .tx-tabs__nav-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 6px 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tx-tabs--top .tx-tabs__nav-inner::-webkit-scrollbar,
.tx-tabs--bottom .tx-tabs__nav-inner::-webkit-scrollbar {
  display: none;
}

.tx-tabs--top .tx-tabs__pointer,
.tx-tabs--bottom .tx-tabs__pointer {
  width: auto;
  height: 3px;
}

.tx-tabs__main {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
}

.tx-tabs--auto-height {
  height: auto;
}

.tx-tabs--auto-height .tx-tabs__main {
  height: auto;
}

.tx-tabs__select-slot {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tx-tabs:not(.tx-tabs--auto-width) .tx-tabs__select-slot {
  width: 100%;
}

.tx-tabs--auto-width .tx-tabs__select-slot {
  width: fit-content;
  max-width: 100%;
}

.tx-tabs--auto-height .tx-tabs__select-slot {
  height: auto;
}

.tx-tabs__auto-sizer {
  width: 100%;
}

.tx-tabs--auto-width .tx-tabs__auto-sizer,
.tx-tabs--auto-width .tx-tabs__select-slot,
.tx-tabs--auto-width .tx-tabs__content-scroll {
  width: auto;
  max-width: 100%;
}

.tx-tabs__auto-sizer--fill {
  height: 100%;
}

.tx-tabs__content-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.tx-tabs--auto-height .tx-tabs__content-scroll {
  height: auto;
  flex: 0 0 auto;
}

.tx-tabs__content-wrapper {
  box-sizing: border-box;
  padding: 6px 2px;
  flex: 1;
  min-height: 0;
}

.tx-tabs--auto-height .tx-tabs__content-wrapper {
  flex: 0 0 auto;
}

.tx-tabs__empty {
  padding: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-tabs-zoom {
  animation: tx-tabs-zoom-in 0.18s ease;
}

@keyframes tx-tabs-zoom-in {
  from {
    opacity: 0.7;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
