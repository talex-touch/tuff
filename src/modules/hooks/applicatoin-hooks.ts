
import { asyncMainProcessMessage, pluginManager, registerTypeProcess } from "@modules/samples/node-api";
import { blowMention, forApplyMention, popperMention } from "@modules/mention/dialog-mention";
import { h } from "vue";
import PluginApplyInstall from "@comp/plugin/action/mention/PluginApplyInstall.vue";
import {AppUpgradation } from "@modules/hooks/api/useUpgradation";
import { $t } from '@modules/lang'
import AppUpgradationView from "@comp/base/AppUpgradationView.vue";

export async function applicationUpgrade() {
    const res = await AppUpgradation.getInstance().check()
    if ( res ) await popperMention($t('version.update-available'), () => {
        return h(AppUpgradationView, {release: res})
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