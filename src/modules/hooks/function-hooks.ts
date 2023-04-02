import {createApp} from "vue";
import Login from "~/views/others/account/Sign.vue";

export function useLogin() {
    if ( document.getElementById('Touch-Login') ) return
    const element = document.createElement('div')

    element.id = 'Touch-Login'

    const app = createApp(Login, {
        close: () => {

            app.unmount()

            document.body.removeChild(element)
        }
    })

    document.body.appendChild(element)

    app.mount(element)

    return app
}