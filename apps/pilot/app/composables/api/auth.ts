import { endHttp } from './axios'

export async function sendSMSCode(phone: string) {
  return endHttp.post('auth/sms_code', {
    phone,
    param: '',
  })
}

export async function useSMSLogin(phone: string, code: string, param: string, state?: string) {
  return endHttp.post('auth/sms_login', {
    code,
    phone,
    state,
    param: '',
  })
}

export async function emailRegister(email: string, password: string, nickname = '') {
  return endHttp.post('auth/email/register', {
    email,
    password,
    nickname,
  })
}

export async function emailLogin(email: string, password: string) {
  return endHttp.post('auth/email/login', {
    email,
    password,
  })
}

export async function logoutSession() {
  return endHttp.post('auth/logout')
}

export function doAccountExist(account?: string) {
  return endHttp.get(`auth/account_exist?account=${account}`)
}

export enum Platform {
  WECHAT = 'wechat',
}

export function postQrCodeReq(platform: Platform) {
  return endHttp.post('platform/qrcode', { platform })
}

export function getQrCodeStatus(platform: Platform, key: string) {
  return endHttp.get('platform/qrcode/status', { platform, key })
}

export function qrCodeLogin(code: string) {
  return endHttp.get('auth/platform_login', { code })
}

export function feishuLogin(code: string) {
  return endHttp.get('auth/platform_login/feishu', { code })
}
