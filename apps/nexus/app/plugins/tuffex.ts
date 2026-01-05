import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client)
    return

  nuxtApp.vueApp.use(TuffUI)
})
