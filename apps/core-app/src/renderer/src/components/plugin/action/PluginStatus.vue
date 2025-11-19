<script name="PluginStatus" lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { PluginStatus } from '@talex-touch/utils'
import { useI18n } from 'vue-i18n'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

const props = defineProps<{
  plugin: ITouchPlugin
  shrink: boolean
}>()
const dom = ref()
const { t } = useI18n()

const mapper = [
  'DISABLED',
  'DISABLING',
  'CRASHED',
  'ENABLED',
  'ACTIVE',
  'LOADING',
  'LOADED',
  'LOAD_FAILED',
  'DEV_DISCONNECTED',
  'DEV_RECONNECTING',
]

const func = ref(() => {})
const status = computed(() => props.plugin.status)

function refresh(): void {
  const el = dom.value
  if (!el)
    return

  el.classList.remove(
    'DISABLED',
    'DISABLING',
    'CRASHED',

    'ENABLED',
    'ACTIVE',

    'LOADING',
    'LOADED',
    'LOAD_FAILED',

    'DEV_DISCONNECTED',
    'DEV_RECONNECTING',
  )
  el.classList.add(mapper[status.value])

  console.debug('PluginStatus', props.plugin.name, status.value)

  if (status.value === PluginStatus.DISABLED) {
    el.innerHTML = t('plugin.status.disabled')

    func.value = async () => {
      await pluginSDK.enable(props.plugin.name)
    }
  }
  else if (status.value === PluginStatus.DISABLING) {
    el.innerHTML = ``
  }
  else if (status.value === PluginStatus.CRASHED) {
    el.innerHTML = t('plugin.status.crashed')

    func.value = async () => {
      await pluginSDK.enable(props.plugin.name)
    }
  }
  else if (status.value === PluginStatus.ENABLED) {
    el.innerHTML = t('plugin.status.enabled')

    func.value = async () => {
      await pluginSDK.disable(props.plugin.name)
    }
  }
  else if (status.value === PluginStatus.ACTIVE) {
    el.innerHTML = ``
  }
  else if (status.value === PluginStatus.LOADING) {
    el.innerHTML = ``
  }
  else if (status.value === PluginStatus.LOADED) {
    el.innerHTML = t('plugin.status.loaded')

    func.value = async () => {
      await pluginSDK.enable(props.plugin.name)
    }
  }
  else if (status.value === PluginStatus.LOAD_FAILED) {
    el.innerHTML = t('plugin.status.loadFailed')

    func.value = async () => {
      try {
        console.log(`[PluginStatus] Attempting to reload failed plugin: ${props.plugin.name}`)
        await pluginSDK.reload(props.plugin.name)
        console.log(`[PluginStatus] Plugin reload initiated for: ${props.plugin.name}`)
      }
      catch (error) {
        console.error(`[PluginStatus] Failed to reload plugin ${props.plugin.name}:`, error)
        el.innerHTML = `${t('plugin.status.loadFailed')}`
      }
    }
  }
  else if (status.value === PluginStatus.DEV_DISCONNECTED) {
    el.innerHTML = t('plugin.status.devDisconnected')

    func.value = async () => {
      await pluginSDK.reconnectDevServer(props.plugin.name)
    }
  }
  else if (status.value === PluginStatus.DEV_RECONNECTING) {
    el.innerHTML = t('plugin.status.devReconnecting')
    func.value = () => {}
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
      },
    }

    const func = refresh.bind(ctx)

    func()
  })
})
</script>

<template>
  <div ref="dom" v-wave class="PluginStatus-Container" :class="{ shrink }" @click="func" />
</template>

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

.PluginStatus-Container.DEV_DISCONNECTED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--el-color-warning-light-7);
  background: var(--el-color-warning);
}

.PluginStatus-Container.DEV_RECONNECTING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--el-color-warning-light-3);
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
