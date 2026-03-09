import type { Language } from 'element-plus/es/locale'
import type { Router } from 'vue-router'

declare module 'refractor/lang/*' {
  const language: unknown
  export default language
}

declare module 'element-plus/dist/locale/zh-cn.mjs' {
  const locale: Language
  export default locale
}

declare module 'element-plus/es/locales.mjs' {
  const locales: Record<string, Language>
  export default locales
}

declare module 'vue-router' {
  export type RouterTyped = Router
}

declare global {
  interface Window {
    $chat?: unknown
    VConsole?: new () => unknown
  }

  interface HTMLElement {
    _t_loading?: unknown
  }
}

export {}
