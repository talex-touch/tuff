<script lang="ts">
import { h, nextTick, ref, defineComponent } from 'vue'
import TTabItem from '@comp/tabs/TTabItem.vue'
import { sleep } from '@talex-touch/utils/common/utils'
import TTabHeader from '@comp/tabs/TTabHeader.vue'
import { ElScrollbar } from 'element-plus'

const qualifiedName = ['TTabItem', 'TTabItemGroup', 'TTabHeader']
const activeNode = ref()
const slotWrapper = ref()

export default defineComponent({
  name: 'TTabs',
  props: {
    default: String,
    offset: [String, Number]
  },

  render() {
    let tabHeader: any = null
    const pointer = h('div', { class: 'TTabs-Pointer' })

    const fixPointer = async (vnode: any): Promise<void> => {
      const pointerEl = pointer.el
      const nodeEl = vnode.el
      if (!pointerEl || !nodeEl) return

      const pointerStyle = pointerEl.style
      const pointerRect = pointerEl.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()

      const diffTop = this.$props?.offset ? +this.$props.offset || 0 : 0

      if (nodeRect.top > pointerRect.top) {
        pointerStyle.height = nodeRect.height * 0.8 + 'px'
        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)
        pointerStyle.top = nodeRect.top + diffTop + 'px'

        await sleep(100)
        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)
        pointerStyle.top = nodeRect.top + nodeRect.height * 0.2 + diffTop + 'px'
        pointerStyle.height = nodeRect.height * 0.6 + 'px'
      } else {
        pointerStyle.transform = `translate(0, -${nodeRect.height * 0.2}px)`
        pointerStyle.height = nodeRect.height * 0.8 + 'px'

        await sleep(100)
        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)
        pointerStyle.transform = ''
        pointerStyle.top = nodeRect.top + nodeRect.height * 0.2 + diffTop + 'px'

        await sleep(100)
        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)
        pointerStyle.height = nodeRect.height * 0.6 + 'px'
      }
    }

    const createTab = (vnode: any): any => {
      const tab = h(TTabItem, {
        active: () => activeNode.value?.props.name === vnode.props.name,
        ...vnode.props,
        onClick: () => {
          if ('disabled' in vnode.props) return

          const el = slotWrapper.value?.el
          if (el) {
            const classList = el.classList
            classList.remove('zoomInUp')

            activeNode.value = vnode
            fixPointer(tab)

            classList.add('zoomInUp')
          }
        }
      })

      if (!activeNode.value && tab.props && 'activation' in tab.props) {
        activeNode.value = vnode
        nextTick(() => fixPointer(tab))
      }

      return tab
    }

    const renderTabs = (): any[] => {
      return (
        this.$slots
          .default?.()
          ?.filter(
            (slot) =>
              slot.type &&
              typeof slot.type === 'object' &&
              'name' in slot.type &&
              slot.type.name &&
              qualifiedName.includes(slot.type.name as string)
          )
          ?.map((child) => {
            if (
              child.type &&
              typeof child.type === 'object' &&
              'name' in child.type &&
              child.type.name === 'TTabHeader'
            ) {
              tabHeader = child
              return null
            } else if (
              child.type &&
              typeof child.type === 'object' &&
              'name' in child.type &&
              child.type.name === 'TTabItemGroup'
            ) {
              return h('div', { class: 'TTabs-TabGroup' }, [
                h('div', { class: 'TTabs-TabGroup-Name' }, child.props?.name),
                child.children &&
                typeof child.children === 'object' &&
                'default' in child.children &&
                typeof child.children.default === 'function'
                  ? child.children.default?.()?.map(createTab)
                  : []
              ])
            } else {
              return createTab(child)
            }
          })
          ?.filter(Boolean) || []
      )
    }

    const renderContent = (): any => {
      if (!activeNode.value) {
        return h('div', { class: 'TTabs-SelectSlot-Empty' }, 'No tab selected')
      }

      const contentWrapper = h(
        'div',
        { class: 'TTabs-ContentWrapper' },
        activeNode.value.children?.default?.()
      )

      const scrollableContent = h(ElScrollbar, {}, () => contentWrapper)

      if (tabHeader) {
        return [
          h(
            TTabHeader,
            tabHeader.children &&
              typeof tabHeader.children === 'object' &&
              'default' in tabHeader.children &&
              typeof tabHeader.children.default === 'function'
              ? tabHeader.children.default?.({
                  ...tabHeader.props,
                  node: activeNode.value
                })
              : {}
          ),
          scrollableContent
        ]
      }

      return scrollableContent
    }

    const selectSlot = h('div', { class: 'TTabs-SelectSlot animated' }, renderContent())
    slotWrapper.value = selectSlot

    return h('div', { class: 'TTabs-Container' }, [
      h('div', { class: 'TTabs-Header' }, [this.$slots?.tabHeader?.(), ...renderTabs()]),
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
.el-scrollbar {
  :deep(.el-scrollbar__view) {
    min-height: 100%;
  }

  //padding: 0 10px;

  width: 100%;
  height: 100%;

  //box-sizing: border-box;
}

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
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;
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
  transition: all 0.25s;
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

    flex: 1;

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
