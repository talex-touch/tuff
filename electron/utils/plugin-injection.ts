import path from 'path'
import { BrowserWindow } from 'electron'
import { ProcessorVars } from '../addon/initializer'

export function injectJs(win: BrowserWindow, options: any) {
    const [name, pluginInfo, sourceConfig] = options

    const fileP = path.join(ProcessorVars.pluginPath, name)

    const relativePath = path.relative(ProcessorVars.rootPath, fileP)

    const _path = {
        relative: relativePath,
        root: ProcessorVars.rootPath,
        plugin: fileP
    }

    win.webContents.executeJavaScript(`
                
                ;(() => {
                    if ( global.$plugin ) { return } 
                    
                    console.log("Touch # Auto inject JS")
                
                    const { ipcRenderer } = require('electron')
                    
                    global.$plugin = {}
                    
                    Object.assign(global.$plugin, {
                        pluginInfo: ${JSON.stringify(pluginInfo)},
                        sourceConfig: ${JSON.stringify(sourceConfig)},
                        path: ${JSON.stringify(_path)},
                        typeMap: new Map(),
                        syncMap: new Map()
                    })
                    
                    global.$crash = function(message, extraData) {
                    
                        global.$postMainProcessMessage('crash', {
                            message,
                            ...extraData
                        })
                    
                    }
                    
                    global.$postMainProcessMessage = function(type, data, options) {
    
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
                   
                    global.$asyncMainProcessMessage = async function(type, data, options) {
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
            
                            global.$plugin.syncMap.set(onlyID, (data) => {
            
                                global.$plugin.syncMap.delete(onlyID)
            
                                clearTimeout(timer)
            
                                resolve(data)
            
                            });
            
                        })
    
                    } 
               
                    global.$registerTypeProcess = function(type, callback) {
            
                        if ( !global.$plugin.typeMap.has(type) ) {
                            global.$plugin.typeMap.set(type, [])
                        }
            
                        global.$plugin.typeMap.get(type).push(callback)
            
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
                            global.$plugin.syncMap.get(sync)?.({
                                origin: arg,
                                data: arg.data
                            })
                        else global.$plugin.typeMap.get(type)?.forEach( (type) => type({
                            origin: arg,
                            data: arg.data
                        }) )
            
                    })
                    
                    global.clsL = document.body.parentNode['classList']
                
                })()
             
            `)
}

export function injectStyles(win: BrowserWindow) {

    win.webContents.insertCSS(`
                
                html, body, #app {
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
                }
                
            `)

}