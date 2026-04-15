import { createApp } from 'vue'
import type { App } from 'vue'
import LoadingIcon from '~/components/icon/LoadingIcon.vue'

type LoadingHostElement = HTMLElement & {
  _t_loading?: {
    app: App
    wrapper: HTMLDivElement
    timer?: ReturnType<typeof setTimeout>
  }
}

const loadingDirective = {
  mounted(el: LoadingHostElement) {
    const wrapper = document.createElement('div')

    wrapper.className = 'LoadingWrapper transition-cubic'

    const app = createApp(LoadingIcon)

    el.appendChild(wrapper)

    el._t_loading = {
      app,
      wrapper,
    }

    wrapper.style.opacity = '0'
    wrapper.style.pointerEvents = 'none'
    app.mount(wrapper)
  },
  beforeUpdate(el: LoadingHostElement, binding: any) {
    if (!el._t_loading) {
      console.error('a', el)

      return
    }
    const { wrapper, timer } = el._t_loading

    clearTimeout(timer)

    if (binding.value) {
      el._t_loading.timer = setTimeout(() => {
        wrapper.style.opacity = '.55'
        wrapper.style.pointerEvents = ''
      }, 200)
    }
    else {
      wrapper.style.opacity = '0'
      wrapper.style.pointerEvents = 'none'
    }
  },
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('loader', loadingDirective)
})
