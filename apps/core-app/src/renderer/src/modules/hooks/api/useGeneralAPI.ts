import { createApp } from 'vue'
import TouchCaptcha from '~/views/others/captcha/TouchCaptcha.vue'

export async function useCaptcha(callback: (res: any) => void): Promise<void> {
  if (document.getElementById('touch-captcha')) return

  const div = document.createElement('div')

  document.body.appendChild(div)

  div.id = 'touch-captcha'

  const app = createApp(TouchCaptcha, {
    func: async (res: any) => {
      app.unmount()

      document.body.removeChild(div)

      callback(res)
    }
  })

  app.mount('#touch-captcha')
}
