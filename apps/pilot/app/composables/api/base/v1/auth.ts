import type { IDataResponse } from '../index.type'
import type { ILoginToken } from './auth.type'
import { endHttp } from '../../axios'

export default {
  getAuthStatus() {
    return endHttp.get('auth/status')
  },
  serverStatus() {
    return endHttp.get('auth/status')
  },
  renewToken() {
    return endHttp.get('auth/renew_token') as Promise<IDataResponse<ILoginToken>>
  },
  emailRegister(email: string, password: string, nickname = '') {
    return endHttp.post('auth/email/register', {
      email,
      password,
      nickname,
    })
  },
  emailLogin(email: string, password: string) {
    return endHttp.post('auth/email/login', {
      email,
      password,
    })
  },
  logout() {
    return endHttp.post('auth/logout')
  },
}
