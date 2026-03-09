import { endHttp } from '../../axios'
import type { IDataResponse } from '../index.type'
import type { ILoginToken } from './auth.type'

export default {
  serverStatus() {
    return endHttp.get('auth/status')
  },
  renewToken() {
    return endHttp.get('auth/renew_token') as Promise<IDataResponse<ILoginToken>>
  },
}
