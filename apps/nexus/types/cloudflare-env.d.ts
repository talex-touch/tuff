import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

declare global {
  interface TuffCloudflareBindings {
    DB?: D1Database
    R2?: R2Bucket
    ASSETS?: R2Bucket
    IMAGES?: R2Bucket
    PACKAGES?: R2Bucket
    PLUGIN_PACKAGES?: R2Bucket
  }
}

export {}
