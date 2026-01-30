import TuffUI from '@talex-touch/tuffex'

export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client)
    return

  nuxtApp.vueApp.use(TuffUI)
})
