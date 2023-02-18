import { ipcMain } from 'electron'

import { win } from './index'
import process from 'process'
import path from 'path'
import fse from 'fs-extra'

export const rootPath = process.cwd()
export const touchPath = path.join(rootPath, 'talex-touch')

export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

export async function checkDirWithCreate(url) {

    const p = path.join(rootPath, url)

    if( !fse.existsSync(p) ) {

        return fse.mkdirSync(p)

    }

    return true

}

checkDirWithCreate('talex-touch').then(() => {})

ipcMain.on('@plugin-process-message', (e, arg) => {
    const header = arg.header

    if( !header || !header.plugin ) {
        console.error(e, arg)
        throw new Error("Invalid message!")
    }

    const { type, sync, plugin } = header

    console.log("[插件消息] " + type + " | 开始处理!")

    pluginTypeMap.get(type)?.forEach( (type) => {

        let replied = false

        const handIn = {
            origin: arg,
            data: arg.data,
            plugin,
            reply: (data: any, options: any = null) => {
                if( replied ) return
                replied = true

                if( sync ) {

                    e.sender.send('@plugin-process-message', {
                        status: 'reply',
                        timeStamp: new Date().getTime(),
                        header: {
                            plugin,
                            type,
                            sync,
                            options
                        },
                        data
                    })

                } else {

                    e.returnValue = {
                        status: 'reply',
                        timeStamp: new Date().getTime(),
                        header: {
                            plugin,
                            type,
                            options
                        },
                        data
                    }

                }

            }
        }

        const res = type(handIn)

        if( res instanceof Promise ) return

        res && handIn.reply(res)

    })

})

ipcMain.on('@main-process-message', (e, arg) => {

    const header = arg.header

    if( !header ) {
        console.error(e, arg)
        throw new Error("Invalid message!")
    }

    const { _: mainType, sync } = header.type

    console.log("[IPC消息] " + mainType + " | 开始处理!")

    typeMap.get(mainType)?.forEach( (type) => {

        const handIn = {
            origin: arg,
            data: arg.data._,
            reply: (data: any, options: any = null) => {

                if( sync ) {

                    e.sender.send('@main-process-message', {
                            status: 'reply',
                            timeStamp: new Date().getTime(),
                            header: {
                                type: {
                                    _: mainType,
                                    sync
                                },
                                options
                            },
                            data: {
                                _: data,
                            }
                        })

                } else {

                    e.returnValue = {
                        status: 'reply',
                        timeStamp: new Date().getTime(),
                        header: {
                            type: {
                                _: mainType,
                            },
                            options
                        },
                        data: {
                            _: data,
                        }
                    }

                }

            }
        }

        const res = type(handIn)

        if( res instanceof Promise ) return

        res && handIn.reply(res)

    })

})

const pluginTypeMap = new Map()
const typeMap = new Map()

export function registerPluginTypeProcess(type: string, callback: Function) {

    if ( !pluginTypeMap.has(type) ) {
        pluginTypeMap.set(type, [])
    }

    pluginTypeMap.get(type).push(callback)

}

export function registerTypeProcess(type: string, callback: Function) {

    if ( !typeMap.has(type) ) {
        typeMap.set(type, [])
    }

    typeMap.get(type).push(callback)

    return () => {

        typeMap.get(type).splice(typeMap.get(type).indexOf(callback), 1)

    }

}

const syncMap = new Map<string, Function>()

export async function sendMainProcessMessage(type: string, data: any = null, options: any = { timeout: 10000 }) {
    const onlyID = new Date().getTime() + "#" + type + "@" + Math.random().toString(12)

    let timer

    return new Promise((resolve, reject) => {

        if ( options?.timeout ) {
            timer = setTimeout(() => {
                reject({ type, status: 'timeout', data })
            }, options.timeout)
        }

        win.webContents.send('@main-process-message', {
            status: 'send',
            timeStamp: new Date().getTime(),
            header: {
                type: {
                    _: type,
                    sync: onlyID
                },
                ...options
            },
            data: {
                _: data,
            }
        })

        syncMap.set(onlyID, (data: any) => {

            syncMap.delete(onlyID)

            clearTimeout(timer)

            resolve(data)

        });

    })

}