const { ipcRenderer, contextBridge } = require('electron')

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  sendSync: (channel, data) => ipcRenderer.sendSync(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
})

window.addEventListener('message', (event) => {
  const { channel, data } = event.data
  if (channel) {
    ipcRenderer.send(channel, data)
  }
})

ipcRenderer.on('@main-process-message', (event, ...args) => {
    window.postMessage({ channel: '@main-process-message', data: args }, '*')
})