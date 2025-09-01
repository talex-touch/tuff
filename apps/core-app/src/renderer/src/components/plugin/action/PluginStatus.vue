<template>
  <div ref="dom" @click="func" v-wave class="PluginStatus-Container" :class="{ shrink }"></div>
</template>

<script name="PluginStatus" lang="ts" setup>
import { ITouchPlugin, PluginStatus } from '@talex-touch/utils';
import { pluginManager } from '~/modules/channel/plugin-core/api'

const props = defineProps<{
  plugin: ITouchPlugin
  shrink: boolean
}>()
const dom = ref()

const mapper = [
    'LOADED',
    'LOADING',
    'ACTIVE',
    'ENABLED',
    'CRASHED',
    'DISABLING',
    'DISABLED',
    'LOAD_FAILED']

const func = ref(() => {})
const status = computed(() => props.plugin.status)

function refresh(): void {
  const el = dom.value
  if (!el) return

  el.classList.remove(
    'LOADED',
    'LOADING',
    'ACTIVE',
    'ENABLED',
    'CRASHED',
    'DISABLING',
    'DISABLED',
    'LOAD_FAILED'
  )
  el.classList.add(mapper[status.value])

  console.log('PluginStatus', props.plugin.name, status.value)

  if (status.value === PluginStatus.DISABLED) {
    el.innerHTML = `Click to enable plugin.`

    func.value = () => {
      pluginManager.enablePlugin(props.plugin.name)
    }
  } else if (status.value === PluginStatus.DISABLING) {
    el.innerHTML = ``
  } else if (status.value === PluginStatus.CRASHED) {
    el.innerHTML = `Plugin crashed, click to restart.`

    func.value = () => {
      pluginManager.enablePlugin(props.plugin.name)
    }
  } else if (status.value === PluginStatus.ENABLED) {
    el.innerHTML = `Plugin enabled, click to disable.`

    func.value = () => {
      pluginManager.disablePlugin(props.plugin.name)
    }
  } else if (status.value === PluginStatus.ACTIVE) {
    el.innerHTML = ``
  } else if (status.value === PluginStatus.LOADING) {
    el.innerHTML = ``
  } else if (status.value === PluginStatus.LOADED) {
    el.innerHTML = `Plugin loaded, click to enable.`

    func.value = () => {
      pluginManager.enablePlugin(props.plugin.name)
    }
  } else if (status.value === PluginStatus.LOAD_FAILED) {
    el.innerHTML = `Plugin load failed, click to restart.`

    func.value = () => {
      pluginManager.disablePlugin(props.plugin.name)
      pluginManager.enablePlugin(props.plugin.name)
    }
  }
}

onMounted(() => {
  watchEffect(() => {
    const ctx = {
      status: status.value,
      pluginName: props.plugin.name,
      ...props,
      get $el() {
        return dom.value
      }
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
  opacity: 0.75;
  color: #fff;
  background: var(--el-color-primary-light-3);
}

.PluginStatus-Container.LOADING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--el-color-primary-light-3);
  animation: loading 0.5s infinite;
}

.PluginStatus-Container.ACTIVE {
  height: 5px;

  cursor: not-allowed;
  opacity: 0.75;
  pointer-events: none;
  color: var(--el-text-color-primary);
  background: var(--el-color-success);
  animation: activing 1s infinite;
}

.PluginStatus-Container.ENABLED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--el-text-color-primary);
  background: var(--el-color-success);
}

.PluginStatus-Container.CRASHED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--el-color-warning-light-7);
  background: var(--el-color-danger);
}

.PluginStatus-Container.LOAD_FAILED {
  height: 30px;

  cursor: pointer;
  opacity: 1;
  color: var(--el-color-warning-light-7);
  background: var(--el-color-danger);
}

.PluginStatus-Container.DISABLED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  background: var(--el-color-info);
}

.PluginStatus-Container.DISABLING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--el-color-info-light-3);
  animation: loading 0.5s infinite;
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
  transition: 0.25s;
  opacity: 0;
  user-select: none;
  border-bottom: 1px solid var(--el-border-color);
}
</style>
