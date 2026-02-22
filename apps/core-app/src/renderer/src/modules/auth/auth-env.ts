import { getTuffBaseUrl, isDevEnv } from '@talex-touch/utils/env'
import { appSetting } from '~/modules/channel/storage'

const LOCAL_AUTH_BASE_URL = 'http://localhost:3200'

export function isLocalAuthMode(): boolean {
  return isDevEnv() && appSetting?.dev?.authServer === 'local'
}

export function getAuthBaseUrl(): string {
  return isLocalAuthMode() ? LOCAL_AUTH_BASE_URL : getTuffBaseUrl()
}
