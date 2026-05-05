<script name="PluginStatus" lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { PluginStatus } from '@talex-touch/utils'
import { useI18n } from 'vue-i18n'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import { devLog } from '~/utils/dev-log'

const props = defineProps<{
  plugin: ITouchPlugin
  shrink: boolean
}>()
const { t } = useI18n()

const status = computed(() => props.plugin.status)

const statusView = computed(() => {
  switch (status.value) {
    case PluginStatus.DISABLED:
      return {
        className: 'DISABLED',
        label: t('plugin.status.disabled'),
        action: async () => {
          await pluginSDK.enable(props.plugin.name)
        }
      }
    case PluginStatus.DISABLING:
      return { className: 'DISABLING', label: '', action: null }
    case PluginStatus.CRASHED:
      return {
        className: 'CRASHED',
        label: t('plugin.status.crashed'),
        action: async () => {
          await pluginSDK.enable(props.plugin.name)
        }
      }
    case PluginStatus.ENABLED:
      return {
        className: 'ENABLED',
        label: t('plugin.status.enabled'),
        action: async () => {
          await pluginSDK.disable(props.plugin.name)
        }
      }
    case PluginStatus.ACTIVE:
      return { className: 'ACTIVE', label: '', action: null }
    case PluginStatus.LOADING:
      return { className: 'LOADING', label: '', action: null }
    case PluginStatus.LOADED:
      return {
        className: 'LOADED',
        label: t('plugin.status.loaded'),
        action: async () => {
          await pluginSDK.enable(props.plugin.name)
        }
      }
    case PluginStatus.LOAD_FAILED:
      return {
        className: 'LOAD_FAILED',
        label: t('plugin.status.loadFailed'),
        action: async () => {
          try {
            devLog(`[PluginStatus] Attempting to reload failed plugin: ${props.plugin.name}`)
            await pluginSDK.reload(props.plugin.name)
            devLog(`[PluginStatus] Plugin reload initiated for: ${props.plugin.name}`)
          } catch (error) {
            devLog(`[PluginStatus] Failed to reload plugin ${props.plugin.name}:`, error)
          }
        }
      }
    case PluginStatus.DEV_DISCONNECTED:
      return {
        className: 'DEV_DISCONNECTED',
        label: t('plugin.status.devDisconnected'),
        action: async () => {
          await pluginSDK.reconnectDevServer(props.plugin.name)
        }
      }
    case PluginStatus.DEV_RECONNECTING:
      return {
        className: 'DEV_RECONNECTING',
        label: t('plugin.status.devReconnecting'),
        action: null
      }
    default:
      return { className: '', label: '', action: null }
  }
})

async function handleClick(): Promise<void> {
  devLog('[PluginStatus]', props.plugin.name, status.value)
  await statusView.value.action?.()
}
</script>

<template>
  <div
    v-wave
    class="PluginStatus-Container"
    :class="[statusView.className, { shrink }]"
    @click="handleClick"
  >
    {{ statusView.label }}
  </div>
</template>

<style lang="scss" scoped>
.PluginStatus-Container.LOADED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: #fff;
  background: var(--tx-color-primary-light-3);
}

.PluginStatus-Container.LOADING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--tx-color-primary-light-3);
  animation: loading 0.5s infinite;
}

.PluginStatus-Container.ACTIVE {
  height: 5px;

  cursor: not-allowed;
  opacity: 0.75;
  pointer-events: none;
  color: var(--tx-text-color-primary);
  background: var(--tx-color-success);
  animation: activing 1s infinite;
}

.PluginStatus-Container.ENABLED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--tx-text-color-primary);
  background: var(--tx-color-success);
}

.PluginStatus-Container.CRASHED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--tx-color-warning-light-7);
  background: var(--tx-color-danger);
}

.PluginStatus-Container.LOAD_FAILED {
  height: 30px;

  cursor: pointer;
  opacity: 1;
  color: var(--tx-color-warning-light-7);
  background: var(--tx-color-danger);
}

.PluginStatus-Container.DISABLED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  background: var(--tx-color-info);
}

.PluginStatus-Container.DISABLING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--tx-color-info-light-3);
  animation: loading 0.5s infinite;
}

.PluginStatus-Container.DEV_DISCONNECTED {
  height: 30px;

  cursor: pointer;
  opacity: 0.75;
  color: var(--tx-color-warning-light-7);
  background: var(--tx-color-warning);
}

.PluginStatus-Container.DEV_RECONNECTING {
  height: 5px;

  pointer-events: none;
  opacity: 0.75;
  background: var(--tx-color-warning-light-3);
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
  border-bottom: 1px solid var(--tx-border-color);
}
</style>
