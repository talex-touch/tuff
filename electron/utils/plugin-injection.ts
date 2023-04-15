import path from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { ProcessorVars } from '../addon/initializer'
import { win } from '../main'
import { Plugin } from '../addon/plugins/plugin-base'

import pkg from './../../package.json'
import { getConfig } from '../addon/storage'

export function injectWebView(plugin: Plugin) {
    const [name, pluginInfo, sourceConfig] = [plugin.pluginInfo.name, plugin.pluginInfo, plugin.sourceConfig]

    const fileP = path.join(ProcessorVars.pluginPath, name)

    const indexPath = plugin.__index(fileP)
    const preload = plugin.__preload(fileP)

    const _path = {
        relative:  path.relative(ProcessorVars.rootPath, fileP),
        root: ProcessorVars.rootPath,
        plugin: fileP
    }

    win.webContents.executeJavaScript(`

        !(() => {
            const injectionObj = {
                indexPath: "${indexPath}",
                preload: String.raw \`${String.raw `${preload}`}\`
            }
            
            const wrapper = document.querySelector('#PluginView-Wrapper')
            
            wrapper.innerHTML = ''
            
            const webview = document.createElement('webview')
            
            webview.setAttribute('src', injectionObj.indexPath)
            webview.setAttribute('nodeintegration', 'true')
            webview.setAttribute('webpreferences', 'contextIsolation=false')
            // webview.setAttribute('nodeintegrationinsubframes', 'true')
            webview.setAttribute('httpreferrer', 'https://plugin.touch.talex.com/${name}')
            webview.setAttribute('websecurity', 'false')
            webview.setAttribute('useragent', '${win.webContents.userAgent} TalexTouch/${pkg.version} (Plugins,like ${name})')
            webview.setAttribute('partition', 'persist:touch/${name}')
            
            injectionObj.preload && webview.setAttribute('preload', "file://" + injectionObj.preload)
            
            webview.addEventListener('did-finish-load', () => {
                console.log("Webview dom-ready")
                webview.openDevTools()
                
                webview.insertCSS(\`${getStyles()}\`)
                  
                webview.executeJavaScript(String.raw \`${String.raw `${getJs([name, pluginInfo, sourceConfig, JSON.stringify(_path)])}`}\`)  
               
                webview.send('@talex-plugin:preload', "${name}")
            })
            
            wrapper.appendChild(webview)
                
        })()
        
    `)

}

export function getJs(options) {
    const [name, pluginInfo, sourceConfig, _path] = options

    const themeConfig = getConfig('theme-style.ini')

    return `
        !(() => {
        
            if ( window.$plugin ) { return } 
                    
            console.log("Touch # Auto inject JS")
                        
            const { ipcRenderer, contextBridge } = require('electron')
                            
                            console.log( contextBridge )
                            
            window.$plugin = {}
                            
            Object.assign(window.$plugin, {
                pluginInfo: ${JSON.stringify(pluginInfo)},
                sourceConfig: ${JSON.stringify(sourceConfig)},
                path: ${_path},
                typeMap: new Map(),
                syncMap: new Map()
            })
            
            window.$postMainProcessMessage = function(type, data, options) {

                const res = ipcRenderer.sendSync('@plugin-process-message', {
                    status: 'send',
                    timeStamp: new Date().getTime(),
                    header: {
                        type,
                        plugin: "${name}",
                        ...options
                    },
                    data
                })
        
                if( res.status === 'reply' ) return res.data
        
                return res
        
            }
        
            window.$asyncMainProcessMessage = async function(type, data, options) {
                options = options || { timeout: 10000 }
                const onlyID = new Date().getTime() + "#" + type + "@" + Math.random().toString(12)
        
                let timer
        
                return new Promise((resolve, reject) => {
        
                    if ( options?.timeout ) {
                        timer = setTimeout(() => {
                            reject({ status: 'timeout' })
                        }, options.timeout)
                    }
        
                    ipcRenderer.send('@plugin-process-message', {
                        status: 'send',
                        timeStamp: new Date().getTime(),
                        header: {
                            type,
                            sync: onlyID,
                            plugin: "${name}",
                            ...options
                        },
                        data
                    })
        
                    window.$plugin.syncMap.set(onlyID, (data) => {
        
                        window.$plugin.syncMap.delete(onlyID)
        
                        clearTimeout(timer)
        
                        resolve(data)
        
                    });
        
                })
        
            }
        
            window.$registerTypeProcess = function(type, callback) {
        
                if ( !window.$plugin.typeMap.has(type) ) {
                    window.$plugin.typeMap.set(type, [])
                }
        
                window.$plugin.typeMap.get(type).push(callback)
        
            }
        
            ipcRenderer.on('@plugin-process-message', (_event, arg) => {
        
                const header = arg.header
        
                if( !header || !header.plugin ) {
                    console.error(_event, arg)
                    throw new Error("Invalid message!")
                }
        
                if( header.plugin !== "${name}" ) return
        
                const { type, sync, plugin } = header
        
                if( sync )
                    window.$plugin.syncMap.get(sync)?.({
                        origin: arg,
                        data: arg.data
                    })
                else window.$plugin.typeMap.get(type)?.forEach( (type) => type({
                    origin: arg,
                    data: arg.data
                }) )
        
            })
            
            window.$crash = function(message, extraData) {
                window.$postMainProcessMessage('crash', { message, ...extraData })
            }
                
            window.$config = {
                themeStyle: ${JSON.stringify(themeConfig)}
            }
                                         
            window.clsL = document.body.parentNode['classList']
        
            window.$config.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
            window.$config.themeStyle['blur'] ? clsL.add('blur') : clsL.remove('blur')
            window.$config.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
                     
        })()
        
    `

}

export function getStyles() {

    return `html, body, #app {
                  position: relative;
                  margin: 0;
                  padding: 0;
                
                  top: 0;
                  left: 0;
                
                  width: 100%;
                  height: 100%;
                
                  overflow: hidden;
                  border-radius: 0 8px 8px 0;
                  box-sizing: border-box;
                }

                html.dark {
                  --el-box-shadow-lighter: 0 0 0 1px rgba(255, 255, 255, .2) !important;
                  --el-box-shadow: 0 0 4px 1px rgba(29, 29, 29, .2) !important;
                }
                
                #app {
                  top: 2px;
                
                  height: calc(100% - 4px);
                  width: calc(100% - 2px);
                }`

}