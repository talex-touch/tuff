import VWave from 'v-wave'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VWave, {
    color: 'currentColor',
    initialOpacity: 0.5,
    easing: 'cubic-bezier(0.785, 0.135, 0.15, 0.86)',
  })
})
