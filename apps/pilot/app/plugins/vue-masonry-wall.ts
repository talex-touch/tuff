import MasonryWall from '@yeger/vue-masonry-wall'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(MasonryWall)
})
