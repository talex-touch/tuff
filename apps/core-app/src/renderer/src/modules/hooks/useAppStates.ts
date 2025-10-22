import { createGlobalState } from '@vueuse/core'

/**
 * This file defines the states of the application
 * And provides the hooks to manage the states
 */
export const useAppState = createGlobalState(() => {
  const states = shallowReactive({
    hasUpdate: false
  })

  return { appStates: states }
})
