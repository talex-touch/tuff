import { createApp } from 'vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('permission', {
    mounted(el: HTMLElement, bindings) {
      const permission = bindings.value
      if (!userHavePermission(permission))
        el.style.display = 'none'
      else el.style.display = ''
    },
    updated(el: HTMLElement, bindings) {
      const permission = bindings.value
      if (!userHavePermission(permission))
        el.style.display = 'none'
      else el.style.display = ''
    },
  })
})
