<script>
import { h, nextTick, ref } from 'vue'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import {debounceRef, throttleRef} from "@modules/utils";

// establish circle
// 1. get the middle point
// 2. get the radius
// 3. get the angle
// 4. get the position

const index = throttleRef(1, 100)

export default {
  name: "PluginCircling",
  props: {
    plugins: {
      type: Array,
      required: true
    }
  },
  emits: ['select'],
  render(ctx) {

    const that = this

    const pluginIcons = getPluginIcons()

    const wrapper = h('ul', { class: 'Plugin-CirclingList' }, pluginIcons)

    function getPluginIcons() {
      if ( !that.plugins ) return;

      return Object.values(that.plugins).map((plugin, i) => {
        const dom =  h('li', { class: {
            'Plugin-List-Item': true,
            'select': i + 1 === index.value
          }, key: plugin.pluginInfo.name }, [
          h('div', { class: 'Plugin-List-ItemWrapper' },
          [ h(PluginIcon, { alt: plugin.pluginInfo.name, icon: plugin.pluginInfo.icon })
               ])
        ])

        nextTick(() => {
          dom.el.addEventListener('click', () => index.value = i + 1)
          // dom.el.addEventListener('mouseenter', () => index.value = i + 1)
          // dom.el.addEventListener('mousemove', () => index.value = i)

          if ( i + 1 === index.value ) {
            ctx.$emit('select', plugin.pluginInfo.name)
          }

        })

        return dom
      })

    }

    nextTick(async () => {
      const el = wrapper.el
      const rect = el.getBoundingClientRect()

      const indexNum = index.value

      const middle = {
        x: 0,
        y: rect.height / 2
      }

      // set each item's transform-origin
      const items = el.querySelectorAll('.Plugin-List-Item')

      if ( indexNum > Array.from(items).length + 1 ) return

      function fixItemPos(item, rotate = 0, opacity = false, options) {
        if ( !item ) return

        Object.assign(item.style, {
          transformOrigin: `${middle.x}px ${middle.y}px`,
          transform: `translate(0, -400%) rotate(${rotate}deg)`,
          opacity: opacity ? '0' : '1',
          ...options
        })

        item.children[0].style.transform = `rotate(${-90}deg)`
      }

      items.forEach((item, i) => {

        const offset = ((indexNum - i) * 45) + 45

        fixItemPos(item, offset, Math.abs(indexNum - i) > 3, {
          left: `${-middle.x}px`,
          top: `${middle.y}px`
        })
      })

    })

    return wrapper
  }
}
</script>

<style lang="scss" scoped>
.Plugin-CirclingList {
  .Plugin-List-Item {
    &.select .Plugin-List-ItemWrapper {
      box-shadow: 0 0 4px 4px var(--el-fill-color-lighter);//var(--el-box-shadow)
    }
    .Plugin-List-ItemWrapper {
      display: flex;
      padding: 8px;

      height: 56px;
      width: 56px;

      cursor: pointer;
      border-radius: 8px;
      box-sizing: border-box;
      background-color: var(--el-fill-color);
      transition: .25s;
    }
    position: absolute;
    //padding: 8px;

    height: 64px;
    width: 64px;

    font-size: 40px;

    opacity: 0;
    border-radius: 8px;
    box-sizing: border-box;
    //background-color: var(--el-fill-color);
    //overflow: hidden;
    transition: .25s;
  }
  position: absolute;
  padding: 0 10px;
  margin: 0;
  display: flex;

  width: 100%;
  height: 100%;

  top: -65px;

  list-style: none;
  box-sizing: border-box;
  //background: blue;
  //transform: scale(.5)
}
</style>