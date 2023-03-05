import { pluginManager, registerTypeProcess } from '@modules/samples/node-api'
import { forApplyMention } from '@modules/mention/dialog-mention'

const actions = {
    'fullscreen': async (plugin, reply) => {

        await forApplyMention( "权限申请", plugin + " 请求将插件全屏展示！", [
            {
                content: "仅本次允许",
                type: "primary",
                onClick: async () => {
                    reply(true)

                    await pluginManager.fullScreenPlugin(plugin)
                    // await sendMainProcessMessage('full-screen-plugin', plugin)
                }
            },
            {
                content: "拒绝",
                type: "info",
                time: 18,
                onClick: async () => {
                    reply(false)
                }
            }
        ] )

    }
}

registerTypeProcess('plugin-apply-for', async ({ reply, data }) => {

    const [pluginName, action] = data.args
    if ( !pluginName || !action ) return

    await actions[action](pluginName, reply)
})
