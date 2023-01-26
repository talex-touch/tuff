<script>
import { h, reactive, ref } from 'vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import { ElScrollbar } from 'element-plus'

const qualifiedName = ['TvTabItem', 'TvTabItemGroup']
const activeNodes = reactive({})
const lastActive = ref()

const slotWrapper = ref()

export default {
  name: "TvTabs",
  props: ['modelValue'],
  render() {
    const that = this

    Object.assign(activeNodes, that.modelValue)

    const slots = this.$slots.default()

    const children = slots.filter((slot) => {
      return slot.type.name && qualifiedName.includes(slot.type.name)
    })

    function getTabs() {

      function getTab(vnode, ind) {
        const index = (ind + 1) || 0
        const active = () => activeNodes[index] === vnode.props.name
        return h( TvTabItem, {
          active,
          ...vnode.props,
          onClick: () => {
            if ( vnode.props.hasOwnProperty( 'disabled' ) ) return

            /*if ( active() )     {

              return lastActive.value /!*= activeNodes[index]*!/ = null

            }*/

            const el = slotWrapper.value.el
            const clsL = el.classList

            clsL.remove( 'zoomInUp' )

            lastActive.value = vnode
            activeNodes[index] = vnode.props.name

            that.$emit('update:modelValue', activeNodes)

            clsL.add( 'zoomInUp' )
          }
        } )
      }

      return children.map((child, index) => {
        return child.type.name === "TvTabItemGroup" ?
            h('div', {
              class: 'TvTabs-TabGroup'
            }, [
              h('div', {
                class: 'TvTabs-TabGroup-Name'
              }, child.props.name),
              child.children.default()?.map(c => getTab(c, index))
            ])
            : getTab(child)
      })

    }

    function getSelectSlotContent() {

      return slotWrapper.value = h('div', { class: 'TTabs-SelectSlot animated' },
          lastActive.value ? lastActive.value.children.default()
              : h('div', {
            class: 'TTabs-SelectSlot-Empty'
          }, '请选择一个选项!')
      )

    }

    return h('div', {
      class: 'TvTabs-Container'
    }, [
      h('div', {
        class: 'TvTabs-Header'
      }, h(ElScrollbar, {}, h('div', { class: 'TvTabs-HeaderWrapper' }, getTabs()))),
      h('div', {
        class: 'TvTabs-Main'
      }, getSelectSlotContent() )
    ])

  }
}
</script>

<style lang="scss" scoped>
.TvTabs-TabGroup {
  .TvTabs-TabGroup-Name {
    z-index: 1;
    position: absolute;
    padding: 2px 6px;

    top: -18px;
    left: 10px;

    border-radius: 4px;
    background-color: var(--el-fill-color-lighter);
  }
  & :last-child {
    margin-right: 0;
  }
  position: relative;
  display: flex;

  flex-shrink: 0;

  padding: 10px 6px 4px 6px;
  margin-right: 5px;

  height: 100%;

  border-radius: 8px;
  border: 2px solid var(--el-border-color);
  box-sizing: border-box;

}

.TTabs-SelectSlot {
  display: flex;
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;
}

.TvTabs-Header {
  .TvTabs-HeaderWrapper {
    position: relative;
    display: flex;

    height: 100%;

    //overflow-y: hidden;
  }
  :deep(.el-scrollbar) {
    .el-scrollbar__wrap {
      border-radius: 16px;
    }
    .el-scrollbar__view {
      position: relative;
      padding: 10px;

      height: 100%;
      width: 100%;

      box-sizing: border-box;
    }
    position: relative;
    height: 100%;
    width: 100%;

    //white-space:nowrap;
  }
  position: relative;
  padding: 10px;
  display: flex;

  height: 30%;
  min-height: 140px;
  max-height: 220px;

  width: 100%;

  //border-bottom: 1px solid var(--el-border-color);
  box-sizing: border-box;
}

.TTabs-SelectSlot-Empty {
  display: flex;
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;

  font-size: 18px;
}

.TvTabs-Container {
  .TvTabs-Main {
    &.header-mode .TTabs-SelectSlot {
      flex-direction: column;
      justify-content: unset;
    }
    flex: 1;

    padding: 10px;

    box-sizing: border-box;
  }
  position: relative;
  display: flex;

  flex-direction: column;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  //background-color: var(--el-fill-color-lighter);
}
</style>