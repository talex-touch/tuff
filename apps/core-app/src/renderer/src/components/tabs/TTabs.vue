<script lang="ts">
import type { Component, VNode, VNodeChild } from 'vue'
import { defineComponent, h, nextTick, ref } from 'vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TTabHeader from '~/components/tabs/TTabHeader.vue'
import TTabItem from '~/components/tabs/TTabItem.vue'

const qualifiedName = ['TTabItem', 'TTabItemGroup', 'TTabHeader']
const activeNode = ref<VNode | null>(null)
const slotWrapper = ref<VNode | null>(null)

const headerWrapper = ref<HTMLElement | null>(null)
type NamedProps = { name?: string; disabled?: boolean }

const getVNodeName = (node: VNode | null | undefined): string | undefined => {
  const props = node?.props as NamedProps | null | undefined
  return props?.name
}

const getVNodeTypeName = (node: VNode | null | undefined): string | undefined => {
  const type = node?.type
  if (typeof type === 'function') {
    return type.name
  }
  if (type && typeof type === 'object' && 'name' in type) {
    return (type as { name?: string }).name
  }
  return undefined
}

export default defineComponent({
  name: 'TTabs',
  props: {
    default: String,
    offset: [String, Number]
  },

  render() {
    type PointerTarget = { el?: unknown } | null

    let tabHeader: VNode | null = null
    const pointer = h('div', { class: 'TTabs-Pointer' })
    let activeTabVNode: VNode | null = null

    const fixPointer = async (vnode: PointerTarget): Promise<void> => {
      const pointerEl = pointer.el
      const nodeEl = vnode?.el
      if (!(pointerEl instanceof HTMLElement) || !(nodeEl instanceof HTMLElement)) return

      const pointerElement = pointerEl as HTMLElement
      const nodeElement = nodeEl as HTMLElement

      const parentEl = pointerElement.offsetParent as HTMLElement | null
      if (!parentEl) return

      const parentRect = parentEl.getBoundingClientRect()
      const nodeRect = nodeElement.getBoundingClientRect()

      const pointerStyle = pointerElement.style
      const diffTop = +(this.$props?.offset ?? 0)

      const top = nodeRect.top - parentRect.top + nodeRect.height * 0.2 + diffTop
      const height = nodeRect.height * 0.6

      pointerStyle.opacity = '1'
      pointerStyle.height = `${height}px`

      requestAnimationFrame(() => {
        pointerStyle.top = `${top}px`
      })
    }

    const createTab = (vnode: VNode): VNode => {
      const vnodeProps = (vnode.props ?? {}) as Record<string, unknown>
      const tabProps = {
        ...vnodeProps,
        active: () => getVNodeName(activeNode.value) === getVNodeName(vnode),
        onClick: () => {
          const nodeProps = vnode.props as NamedProps | null | undefined
          if (nodeProps?.disabled) return

          const el = slotWrapper.value?.el
          if (el instanceof Element) {
            const classList = el.classList
            classList.remove('zoomInUp')

            activeNode.value = vnode
            fixPointer(tab)

            classList.add('zoomInUp')
          }
        }
      }
      const tab = h(TTabItem as Component, tabProps as Record<string, unknown>)

      const activationProps = vnode.props as { activation?: boolean } | null | undefined
      const isActivation = Boolean(activationProps?.activation)
      const isDefault = Boolean(this.$props?.default) && getVNodeName(vnode) === this.$props.default

      if (!activeNode.value && (isDefault || isActivation)) {
        activeNode.value = vnode
        nextTick(() => fixPointer(tab))
      }

      if (
        getVNodeName(activeNode.value) &&
        getVNodeName(activeNode.value) === getVNodeName(vnode)
      ) {
        activeTabVNode = tab
      }

      return tab
    }

    const renderTabs = (): VNode[] => {
      const nodes = this.$slots.default?.() ?? []
      const tabs = nodes
        .filter((slot) => {
          const typeName = getVNodeTypeName(slot)
          return Boolean(typeName && qualifiedName.includes(typeName))
        })
        .map((child) => {
          const typeName = getVNodeTypeName(child)
          if (typeName === 'TTabHeader') {
            tabHeader = child
            return null
          }
          if (typeName === 'TTabItemGroup') {
            const groupChildren = child.children
            const groupTabs =
              groupChildren &&
              typeof groupChildren === 'object' &&
              'default' in groupChildren &&
              typeof groupChildren.default === 'function'
                ? groupChildren.default().map(createTab)
                : []
            return h('div', { class: 'TTabs-TabGroup' }, [
              h('div', { class: 'TTabs-TabGroup-Name' }, child.props?.name),
              groupTabs
            ])
          }
          return createTab(child)
        })
        .filter((item): item is VNode => Boolean(item))
      return tabs
    }

    const ensureDefault = async () => {
      await nextTick()
      if (!activeNode.value) {
        const nodes = this.$slots.default?.() ?? []
        const first = nodes.find((n: VNode) => {
          const typeName = getVNodeTypeName(n)
          return Boolean(getVNodeName(n) && typeName && qualifiedName.includes(typeName))
        })
        if (first) activeNode.value = first
      }

      if (activeTabVNode) {
        await fixPointer(activeTabVNode)
        return
      }

      const pointerEl = pointer.el as HTMLElement | undefined
      const parentEl = pointerEl?.offsetParent as HTMLElement | null | undefined
      if (!pointerEl || !parentEl) return

      const activeEl =
        parentEl.querySelector<HTMLElement>('.TTabItem-Container.active') ??
        parentEl.querySelector<HTMLElement>('.TTabItem-Container')
      if (!activeEl) return

      await fixPointer({ el: activeEl })
    }

    const renderContent = (): VNodeChild => {
      if (!activeNode.value) {
        return h('div', { class: 'TTabs-SelectSlot-Empty' }, 'No tab selected')
      }

      const contentChildren = activeNode.value.children
      const defaultSlot =
        contentChildren &&
        typeof contentChildren === 'object' &&
        'default' in contentChildren &&
        typeof contentChildren.default === 'function'
          ? contentChildren.default()
          : []
      const contentWrapper = h('div', { class: 'TTabs-ContentWrapper' }, defaultSlot)

      const scrollableContent = h(
        TouchScroll,
        {
          noPadding: true
        },
        {
          default: () => contentWrapper
        }
      )

      if (tabHeader) {
        let headerNodes: VNodeChild | VNodeChild[] = []
        const headerChildren = tabHeader.children
        if (
          headerChildren &&
          typeof headerChildren === 'object' &&
          'default' in headerChildren &&
          typeof headerChildren.default === 'function'
        ) {
          headerNodes = headerChildren.default({
            ...tabHeader.props,
            node: activeNode.value
          })
        }
        return [
          h(TTabHeader as Component, {}, { default: () => headerNodes ?? [] }),
          scrollableContent
        ]
      }

      return scrollableContent
    }

    const content = renderContent()
    const selectSlot = h('div', { class: 'TTabs-SelectSlot animated' }, content ?? '')
    slotWrapper.value = selectSlot

    const header = h(
      'div',
      {
        ref: (el) => {
          headerWrapper.value = el as HTMLElement | null
        },
        class: 'TTabs-Header'
      },
      [this.$slots?.tabHeader?.(), ...renderTabs()]
    )

    ensureDefault()

    return h('div', { class: 'TTabs-Container' }, [
      header,
      h(
        'div',
        {
          class: `TTabs-Main${tabHeader ? ' header-mode' : ''}`
        },
        selectSlot
      ),
      pointer
    ])
  }
})
</script>

