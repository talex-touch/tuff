import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

declare global {
  interface TuffCloudflareBindings {
    DB?: D1Database
    R2?: R2Bucket
    ASSETS?: R2Bucket
    IMAGES?: R2Bucket
    PACKAGES?: R2Bucket
    PLUGIN_PACKAGES?: R2Bucket
    RELEASE_SIGNATURE_PUBLIC_KEY?: string
    UPDATE_SIGNATURE_PUBLIC_KEY?: string
    ADMIN_CF_ACCESS_CLIENT_ID?: string
    ADMIN_CF_ACCESS_CLIENT_SECRET?: string
    ADMIN_OOB_MTLS_ENABLED?: string
    ADMIN_OOB_MTLS_FINGERPRINTS?: string
    ADMIN_EMERGENCY_JWT_SECRET?: string
    ADMIN_CONTROL_PLANE_PEPPER?: string
    NEXUS_EXPERIMENTAL_RISK_ENABLED?: string
    NEXUS_EXPERIMENTAL_WATERMARK_ENABLED?: string
  }
}

export {}
