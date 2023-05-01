import { ProcessorVars } from "../initializer";
import path from "path";
import { checkDirWithCreate } from "../../utils/common-util";
import { Plugin } from "./plugin-base";
import fse from "fs-extra";
import compressing from 'compressing'
import * as fs from "fs";
import { sendMainChannelMsg } from "../../utils/channel-util";
import {pluginManager} from "./plugin-manager";
import { exec } from "child_process";
import { CompressLimit, TalexCompress } from "../../utils/compress-util";

export class PluginPackager {
    plugin: Plugin
    manifest: string
    files: string

    pluginPath: string
    mainPath: string

    constructor(plugin: Plugin, manifest: string, files: string) {
        this.plugin = plugin
        this.manifest = manifest
        this.files = files

        this.pluginPath = path.join(ProcessorVars.pluginPath, this.plugin.pluginInfo.name)
        this.mainPath = path.join(ProcessorVars.buildPath, this.plugin.pluginInfo.name)

        checkDirWithCreate(this.mainPath, true).then(() => {})
    }

    #__pack_manifest() {
        const m = JSON.parse(this.manifest)

        delete m['pluginSubInfo']
        delete m['plugin']

        return JSON.stringify(m)
    }

    #__pack__init() {
        const manifest = this.#__pack_manifest()

        // generate manifest
        fse.writeFileSync(path.join(this.mainPath, 'manifest.talex'), manifest)

        // generate key
        fse.writeFileSync(path.join(this.mainPath, 'key.talex'), this.plugin.pluginInfo.name)
    }

    #__pack__tarStream() {
        const tarStream = new compressing.tar.Stream();

        tarStream.addEntry(path.join(this.mainPath, 'manifest.talex'))
        tarStream.addEntry(path.join(this.mainPath, 'key.talex'))

        const array = JSON.parse(this.files)
        array.forEach(file => {
            if ( file === 'init.json' ) return
            tarStream.addEntry(path.join(this.pluginPath, file))
        })

        return tarStream
    }

    #__pack__destStream() {
        const target = path.join(this.mainPath, this.plugin.pluginInfo.name + '.touch-plugin')
        const destStream = fs.createWriteStream(target);

        const content = '@@@' + this.plugin.pluginInfo.name + '\n' + this.manifest + '\n\n\n'
        const length = content.length + 25

        const l = length.toString().padStart(5, '0')
        destStream.write('TalexTouch-PluginPackage@@' + (l) + content)

        return destStream
    }

    pack() {
        const target = path.join(this.mainPath, this.plugin.pluginInfo.name + '.touch-plugin')
        const sendLog = (log: string, prefix = "PluginPackager") => {
            sendMainChannelMsg('plugin-packager-progress-log/' + this.plugin.pluginInfo.name, {
                type: 'pack',
                plugin: this.plugin.pluginInfo.name,
                log: `\x1b[1;32m[${prefix}]\x1b[0m ${log}\n`
            })
        }
        const sendProgress = (c: number, t: number) => {
            sendMainChannelMsg('plugin-packager-progress/' + this.plugin.pluginInfo.name, {
                type: 'pack',
                total: t,
                received: c
            })
        }
        sendLog("Start packaging plugin: " + this.plugin.pluginInfo.name)
        this.#__pack__init()
        sendLog("Initialized plugin package!")

        const srcPaths = [
            path.join(this.mainPath, 'manifest.talex'),
            path.join(this.mainPath, 'key.talex')
        ]
        const array = JSON.parse(this.files)

        array.forEach(file => {
            if ( file === 'init.json' ) return
            srcPaths.push(path.join(this.pluginPath, file))
        })

        // ========================================================

        const content = '@@@' + this.plugin.pluginInfo.name + '\n' + this.manifest + '\n\n\n'
        const length = content.length + 25

        const l = length.toString().padStart(5, '0')

        const tCompress = new TalexCompress(srcPaths, target, 'TalexTouch-PluginPackage@@' + (l) + content)

        tCompress.on('progress', (bytes) => {

            sendProgress(bytes, tCompress.totalBytes)
            sendLog(`Compressing plugin files... (${bytes}/${tCompress.totalBytes})`)

        })

        tCompress.on('stats', (e) => {

            if ( e === 0 ) {
                sendLog('Stats compressing plugin files...')
                sendProgress(tCompress.limit.size, tCompress.limit.size)
                return
            }

            if ( e === -1 ) {
                sendLog('Stats done, total: ' + tCompress.totalBytes + ' k-bytes')
                sendProgress(0, tCompress.limit.size)
                return
            }

            const { srcPath, srcStat, totalBytes } = e

            sendLog(" - File: " + srcPath + " | " + srcStat.size + " bytes")
            sendProgress(tCompress.limit.size - totalBytes, tCompress.limit.size)

        })

        tCompress.on('err', (msg) => {
            sendLog(msg, "ERROR")

            sendMainChannelMsg('plugin-packager', {
                type: 'pack',
                plugin: this.plugin.pluginInfo.name,
                status: 'failed'
            })
        })

        tCompress.on('flush', () => {
            sendLog("DONE!")
            sendProgress(1, 1)
            sendLog("Finished packaging plugin! (" + tCompress.totalBytes + " bytes)")
            console.log("[PluginPackager] Packaged plugin: " + this.plugin.pluginInfo.name)

            sendLog("Opening plugin package folder at " + target + "!")

            exec('explorer.exe /select,' + path.normalize(target))
            sendMainChannelMsg('plugin-packager', {
                type: 'pack',
                plugin: this.plugin.pluginInfo.name,
                status: 'success'
            })
        })

        tCompress.setLimit(new CompressLimit(0, 0))

        sendLog('Start compressing plugin files...')
        tCompress.compress()

    }
}

