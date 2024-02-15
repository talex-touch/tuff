import AgreementTemplate from "~/components/addon/AgreementTemplate.vue";
import { createApp } from "vue";
import Login from "~/views/others/account/Sign.vue";
import protocol from '~/assets/docs/protocol.md?raw'

export function useLogin() {
    if (document.getElementById('Touch-Login')) return
    const element = document.createElement('div')

    element.id = 'Touch-Login'
    element.className = 'Touch-Dialog fake-background'

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