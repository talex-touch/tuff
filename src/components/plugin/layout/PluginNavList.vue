<script>
import { h, nextTick, onUpdated, ref, watch, watchEffect } from 'vue'
import IconButton from "@comp/button/IconButton.vue";
import { ElTooltip } from "element-plus";
import PluginIcon from "@comp/plugin/PluginIcon.vue";

const _PluginStatus = [ 'DISABLED', 'DISABLING', 'CRASHED', 'ENABLED', 'ACTIVE', 'LOADING', 'LOADED' ]

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
      const pluginStatus = _PluginStatus[plugin._status]

      return h('div', { class: 'scale-upper' }, h( IconButton, {
        undot: true,
        plain: true,
        onClick: (e) => {
          e.stopPropagation()
          this.$emit( 'update:modelValue', plugin.pluginInfo.name )
        },
        select: modelValue === plugin.pluginInfo.name,
      }, {
        default: () => h( ElTooltip, {
          placement: 'right',
          content: plugin.pluginInfo.name
        }, {
          default: () => h( PluginIcon, {
            icon: plugin.pluginInfo.icon,
            alt: plugin.pluginInfo.name
          } )
        } )
      } ))
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
.scale-upper {
  opacity: 0;

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