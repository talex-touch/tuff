import {get} from "~/base/axios";
import {createApp} from "vue";
import TouchCaptcha from "~/views/others/captcha/TouchCaptcha.vue";

export async function useCaptcha(callback) {
    if ( document.getElementById('touch-captcha') ) return

    const div = document.createElement('div')

    document.body.appendChild(div)

    div.id = 'touch-captcha'

    const app = createApp(TouchCaptcha, {

        func: async (res) => {

            app.unmount()

            document.body.removeChild(div)

            callback(res)

        }
    })

    app.mount('#touch-captcha')
}