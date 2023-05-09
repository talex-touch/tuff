
import { asyncMainProcessMessage, pluginManager, registerTypeProcess } from "@modules/samples/node-api";
import { blowMention, forApplyMention, popperMention } from "@modules/mention/dialog-mention";
import { h } from "vue";
import PluginApplyInstall from "@comp/plugin/action/mention/PluginApplyInstall.vue";
import {AppUpgradation } from "@modules/hooks/api/useUpgradation";
import { $t } from '@modules/lang'
import AppUpgradationView from "@comp/base/AppUpgradationView.vue";

export async function applicationUpgrade() {
    const res = await AppUpgradation.getInstance().check()
    if ( res ) {

        document.body.classList.add('has-update')

        await popperMention($t('version.update-available'), () => {
            return h(AppUpgradationView, {release: res})
        })

    }
}

export function screenCapture() {
    const widthStr = document.body.style.getPropertyValue('--winWidth')
    const heightStr = document.body.style.getPropertyValue('--winHeight')

    const winWidth = widthStr ? parseInt(widthStr) : 0
    const winHeight = heightStr ? parseInt(heightStr) : 0

    if ( winWidth === 0 || winHeight === 0 ) return
    registerTypeProcess('@screen-capture', async ({ data }) => {
        const width = document.body.clientWidth
        const height = document.body.clientHeight

        const video = document.getElementById('video') as HTMLVideoElement

        const media = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                // @ts-ignore
                chromeMediaSource: 'desktop',
                // deviceId: data.id,
                chromeMediaSourceId: data.id,
                minWidth: width,
                maxWidth: winHeight,
                minHeight: height,
                maxHeight: winHeight,
                height: height,
                width: width
            },

        })

        console.log( data, media.getTracks() )
        //
        // const track = media.getVideoTracks()[0]

        console.log( data, media )

        // video.srcObject = media
        // video.onloadedmetadata = (e) => {
        //     video.play()
        // }
    })
}

export function dropperResolver() {
    async function dropperFile(path) {
        if ( path.endsWith('.touch-plugin') ) {
            const { data } = await asyncMainProcessMessage('@drop-plugin', path) as any

            if ( data.status === 'error' ) {
                if ( data.msg === '10091' ) {
                    await blowMention('Install', '该插件已遭受不可逆破坏！')
                } else if ( data.msg === '10092' ) {
                    await blowMention('Install', '无法识别该文件！')
                }
            } else {
                const { manifest } = data

                await popperMention(manifest.name, () => {
                    return h(PluginApplyInstall, { manifest, path })
                })
            }
        }

        return true
    }

    registerTypeProcess('@mock-drop', ({ data }) => dropperFile(data))

    document.addEventListener('drop', async (e) => {
        e.preventDefault()

        const files = e.dataTransfer.files;

        if(files && files.length === 1) {
            //获取文件路径
            const { path } = files[0] as any;

            await dropperFile(path)
        }
    })

    document.addEventListener('dragover', (e) => {
        e.preventDefault()

    })
}

export function clipBoardResolver() {
    registerTypeProcess(`clipboard`, ({ data }) => {
        // if ( data.type === "text" ) {
        //     blowMention('粘贴板', `你好像复制了 ${data.data}`)
        // } else if ( data.type === "image" ) {
        //     blowMention('粘贴板', data.data)
        // } else if ( data.type === "html" ) {
        //     blowMention('粘贴板', data.data)
        // }
    })
}