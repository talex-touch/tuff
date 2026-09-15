import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import { evaluateWebhookUrl } from './webhookUrlPolicy'
import {
  assertCredentialObject,
  assertNonEmptyString,
  createTypedCredentialStore,
  optionalString,
  type StoreTypedCredentialResult,
  type TypedCredentialRecord,
} from './secureCredentialStore'

export type NotificationCredentialType = 'api_key' | 'smtp' | 'webhook' | 'bot_token'

export interface NotificationApiKeyCredential {
  apiKey: string
}

export interface NotificationSmtpCredential {
  host: string
  port?: number
  username?: string
  password: string
  secure?: boolean
  from?: string
}

export interface NotificationWebhookCredential {
  url: string
  signingSecret?: string
}

export interface NotificationBotTokenCredential {
  token: string
}

export type NotificationCredentialPayload =
  | NotificationApiKeyCredential
  | NotificationSmtpCredential
  | NotificationWebhookCredential
  | NotificationBotTokenCredential

export interface StoreNotificationCredentialInput {
  authRef: unknown
  credentialType: unknown
  credentials: unknown
}

export type StoreNotificationCredentialResult = StoreTypedCredentialResult<NotificationCredentialType>
export type NotificationCredentialRecord = TypedCredentialRecord<NotificationCredentialType>

function normalizeCredentialType(value: unknown): NotificationCredentialType {
  if (value === 'api_key' || value === 'smtp' || value === 'webhook' || value === 'bot_token')
    return value
  throw createError({ statusCode: 400, statusMessage: 'credentialType is invalid.' })
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'boolean')
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return value
}

function optionalPort(value: unknown): number | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535)
    throw createError({ statusCode: 400, statusMessage: 'credentials.port is invalid.' })
  return value
}

function normalizeCredentialPayload(
  credentialType: NotificationCredentialType,
  value: unknown,
): NotificationCredentialPayload {
  const credentials = assertCredentialObject(value)

  if (credentialType === 'api_key') {
    return {
      apiKey: assertNonEmptyString(credentials.apiKey, 'credentials.apiKey', 4096),
    }
  }

  if (credentialType === 'smtp') {
    return {
      host: assertNonEmptyString(credentials.host, 'credentials.host', 255),
      port: optionalPort(credentials.port),
      username: optionalString(credentials.username, 'credentials.username', 255),
      password: assertNonEmptyString(credentials.password, 'credentials.password', 4096),
      secure: optionalBoolean(credentials.secure, 'credentials.secure'),
      from: optionalString(credentials.from, 'credentials.from', 255),
    }
  }

  if (credentialType === 'webhook') {
    // A length check was the only rule here, so the stored url could be any string — including
    // http://169.254.169.254/latest/meta-data/, which the dispatcher would then call on every
    // notification (#899). Rejected at write time so the admin sees why.
    const url = assertNonEmptyString(credentials.url, 'credentials.url', 2048)
    const decision = evaluateWebhookUrl(url)
    if (!decision.allowed) {
      throw createError({
        statusCode: 400,
        statusMessage: `credentials.url is not an acceptable webhook destination (${decision.reason})`,
      })
    }

    return {
      url: decision.url,
      signingSecret: optionalString(credentials.signingSecret, 'credentials.signingSecret', 4096),
    }
  }

  return {
    token: assertNonEmptyString(credentials.token, 'credentials.token', 4096),
  }
}

const store = createTypedCredentialStore<NotificationCredentialType, NotificationCredentialPayload>(
  {
    table: 'notification_secure_store',
    authRefPattern: /^secure:\/\/notifications\/[a-z0-9][a-z0-9._-]{0,79}$/i,
    authRefHint: 'secure://notifications/<slug>',
    saltPrefix: 'tuff-notification-secure-store:',
    info: 'notification-secure-store:v1',
    kidDomain: 'notification-secure-store-kid:v1',
    errorPrefix: 'NOTIFICATION_CREDENTIAL',
    label: 'Notification secure store key',
    devFallbackSecret: 'tuff-nexus-notification-dev-secure-store-key',
    readMasterKeyCandidates: (event) => {
      // `useRuntimeConfig` is read last and defensively: this store is reachable from contexts
      // where the Nuxt runtime config is not established, and a throw there must not mask a key
      // that the platform binding or environment already supplied.
      let runtimeKey: string | undefined
      try {
        const runtimeConfig = useRuntimeConfig(event) as {
          notificationCredentials?: { secureStoreKey?: string }
        }
        runtimeKey = runtimeConfig.notificationCredentials?.secureStoreKey
      }
      catch {
        runtimeKey = undefined
      }

      return [
        readCloudflareBindings(event)?.NOTIFICATION_SECURE_STORE_KEY,
        process.env.NOTIFICATION_SECURE_STORE_KEY,
        runtimeKey,
      ]
    },
  },
  { credentialType: normalizeCredentialType, credentialPayload: normalizeCredentialPayload },
)

export function normalizeNotificationAuthRef(value: unknown): string {
  return store.normalizeAuthRef(value)
}

export async function storeNotificationCredential(
  event: H3Event,
  input: StoreNotificationCredentialInput,
  createdBy: string,
): Promise<StoreNotificationCredentialResult> {
  return store.store(event, input, createdBy)
}

export async function getNotificationCredential(
  event: H3Event,
  authRef: string,
): Promise<NotificationCredentialPayload | null> {
  return store.get(event, authRef)
}

export async function notificationCredentialExists(
  event: H3Event,
  authRef: string,
): Promise<boolean | null> {
  return store.exists(event, authRef)
}

export async function listNotificationCredentials(event: H3Event): Promise<NotificationCredentialRecord[]> {
  return store.list(event)
}

export async function deleteNotificationCredential(event: H3Event, authRef: string): Promise<boolean> {
  return store.delete(event, authRef)
}
