import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'

declare global {
  interface TuffCloudflareBindings {
    DB?: D1Database
    R2?: R2Bucket
    TUFF_INTELLIGENCE_RUNTIME?: KVNamespace
    ASSETS?: R2Bucket | { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }
    IMAGES?: R2Bucket
    PACKAGES?: R2Bucket
    PLUGIN_PACKAGES?: R2Bucket
    APP_AUTH_JWT_SECRET?: string
    AUTH_SECRET?: string
    AUTH_ORIGIN?: string
    AUTH_EMAIL_FROM?: string
    RESEND_API_KEY?: string
    RESEND_API_URL?: string
    GITHUB_CLIENT_ID?: string
    GITHUB_CLIENT_SECRET?: string
    LINUXDO_CLIENT_ID?: string
    LINUXDO_CLIENT_SECRET?: string
    LINUXDO_ISSUER?: string
    EXCHANGE_RATE_API_KEY?: string
    EXCHANGE_RATE_BASE_URL?: string
    EXCHANGE_RATE_TTL_MS?: string
    EXCHANGE_RATE_TIMEOUT_MS?: string
    EXCHANGE_RATE_HISTORY_RETENTION_DAYS?: string
    EXCHANGE_RATE_STORE_RATE_ROWS?: string
    NUXT_INTELLIGENCE_ENCRYPT_KEY?: string
    RELEASE_SIGNATURE_PUBLIC_KEY?: string
    UPDATE_SIGNATURE_PUBLIC_KEY?: string
    RELEASE_DOWNLOAD_SIGNING_SECRET?: string
    PLUGIN_ATTESTATION_PRIVATE_KEY_PEM?: string
    PLUGIN_ATTESTATION_KEY_ID?: string
    PROVIDER_REGISTRY_SECURE_STORE_KEY?: string
    NOTIFICATION_WEB_PUSH_PUBLIC_KEY?: string
    VOICE_PROVIDER_CATALOG_KEYS?: string
    ADMINSECRET?: string
    ADMIN_SECRET?: string
    NEXUS_LOCAL_PAGES_PREVIEW?: string
    NEXUS_SERVER_TIMING?: string
    MAINTENANCE_SECRET?: string
  }
}

export {}