export enum ResolverStatus {
    OPEN_FILE_ERROR,
    READ_FILE_ERROR,
    NOT_A_PLUGIN_FILE,
    BROKEN_PLUGIN_FILE,
    SUCCESS
}

export class PluginResolver {
    filePath: string
    fd: number

    constructor(filePath) {

        this.filePath = filePath

    }

    async install(totalLength: number, manifest: any, cb: Function) {
        const _target = path.join(ProcessorVars.pluginPath, manifest.name)

        // const _plugin: Plugin = pluginManager.plugins[manifest.name]
        // if ( _plugin ) {
        //     if ( !_plugin.pluginInfo.pluginSubInfo.dev ) {
        //         return cb('plugin already exists')
        //     }
        /*} else*/ if ( fse.existsSync(_target) ) return cb('plugin already exists')
        await checkDirWithCreate(_target, true)

        const target = path.join(_target, 'extracted')
        const targetFile = path.join(target, manifest.name + '-unpacked.tar')
        await checkDirWithCreate(target, true)

        let bytesReceived = 0
        let totalBytes = fs.statSync(this.filePath).size - totalLength

        // 先将文件写入新文件
        const readStream = fs.createReadStream(this.filePath, { start: totalLength })
        const fileStream = fs.createWriteStream(targetFile, { flags: 'a' })

        readStream.on('data', (chunk) => {

            console.log('[PluginResolver] Installing plugin: ' + manifest.name + " | " + (bytesReceived / totalBytes * 100).toFixed(2) + '%')
        })

        readStream.on('end', async() => {
            // 解压新的文件
            await compressing.tar.uncompress(targetFile, _target)

            fse.rm(targetFile)

            cb('success', 'success')

            // rename manifest 2 init
            fse.rename(path.join(_target, 'manifest.talex'), path.join(_target, 'init.json'))

            // load plugin
            pluginManager.loadPlugin(manifest.name)
        })

        readStream.pipe(fileStream)

    }

    resolve(callback, whole = false) {
        console.log("[PluginResolver] Resolving plugin: " + this.filePath)
        const event = {
            msg: ''
        } as any
        fs.open(this.filePath, 'r', '0666', (err, fd) => {
            if (err) {
                event.msg = ResolverStatus.OPEN_FILE_ERROR
                return callback({ event, type: 'error' })
            }

            let buffer = Buffer.alloc(32)
            fs.read(fd, buffer, 0, buffer.length, 0, async (err, bytes) => {

                if (err) {
                    event.msg = ResolverStatus.READ_FILE_ERROR
                    return callback({ event, type: 'error' })
                }

                try {

                    const identifier = buffer.toString()
                    const arr = identifier.split('@')

                    console.log('[PluginResolver] Identifier: ' + identifier)

                    if ( !identifier.startsWith('TalexTouch-PluginPackage@@') || arr.length !== 4 ) {
                        event.msg = ResolverStatus.NOT_A_PLUGIN_FILE
                        return callback({ event, type: 'error' })
                    }

                    const length = Number(identifier.split('@')[2].substr(0, 5))

                    buffer = Buffer.alloc(length)

                    await fse.read(fd, buffer, 0, buffer.length, 32)

                    const _content = buffer.toString()
                    const _arr = _content.split('\n')

                    if ( _arr.length !== 5 ) {
                        event.msg = ResolverStatus.BROKEN_PLUGIN_FILE
                        return callback({ event, type: 'error' })
                    }

                    const manifest = JSON.parse(_arr[1])

                    if ( !whole ) {
                        event.msg = manifest
                        return callback({ event, type: 'success' })
                    }

                    const totalLength = length + 32

                    // install
                    setTimeout(async () => {
                        await this.install(totalLength, manifest, (msg, type = 'error') => {
                            event.msg = msg

                            callback({ event, type })
                        })
                    })

                } catch ( e ) {

                    event.msg = e
                    callback({ event, type: 'error' })

                } finally {

                    fs.close(fd, (err) => {
                        if (err)  {
                            event.msg = 'close file error'
                            return callback({ event, type: 'error' })
                        }
                    })

                    console.log('[PluginResolver] Resolved plugin: ' + this.filePath + " | File released!")

                }

            })
        })
    }
}