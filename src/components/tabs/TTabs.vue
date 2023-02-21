<script>
import { h, nextTick, ref } from 'vue'
import TTabItem from '@comp/tabs/TTabItem.vue'
import { sleep } from '@modules/utils'
import TTabHeader from '@comp/tabs/TTabHeader.vue'
import { ElScrollbar } from 'element-plus'
import { $t } from '@modules/lang'

const qualifiedName = ['TTabItem', 'TTabItemGroup', 'TTabHeader']
const activeNode = ref()

const slotWrapper = ref()
// const nodeHistory = reactive([])

export default {
  name: "TTabs",
  props: ['modelValue'],
  render() {
    const that = this
    let tabHeader = null
    const pointer = h('div', { class: 'TTabs-Pointer' })

    async function fixPointer(vnode) {
      const pointerEl = pointer.el
      const nodeEl = vnode.el
      if( !pointerEl || !nodeEl ) return

      const pointerStyle = pointerEl.style

      const pointerRect = pointerEl.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()

      if( nodeRect.top > pointerRect.top ) {

        pointerStyle.height = (nodeRect.height * 0.8) + 'px'
        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)

        pointerStyle.top = nodeRect.top + 'px'

        await sleep(100)

        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)

        pointerStyle.top = (nodeRect.top + (nodeRect.height * 0.2)) + 'px'
        pointerStyle.height = (nodeRect.height * 0.6) + 'px'

      } else {

        pointerStyle.transform = `translate(0, -${nodeRect.height * 0.2}px)`
        pointerStyle.height = (nodeRect.height * 0.8) + 'px'

        await sleep(100)

        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)
        pointerStyle.transform = ''
        pointerStyle.top = (nodeRect.top + (nodeRect.height * 0.2)) + 'px'

        await sleep(100)

        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)

        pointerStyle.height = (nodeRect.height * 0.6) + 'px'

      }

    }

    function getTabs() {

      function getTab(vnode) {

        // console.log( vnode )

        const tab = h(TTabItem, {
          active: () => activeNode.value?.props.name === vnode.props.name, ...vnode.props,
          onClick: () => {
            if( vnode.props.hasOwnProperty('disabled') ) return

            const el = slotWrapper.value.el
            const clsL = el.classList

            clsL.remove('zoomInUp')

            activeNode.value = vnode

            that.$emit('update:modelValue', vnode.props.name)

            fixPointer(tab)

            clsL.add('zoomInUp')
          }
        })

        if( that.modelValue === vnode.props.name ) {

          activeNode.value = vnode

          nextTick(() => {
            fixPointer(tab)
          })

        }

        return tab
      }

      return that.$slots.default().filter(slot => slot.type.name && qualifiedName.includes(slot.type.name))
          .map(child => child.type.name === "TTabHeader" ? (() => {
            tabHeader = child
            return null
          })() : (child.type.name === "TTabItemGroup" ?
              h('div', { class: 'TTabs-TabGroup' },
                  [ h('div', { class: 'TTabs-TabGroup-Name' }, child.props.name), child.children.default()?.map(getTab) ])
              : getTab(child)))

    }

    function getSelectSlotContent() {
      // console.log( tabHeader )

      function getSlotContent(vnode) {
        const def = h('div', { class: 'TTabs-ContentWrapper' }, activeNode.value.children.default())
        const content = h(ElScrollbar, {}, def)
        //
        return (tabHeader ? [ h(TTabHeader, tabHeader.children.default({ ...tabHeader.props, node: activeNode.value })), content ]
            : content)

        // const content = (tabHeader ? [ h(TTabHeader, tabHeader.children.default({ ...tabHeader.props, node: activeNode.value })), def ]
        //     : def)
        //
        // return h(ElScrollbar, {}, content)
      }

      return slotWrapper.value = h('div', { class: 'TTabs-SelectSlot animated' },
          activeNode.value ? getSlotContent(activeNode.value) : h('div', {
            class: 'TTabs-SelectSlot-Empty'
          }, $t('base.empty-select'))
      )

    }

    return h('div', { class: 'TTabs-Container' }, [ h('div', { class: 'TTabs-Header' }, getTabs()),
      h('div', { class: 'TTabs-Main' + (tabHeader ? ' header-mode' : '') }, getSelectSlotContent() ),
      pointer
    ])

  }
}
</script>

<style lang="scss" scoped>
.el-scrollbar {
  :deep(.el-scrollbar__view) {
    height: 100%;
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

  height: 100%;
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

  height: 100%;

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
  transition: all .25s;
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

.blur .TTabs-TabGroup {
  .TTabs-TabGroup-Name {
    &:before {
      opacity: .4;
    }
    //backdrop-filter: saturate(180%) blur(10px) brightness(95%);
  }
  &:before {
    opacity: .4;
  }
}

.TTabs-TabGroup {
  .TTabs-TabGroup-Name {
    &:before {
      z-index: -1;
      content: "";
      position: absolute;

      left: 0;
      top: 0;

      width: 100%;
      height: 100%;

      border-radius: 8px 8px 0 0;
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
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    left: 0;
    top: 0;

    border-radius: 0 0 8px 8px;
    background-color: var(--el-fill-color);
  }
  position: relative;
  padding-top: 10px;
  margin-top: 30px;
  margin-bottom: 10px;

  //border: 2px solid var(--el-border-color);
}

.blur .TTabs-Container {
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
    flex: 1;

    //padding: 2px;

    box-sizing: border-box;
  }
  &:before {
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    top: 0;
    left: 0;

    background-color: var(--el-fill-color-light);
  }
  position: relative;
  display: flex;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>