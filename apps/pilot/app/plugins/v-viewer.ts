import VueViewer from 'v-viewer'
import 'viewerjs/dist/viewer.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VueViewer)
})
