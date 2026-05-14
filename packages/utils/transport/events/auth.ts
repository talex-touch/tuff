import type { AuthState, AuthUser } from '../../auth'
import { defineEvent, defineRawEvent } from '../event/builder'

export interface AuthLoginRequest {
  mode?: 'sign-in' | 'sign-up'
}

export interface AuthInitiatedResponse {
  initiated: boolean
}

export interface AuthSuccessResponse {
  success: boolean
}

export interface AuthProfileUpdateRequest {
  displayName?: string
  bio?: string
}

export interface AuthAvatarUpdateRequest {
  dataUrl: string
}

export interface AuthManualTokenRequest {
  token: string
  appToken?: string
}

export interface NexusRequestPayload {
  url?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  context?: string
}

export interface NexusUploadFilePayload {
  field: string
  name: string
  type?: string
  data: ArrayBuffer | Uint8Array | number[]
}

export interface NexusUploadPayload {
  url?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  fields?: Record<string, string>
  files?: NexusUploadFilePayload[]
  context?: string
}

export interface NexusResponsePayload {
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  body: string
}

export interface AccountRecordSyncActivityRequest {
  kind?: string
}

export const AuthEvents = {
  session: {
    getState: defineEvent('auth')
      .module('session')
      .event('get-state')
      .define<void, AuthState>(),
    login: defineEvent('auth')
      .module('session')
      .event('login')
      .define<AuthLoginRequest, AuthInitiatedResponse>(),
    logout: defineEvent('auth')
      .module('session')
      .event('logout')
      .define<void, AuthSuccessResponse>(),
    stateChanged: defineEvent('auth')
      .module('session')
      .event('state-changed')
      .define<AuthState, void>(),
  },
  profile: {
    update: defineEvent('auth')
      .module('profile')
      .event('update')
      .define<AuthProfileUpdateRequest, AuthUser | null>(),
    updateAvatar: defineEvent('auth')
      .module('profile')
      .event('update-avatar')
      .define<AuthAvatarUpdateRequest, AuthUser | null>(),
  },
  device: {
    attest: defineEvent('auth')
      .module('device')
      .event('attest')
      .define<void, AuthSuccessResponse>(),
    getFingerprintHash: defineEvent('auth')
      .module('device')
      .event('get-fingerprint-hash')
      .define<void, string | null>(),
  },
  nexus: {
    request: defineEvent('auth')
      .module('nexus')
      .event('request')
      .define<NexusRequestPayload, NexusResponsePayload | null>(),
    upload: defineEvent('auth')
      .module('nexus')
      .event('upload')
      .define<NexusUploadPayload, NexusResponsePayload | null>(),
  },
  token: {
    manual: defineEvent('auth')
      .module('token')
      .event('manual')
      .define<AuthManualTokenRequest, AuthSuccessResponse>(),
  },
  stepUp: {
    request: defineEvent('auth')
      .module('step-up')
      .event('request')
      .define<void, AuthInitiatedResponse>(),
    getToken: defineEvent('auth')
      .module('step-up')
      .event('get-token')
      .define<void, string | null>(),
    clearToken: defineEvent('auth')
      .module('step-up')
      .event('clear-token')
      .define<void, AuthSuccessResponse>(),
  },
  legacy: {
    getState: defineRawEvent<void, AuthState>('auth:get-state'),
    login: defineRawEvent<AuthLoginRequest, AuthInitiatedResponse>('auth:login'),
    logout: defineRawEvent<void, AuthSuccessResponse>('auth:logout'),
    updateProfile: defineRawEvent<AuthProfileUpdateRequest, AuthUser | null>('auth:update-profile'),
    updateAvatar: defineRawEvent<AuthAvatarUpdateRequest, AuthUser | null>('auth:update-avatar'),
    attestDevice: defineRawEvent<void, AuthSuccessResponse>('auth:attest-device'),
    nexusRequest: defineRawEvent<NexusRequestPayload, NexusResponsePayload | null>(
      'auth:nexus-request',
    ),
    nexusUpload: defineRawEvent<NexusUploadPayload, NexusResponsePayload | null>(
      'auth:nexus-upload',
    ),
    stateChanged: defineRawEvent<AuthState, void>('auth:state-changed'),
    manualToken: defineRawEvent<AuthManualTokenRequest, AuthSuccessResponse>('auth:manual-token'),
    requestStepUp: defineRawEvent<void, AuthInitiatedResponse>('auth:request-stepup'),
    getStepUpToken: defineRawEvent<void, string | null>('auth:get-stepup-token'),
    clearStepUpToken: defineRawEvent<void, AuthSuccessResponse>('auth:clear-stepup-token'),
    getFingerprintHash: defineRawEvent<void, string | null>('auth:get-fingerprint-hash'),
  },
} as const

export const AccountEvents = {
  auth: {
    getToken: defineEvent('account')
      .module('auth')
      .event('get-token')
      .define<void, string | null>(),
  },
  device: {
    getId: defineEvent('account')
      .module('device')
      .event('get-id')
      .define<void, string | null>(),
  },
  sync: {
    getEnabled: defineEvent('account')
      .module('sync')
      .event('get-enabled')
      .define<void, boolean>(),
    recordActivity: defineEvent('account')
      .module('sync')
      .event('record-activity')
      .define<AccountRecordSyncActivityRequest, boolean>(),
  },
  legacy: {
    getAuthToken: defineRawEvent<void, string | null>('account:get-auth-token'),
    getDeviceId: defineRawEvent<void, string | null>('account:get-device-id'),
    getSyncEnabled: defineRawEvent<void, boolean>('account:get-sync-enabled'),
    recordSyncActivity: defineRawEvent<AccountRecordSyncActivityRequest, boolean>(
      'account:record-sync-activity',
    ),
  },
} as const
