// const child_process = require('child_process')
// const path = require('path')
// const { ipcRenderer } = require('electron')
//
// console.log("Plugin loaded!")
//
// ipcRenderer.on('@talex-plugin:preload', () => {
//
//   console.log("Preloaded!")
//
//   const plugin = window.$plugin
//
//   const apiServer = child_process.fork(path.resolve(plugin.path.plugin, "api", "app.js"), {
//     cwd: path.join(plugin.path.plugin, "api"),
//   })
//
//   console.log("Plugin Show!")
//
// })
