<template>
  <div ref="dom" @click="func" v-wave class="PluginStatus-Container" :class="{ shrink }">
  </div>
</template>

<script name="PluginStatus" setup>
import { pluginManager  } from '@modules/channel/plugin-core/api'
import { ref, watchEffect, onMounted } from 'vue'

const props = defineProps(['plugin', 'shrink'])
const dom = ref()

const _PluginStatus = [ 'DISABLED', 'DISABLING', 'CRASHED', 'ENABLED', 'ACTIVE', 'LOADING', 'LOADED' ]
const func = ref(() => {})
const status = ref('DISABLED')

watchEffect(() => {
  status.value = _PluginStatus[props.plugin._status]
})

function refresh () {

  this.$el.classList.remove('LOADED', 'LOADING', 'ACTIVE', 'ENABLED', 'CRASHED', 'DISABLING', 'DISABLED')
  this.$el.classList.add(this.status)

  if( this.status === 'DISABLED' ) {
    this.$el.innerHTML = `点击启用插件`

    func.value = () => {

      pluginManager.enablePlugin(this.pluginName)

    }
  } else if( this.status === 'DISABLING' ) {
    this.$el.innerHTML = ``
  } else if( this.status === 'CRASHED' ) {
    this.$el.innerHTML = `插件已崩溃，点击重启！`

    func.value = () => {

      pluginManager.enablePlugin(this.pluginName)

    }
  } else if( this.status === 'ENABLED' ) {
    this.$el.innerHTML = `插件已启用，点击停用！`

    func.value = () => {

      pluginManager.disablePlugin(this.pluginName)

    }
  } else if( this.status === 'ACTIVE' ) {
    this.$el.innerHTML = ``
  } else if( this.status === 'LOADING' ) {
    this.$el.innerHTML = ``
  } else if( this.status === 'LOADED' ) {
    this.$el.innerHTML = `插件已加载，点击启用！`

    func.value = () => {

      pluginManager.enablePlugin(this.pluginName)

    }
  }

}

onMounted(() => {
  watchEffect(() => {

    const ctx = {
      status: status.value,
      pluginName: props.plugin.pluginInfo.name,
      ...props,
      get $el() { return dom.value }
    }

    const func = refresh.bind(ctx)

    func()

  })
})

</script>

<style lang="scss" scoped>
.PluginStatus-Container.LOADED {
  height: 30px;

  cursor: pointer;
  opacity: .75;
  color: #fff;
  background: var(--el-color-primary-light-3);
}

.PluginStatus-Container.LOADING {
  height: 5px;

  pointer-events: none;
  opacity: .75;
  background: var(--el-color-primary-light-3);
  animation: loading .5s infinite;
}

.PluginStatus-Container.ACTIVE {
  height: 5px;

  cursor: not-allowed;
  opacity: .75;
  pointer-events: none;
  color: var(--el-text-color-primary);
  background: var(--el-color-success);
  animation: activing 1s infinite;
}

.PluginStatus-Container.ENABLED {
  height: 30px;

  cursor: pointer;
  opacity: .75;
  color: var(--el-text-color-primary);
  background: var(--el-color-success);
}

.PluginStatus-Container.CRASHED {
  height: 30px;

  cursor: pointer;
  opacity: .75;
  color: var(--el-color-warning-light-7);
  background: var(--el-color-danger);
}

.PluginStatus-Container.DISABLED {
  height: 30px;

  cursor: pointer;
  opacity: .75;
  background: var(--el-color-info);
}

.PluginStatus-Container.DISABLING {
  height: 5px;

  pointer-events: none;
  opacity: .75;
  background: var(--el-color-info-light-3);
  animation: loading .5s infinite;
}

@keyframes loading {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@keyframes activing {
  from {
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0) translateY(-100%);
  }
}

.PluginStatus-Container {
  &.shrink {
    width: 24px;
    height: 24px;

    //opacity: 1 !important;
    color: transparent !important;
  }
  position: relative;
  padding: 2px 4px;
  display: flex;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 0;

  box-sizing: border-box;
  transition: .25s;
  opacity: 0;
  user-select: none;
  border-bottom: 1px solid var(--el-border-color);
}
</style>