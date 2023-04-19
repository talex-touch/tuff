import { ProcessorVars } from "../initializer";
import path from "path";
import { checkDirWithCreate } from "../../utils/common-util";
import { Plugin } from "./plugin-base";
import fse from "fs-extra";
import compressing from 'compressing'
import * as fs from "fs";
import { sendMainChannelMsg } from "../../utils/channel-util";

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

    pack() {
        // copy every file
        const array = JSON.parse(this.files)

        console.log(array)

        // array.forEach(file => {
        //     fse.copyFileSync(path.join(this.pluginPath, file), path.join(this.mainPath, file))
        //
        //     console.log('[PluginPackager] Copying file: ' + file)
        // })

        // generate manifest
        fse.writeFileSync(path.join(this.mainPath, 'manifest.talex'), this.manifest)

        // generate key
        fse.writeFileSync(path.join(this.mainPath, 'key.talex'), this.plugin.pluginInfo.name)

        const tarStream = new compressing.tar.Stream();

        tarStream.addEntry(path.join(this.mainPath, 'manifest.talex'))
        tarStream.addEntry(path.join(this.mainPath, 'key.talex'))

        array.forEach(file => {
            tarStream.addEntry(path.join(this.pluginPath, file))
        })

        const target = path.join(this.mainPath, this.plugin.pluginInfo.name + '.touch-plugin')
        const destStream = fs.createWriteStream(target);

        const content = '@@@' + this.plugin.pluginInfo.name + '\n' + this.manifest + '\n\n\n'
        const length = content.length + 25

        // 让l自动补位为5位 比如00125
        const l = length.toString().padStart(5, '0')

        destStream.write('TalexTouch-PluginPackage@@' + (l) + content)

        tarStream.pipe(destStream).on('finish', () => {
            // fse.copyFileSync(target, path.join(ProcessorVars.buildPath, this.plugin.pluginInfo.name + '.touch-plugin'))
            // fse.removeSync(this.mainPath, { recursive: true })

            console.log("[PluginPackager] Packaged plugin: " + this.plugin.pluginInfo.name)

            sendMainChannelMsg('plugin-packager', {
                type: 'pack',
                plugin: this.plugin.pluginInfo.name,
                status: 'success'
            })
        });

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

                }

            })
        })
    }
}