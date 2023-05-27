<script>
import IconButton from "@comp/base/button//IconButton.vue";
import { ElTooltip } from "element-plus";
import PluginIcon from "@comp/plugin/PluginIcon.vue";
import PluginStatus from "@comp/plugin/action/PluginStatus.vue";

export default {
  name: "PluginNavList",
  props: {
    modelValue: {
      type: String,
      default: ""
    },
    plugins: {
      type: Object,
    }
  },
  emits: ['update:modelValue'],
  render() {

    const wrapper = h('div', {
      class: 'PluginNavList-Container fake-background',
      style: {
        height: `var(--height, 0px)`,
        transition: 'height .2s cubic-bezier(0.645, 0.045, 0.355, 1.000)'
      }
    }, getPlugins.bind(this)())

    function fixup() {
      if ( !wrapper.el.children ) return
      let _heights = 0

      ![ ...wrapper.el.children ].forEach((el, i) => {
        const height = el.offsetHeight

        _heights += height
      })

      wrapper.el.style.setProperty('--height', `${_heights}px`)
    }

    watch(() => this.plugins, () => {
      nextTick(fixup)
    })

    nextTick(fixup)

    function getPlugin(plugin, i) {
      if ( i > 3 || plugin._status < 3 || plugin._status > 5 ) return null
      const modelValue = this.modelValue || null
      // const pluginStatus = _PluginStatus[plugin._status]

      function getPluginContent() {
        return h( IconButton, {
          undot: true,
          plain: true,
          select: modelValue === plugin.name,
        }, [ h( ElTooltip, { placement: 'right', content: plugin.name }, h( PluginIcon, { icon: plugin.icon, alt: plugin.name } ) ) ] )
      }

      return h('div', {
        class: 'scale-upper ' + (modelValue === plugin.name ? 'active' : ''),
        onClick: (e) => {
          e.stopPropagation()
          this.$emit( 'update:modelValue', plugin.name )
        },
      }, [ getPluginContent.bind(this)(),  h('span', { class: 'PluginNavList-ItemText' }, plugin.name), h(PluginStatus, { plugin, shrink: true }) ] )
    }

    function getPlugins() {
      const plugins = this.plugins || []

      return [
        ...((res) => {
          [...plugins].forEach( (plugin, i) => res.push( getPlugin.bind(this)(plugin, i) ) )
            return res
        })([])
        // h( IconButton, {
        //   undot: true,
        //   plain: true,
        //   direct: '/market',
        //   icon: 'add'
        // } )
      ]
    }

    return wrapper
  }
}
</script>

<style lang="scss" scoped>
.PluginNavList-ItemText {
  position: absolute;

  top: 12px;
  left: 50px;

  opacity: 0;
  transition: .25s  cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.Flat .PluginNavList-ItemText {
  opacity: 1;
}

.Flat .PluginStatus-Container {
  position: absolute;

  right: 1em;
  top: 50%;

  border-radius: 50%;
  transform: translateY(-50%) scale(.5);
}

.PluginStatus-Container {
  position: absolute;
  display: none;
}

.scale-upper {
  &.active {
    .PluginNavList-ItemText {
      color: var(--el-color-primary-dark-2)
    }
  }
  opacity: 0;

  cursor: pointer;

  animation: scale-up-center .35s 0.4s cubic-bezier(0.785, 0.135, 0.150, 0.860) forwards;
}

@keyframes scale-up-center {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  80% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>