<style lang="scss" scoped>
.TTabs-ContentWrapper {
  margin-bottom: 15px;
  padding: 15px 10px 0 10px;
  //position: relative;

  //height: 100%;
  //width: 100%;

  box-sizing: border-box;
}

.TTabs-SelectSlot {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;

  width: 100%;
  height: 100%;
  min-height: 0;
}

.TTabs-Header {
  position: relative;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;

  //min-height: 80vh;

  width: 35%;
  min-width: 220px;
  max-width: 300px;

  border-right: 1px solid var(--el-border-color);
  box-sizing: border-box;
}

.TTabs-Pointer {
  position: absolute;

  left: 12px;
  //top: 42px;

  //height: 3.5%;
  width: 3px;

  opacity: 0;
  transition:
    top 0.22s cubic-bezier(0.2, 0.9, 0.2, 1),
    height 0.22s cubic-bezier(0.2, 0.9, 0.2, 1),
    opacity 0.18s ease;
  border-radius: 50px;
  background-color: var(--el-color-primary);
}

.TTabs-SelectSlot-Empty {
  display: flex;
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;

  font-size: 18px;
}

.touch-blur .TTabs-TabGroup {
  .TTabs-TabGroup-Name {
    &:before {
      opacity: 0.4;
    }

    //backdrop-filter: saturate(180%) blur(10px) brightness(95%);
  }

  &:before {
    opacity: 0.4;
  }
}

.TTabs-TabGroup {
  .TTabs-TabGroup-Name {
    &:before {
      z-index: -1;
      content: '';
      position: absolute;

      left: 0;
      top: 0;

      width: 100%;
      height: 100%;

      border-radius: 4px 4px 0 0;
      background-color: var(--el-fill-color-dark);
    }

    z-index: 0;
    position: absolute;
    padding: 4px 12px;

    left: 0;
    top: -30px;

    width: calc(100% - 24px);
    height: 25px;
    line-height: 24px;

    font-weight: 600;
    border-radius: 8px 8px 0 0;
  }

  &:before {
    content: '';
    position: absolute;

    width: 100%;
    height: 100%;

    left: 0;
    top: 0;

    border-radius: 0 0 4px 4px;
    background-color: var(--el-fill-color);
  }

  position: relative;
  padding-top: 10px;
  margin-top: 30px;
  margin-bottom: 10px;

  //border: 2px solid var(--el-border-color);
}

.touch-blur .TTabs-Container {
  &:before {
    opacity: 0;
  }
}

.TTabs-Container {
  .TTabs-Main {
    &.header-mode .TTabs-SelectSlot {
      flex-direction: column;
      justify-content: unset;
    }

    position: relative;
    padding: 10px 8px;

    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;

    box-sizing: border-box;
  }

  &:before {
    content: '';
    position: absolute;

    width: 100%;
    height: 100%;

    top: 0;
    left: 0;

    // background-color: var(--el-fill-color);
  }

  position: relative;
  display: flex;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>
