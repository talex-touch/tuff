import { ipcRenderer } from 'electron'

export const pluginViewRendererIpcAdapter = Object.freeze({
  on: (channelName: string, listener: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.on(channelName, listener),
  removeListener: (channelName: string, listener: (event: unknown, payload: unknown) => void) =>
    ipcRenderer.removeListener(channelName, listener),
  send: (channelName: string, payload: unknown) => ipcRenderer.send(channelName, payload)
})
