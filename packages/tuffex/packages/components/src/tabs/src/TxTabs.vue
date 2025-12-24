<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue'
import TxTabHeader from './TxTabHeader.vue'
import TxTabItem from './TxTabItem.vue'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'

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
    autoHeightDurationMs: { type: Number, default: 250 },
    autoHeightEasing: { type: String, default: 'ease' },
    animation: { type: Object as PropType<any>, default: undefined },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { slots, emit }) {
    const activeNode = ref<any>()
    const slotWrapper = ref<any>()
    const autoSizerRef = ref<any>()

    const placement = computed(() => {
      const v = props.placement
      return (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') ? v : 'left'
    })

    const isVertical = computed(() => placement.value === 'left' || placement.value === 'right')

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
          easing: 'ease',
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 180,
          easing: typeof raw.easing === 'string' ? raw.easing : 'ease',
        }
      }
      return {
        enabled: true,
        durationMs: 180,
        easing: 'ease',
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
      return animationSize.value.enabled && !!props.autoHeight && !props.contentScrollable
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

    function findByName(name: string): any {
      const nodes = slots.default?.() ?? []
      return nodes.find(n => n?.props?.name === name)
    }

    const pointerElRef = ref<HTMLElement | null>(null)
    const navElRef = ref<HTMLElement | null>(null)
    const navInnerElRef = ref<HTMLElement | null>(null)

    function applyPointerFor(vnode: any) {
      const pointerEl = pointerElRef.value
      const nodeEl = vnode?.el as HTMLElement | undefined
      const navInnerEl = navInnerElRef.value
      if (!pointerEl || !nodeEl || !navInnerEl) return

      const nodeRect = nodeEl.getBoundingClientRect()
      const navInnerRect = navInnerEl.getBoundingClientRect()
      const diff = props.offset || 0

      pointerEl.style.opacity = '1'

      pointerEl.style.top = ''
      pointerEl.style.right = ''
      pointerEl.style.bottom = ''
      pointerEl.style.left = ''
      pointerEl.style.width = ''
      pointerEl.style.height = ''

      if (isVertical.value) {
        const top = nodeRect.top - navInnerRect.top + navInnerEl.scrollTop + nodeRect.height * 0.2 + diff

        pointerEl.style.top = `${top}px`
        pointerEl.style.height = `${nodeRect.height * 0.6}px`

        if (placement.value === 'right')
          pointerEl.style.right = '0px'
        else
          pointerEl.style.left = '0px'
      }
      else {
        const left = nodeRect.left - navInnerRect.left + navInnerEl.scrollLeft + nodeRect.width * 0.2 + diff

        pointerEl.style.left = `${left}px`
        pointerEl.style.width = `${nodeRect.width * 0.6}px`

        if (placement.value === 'bottom')
          pointerEl.style.top = '0px'
        else
          pointerEl.style.bottom = '0px'

        try {
          nodeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
        }
        catch {
          nodeEl.scrollIntoView()
        }
      }
    }

    function createTab(vnode: any): any {
      const tab = h(TxTabItem, {
        ...vnode.props,
        active: activeNode.value?.props?.name === vnode.props?.name,
        onClick: () => {
          if (vnode.props && 'disabled' in vnode.props) return
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

      const isDefault = !!(vnode.props && 'activation' in vnode.props)
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
          if (child?.type?.name === 'TxTabHeader') {
            tabHeader = child
            return null
          }
          if (child?.type?.name === 'TxTabItemGroup') {
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
      const content = props.contentScrollable
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
        if (!val) return
        const node = findByName(val)
        if (node) {
          activeNode.value = node
          void runAutoHeight(() => {}).then(() => {
            nextTick(() => {
              applyPointerFor(node)
            })
          })
        }
      },
      { immediate: true },
    )

    watch(
      () => props.defaultValue,
      (val) => {
        if (!val || props.modelValue) return
        const node = findByName(val)
        if (node) {
          void runAutoHeight(() => setActive(node)).then(() => {
            nextTick(() => {
              applyPointerFor(node)
            })
          })
        }
      },
      { immediate: true },
    )

    return () => {
      const [tabs, tabHeader] = renderTabs()

      const navRightSlot = slots['nav-right']?.()

      const pointer = h('div', {
        ref: pointerElRef,
        class: 'tx-tabs__pointer',
      })

      const selectSlot = h(
        'div',
        { class: ['tx-tabs__select-slot', { 'tx-tabs-zoom': animationContent.value.enabled }] },
        renderContent(tabHeader),
      )
      slotWrapper.value = selectSlot

      const content = sizeAnimEnabled.value
        ? h(
          TxAutoSizer,
          {
            ref: (el: any) => (autoSizerRef.value = el),
            width: widthAnimEnabled.value,
            height: heightAnimEnabled.value,
            durationMs: animationSize.value.durationMs,
            easing: animationSize.value.easing,
            outerClass: 'tx-tabs__auto-sizer overflow-hidden',
          },
          {
            default: () => selectSlot,
          },
        )
        : selectSlot

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
  width: 3px;
  border-radius: 50px;
  background-color: var(--tx-color-primary, #409eff);
  opacity: 0;
}

.tx-tabs--indicator-anim .tx-tabs__pointer {
  transition: opacity var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), top var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), left var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), right var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), bottom var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), width var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease), height var(--tx-tabs-indicator-duration, 180ms) var(--tx-tabs-indicator-easing, ease);
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
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tx-tabs--auto-height .tx-tabs__select-slot {
  height: auto;
}

.tx-tabs__auto-sizer {
  width: 100%;
}

.tx-tabs__content-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.tx-tabs__content-wrapper {
  box-sizing: border-box;
  padding: 6px 2px;
  flex: 1;
  min-height: 0;
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
