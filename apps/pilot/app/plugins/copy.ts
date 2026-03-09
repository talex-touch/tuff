import { createApp } from 'vue'

function copyValue(bindings: any) {
  return () => {
    if (bindings.value) {
      // copy to clipboard
      navigator.clipboard.writeText(bindings.value)

      ElMessage({
        message: `已成功复制到剪贴板！`,
        grouping: true,
        type: 'success',
        plain: true,
      })
    }
  }
}
/**
 * 定义一个Nuxt插件，用于在Vue组件中添加点击复制功能
 * @param {object} nuxtApp - Nuxt应用实例
 * @returns {object} 返回一个Nuxt插件配置对象
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('copy', {
    mounted(el: HTMLElement, bindings) {
      el.onclick = copyValue(bindings)
    },
    updated(el: HTMLElement, bindings) {
      el.onclick = copyValue(bindings)
    },
  })
})
