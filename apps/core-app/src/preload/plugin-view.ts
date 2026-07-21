import { installTransportPortHandoff } from '@talex-touch/utils/transport'
import { contextBridge } from 'electron'
import { pluginViewRendererIpcAdapter } from '../shared/ipc/plugin-view-renderer-adapter'
import { parsePluginViewBootstrapArgument } from '../shared/plugin-view-bridge'
import { createPluginViewChannel } from './plugin-view-channel'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function resolveThemeFlags(themeStyle: unknown): {
  dark: boolean
  blur: boolean
  coloring: boolean
} {
  if (!isRecord(themeStyle)) return { dark: false, blur: false, coloring: false }
  const nestedTheme = isRecord(themeStyle.theme) ? themeStyle.theme : undefined
  const nestedStyle = nestedTheme && isRecord(nestedTheme.style) ? nestedTheme.style : undefined
  return {
    dark: themeStyle.dark === true || nestedStyle?.dark === true,
    blur: themeStyle.blur === true,
    coloring: themeStyle.coloring === true
  }
}

function applyTheme(themeStyle: unknown): void {
  const flags = resolveThemeFlags(themeStyle)
  const apply = (): void => {
    const root = document.documentElement
    root.classList.toggle('dark', flags.dark)
    root.classList.toggle('touch-blur', flags.blur)
    root.classList.toggle('coloring', flags.coloring)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  } else {
    apply()
  }
}

if (!process.contextIsolated) {
  throw new Error('Trusted plugin views require context isolation.')
}

const disposeTransportPortHandoff = installTransportPortHandoff(
  pluginViewRendererIpcAdapter,
  window
)
const bootstrap = parsePluginViewBootstrapArgument(process.argv)
const channel = createPluginViewChannel(pluginViewRendererIpcAdapter, {
  uniqueKey: bootstrap.channelKey
})

const publicChannel = Object.freeze({
  regChannel: channel.regChannel,
  unRegChannel: channel.unRegChannel,
  send: channel.send
})

contextBridge.exposeInMainWorld('$plugin', Object.freeze({ ...bootstrap.plugin }))
contextBridge.exposeInMainWorld(
  '$config',
  Object.freeze({ themeStyle: bootstrap.config.themeStyle })
)
contextBridge.exposeInMainWorld('$channel', publicChannel)

applyTheme(bootstrap.config.themeStyle)
window.addEventListener(
  'beforeunload',
  () => {
    disposeTransportPortHandoff()
    channel.destroy()
  },
  { once: true }
)
