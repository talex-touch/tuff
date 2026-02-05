import '@sidebase/nuxt-auth'
import '@sidebase/nuxt-auth/dist/runtime/types'

declare module '@sidebase/nuxt-auth' {
  interface ModuleOptions {
    origin?: string
  }
}

declare module '@sidebase/nuxt-auth/dist/runtime/types' {
  interface ModuleOptions {
    origin?: string
  }
  interface ModuleOptionsNormalized {
    origin?: string
  }
}
