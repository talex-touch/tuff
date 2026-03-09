import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

declare module 'h3' {
  interface H3EventContext {
    cloudflare?: {
      env?: {
        DB?: D1Database
        PILOT_ATTACHMENTS?: R2Bucket
        R2?: R2Bucket
        NUXT_PUBLIC_NEXUS_ORIGIN?: string
        NUXT_PUBLIC_PILOT_STREAM_IDLE_TIMEOUT_MS?: string
        NUXT_PUBLIC_PILOT_STREAM_MAX_DURATION_MS?: string
        PILOT_NEXUS_INTERNAL_ORIGIN?: string
        PILOT_NEXUS_OAUTH_CLIENT_ID?: string
        PILOT_NEXUS_OAUTH_CLIENT_SECRET?: string
        PILOT_COOKIE_SECRET?: string
        PILOT_ATTACHMENT_PROVIDER?: string
        PILOT_ATTACHMENT_PUBLIC_BASE_URL?: string
        PILOT_ATTACHMENT_SIGNING_SECRET?: string
        PILOT_MINIO_ENDPOINT?: string
        PILOT_MINIO_BUCKET?: string
        PILOT_MINIO_ACCESS_KEY?: string
        PILOT_MINIO_SECRET_KEY?: string
        PILOT_MINIO_REGION?: string
        PILOT_MINIO_FORCE_PATH_STYLE?: string
        PILOT_MINIO_PUBLIC_BASE_URL?: string
      }
    }
  }
}

export {}
