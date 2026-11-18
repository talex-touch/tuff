import { hasWindow } from '@talex-touch/utils/env'
import { recoverFromStaleChunkError, stripCacheBustParamFromUrl } from '~/utils/chunk-recovery'

export default defineNuxtPlugin({
  name: 'nexus:chunk-recovery',
  enforce: 'pre',
  setup(nuxtApp) {
    if (!hasWindow())
      return

    const cleanPath = stripCacheBustParamFromUrl(window.location.href)
    if (cleanPath)
      window.history.replaceState(window.history.state, '', cleanPath)

    window.addEventListener('vite:preloadError', (event) => {
      const preloadEvent = event as Event & { payload?: unknown }
      if (recoverFromStaleChunkError(preloadEvent.payload ?? new Error('Unable to preload CSS or chunk')))
        event.preventDefault()
    })

    window.addEventListener('unhandledrejection', (event) => {
      if (recoverFromStaleChunkError(event.reason))
        event.preventDefault()
    })

    nuxtApp.hook('app:chunkError', ({ error }) => {
      recoverFromStaleChunkError(error ?? new Error('ChunkLoadError'))
    })

    nuxtApp.hook('vue:error', (error) => {
      recoverFromStaleChunkError(error)
    })
  },
})
