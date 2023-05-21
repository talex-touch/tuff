<script>
import { defineComponent, h, nextTick, ref } from 'vue'
import TMenuItem from '@comp/tabs/TMenuItem.vue'
import { sleep } from 'utils/common'
import router from '~/base/router'

const qualifiedName = ['TMenuItem']
const activeNode = ref()

export default defineComponent({
  name: "TMenuTabs",
  props: ['default'],
  render() {
    const that = this
    const pointer = h('div', { class: 'TTabs-Pointer' })

    async function fixPointer(vnode) {
      const pointerEl = pointer.el
      const nodeEl = vnode.el
      if (!pointerEl || !nodeEl) return

      const pointerStyle = pointerEl.style

      const pointerRect = pointerEl.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()

      const diffTop = -105

      if (nodeRect.top > pointerRect.top) {

        pointerStyle.height = (nodeRect.height * 0.8) + 'px'
        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)

        pointerStyle.top = (nodeRect.top + diffTop) + 'px'

        await sleep(100)

        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)

        pointerStyle.top = (nodeRect.top + (nodeRect.height * 0.2) + diffTop) + 'px'
        pointerStyle.height = (nodeRect.height * 0.6) + 'px'

      } else {

        pointerStyle.transform = `translate(0, -${nodeRect.height * 0.2}px)`
        pointerStyle.height = (nodeRect.height * 0.8) + 'px'

        await sleep(100)

        pointerStyle.transition = 'all 0'
        pointerStyle.opacity = '0'

        await sleep(100)
        pointerStyle.transform = ''
        pointerStyle.top = (nodeRect.top + (nodeRect.height * 0.2) + diffTop) + 'px'

        await sleep(100)

        pointerStyle.transition = 'all .25s'
        pointerStyle.opacity = '1'

        await sleep(100)

        pointerStyle.height = (nodeRect.height * 0.6) + 'px'

      }

    }

    function getTabs() {

      const defaultSlots = that.$slots.default()
      const map = {}

      function getTab(vnode) {

        const tab = h(TMenuItem, {
          active: () => activeNode.value?.props.name === vnode.props.name, ...vnode.props,
          onClick: () => {
            if (vnode.props.hasOwnProperty('disabled')) return

            activeNode.value = vnode

            // that.$emit('update:modelValue', vnode.props.name)

            fixPointer(tab)
          }
        })

        map[vnode.props.route] = tab

        nextTick(() => {
          if (!activeNode.value && tab.props.hasOwnProperty('activation')) {
          activeNode.value = vnode
          nextTick(() => {
            fixPointer(tab)
          })
        }
        })

        return tab
      }

      watch(router.currentRoute, (c) => {

        // const tab = defaultSlots.find(slot => slot.props.route === c.path)
        const tab = map[c.path]

        if (tab) {
          activeNode.value = tab
          nextTick(fixPointer.bind(null, tab))
        }
      }, { lazy: true })

      return defaultSlots.filter(slot => slot.type.name && qualifiedName.includes(slot.type.name)).map(getTab)

    }

    return h('div', { class: 'TMenuTabs-Container' }, [getTabs(), pointer])

  }
})
</script>

<style lang="scss" scoped>
.TTabs-Pointer {
  position: absolute;

  left: -5px;
  //top: 42px;

  //height: 3.5%;
  width: 3px;

  opacity: 0;
  transition: all .25s;
  border-radius: 50px;
  background-color: var(--el-color-primary);
}

.TMenuTabs-Container {
  position: relative;
  display: flex;
  flex-direction: column;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>