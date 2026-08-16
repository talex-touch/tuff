import type { App } from 'vue'
import type { RouteRecordRaw, Router } from 'vue-router'

/**
 * Context handed to every module under `src/modules/`.
 *
 * Previously `ViteSSGContext`. The Surface no longer builds through ViteSSG, so this is
 * declared locally rather than dragging the whole SSG toolchain in for one type.
 */
export interface PluginAppContext {
  app: App<Element>
  router: Router
  routes: RouteRecordRaw[]
  isClient: boolean
}

export type UserModule = (ctx: PluginAppContext) => void
