
import {asyncMainProcessMessage, pluginManager, registerTypeProcess} from "@modules/samples/node-api";
import {blowMention, forApplyMention, popperMention} from "@modules/mention/dialog-mention";
import {h} from "vue";
import PluginApplyInstall from "@comp/plugin/action/mention/PluginApplyInstall.vue";

export function dropperResolver() {
    document.addEventListener('drop', async (e) => {
        e.preventDefault()

        const files = e.dataTransfer.files;

        if(files && files.length === 1) {
            //获取文件路径
            const { path } = files[0] as any;

            if ( path.endsWith('.touch-plugin') ) {
                const { data } = await asyncMainProcessMessage('@drop-plugin', path) as any

                if ( data.status === 'error' ) {
                    // if ( data.msg === '10091' ) {
                        blowMention('Install', '该插件已遭受不可逆破坏！')
                    // }
                } else {
                    const { manifest } = data

                    await popperMention(manifest.name, () => {
                        return h(PluginApplyInstall, { manifest })
                    })
                }
            }
            //读取文件内容
            // const content = fs.readFileSync(path);
            // console.log(content.toString());
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