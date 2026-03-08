import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

declare module 'h3' {
  interface H3EventContext {
    cloudflare?: {
      env?: {
        DB?: D1Database
        PILOT_ATTACHMENTS?: R2Bucket
        R2?: R2Bucket
        NUXT_PUBLIC_NEXUS_ORIGIN?: string
        PILOT_NEXUS_INTERNAL_ORIGIN?: string
        PILOT_NEXUS_BRIDGE_SECRET?: string
        PILOT_COOKIE_SECRET?: string
      }
    }
  }
}

export {}
