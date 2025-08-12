import { get, post } from '../../../base/axios'
import { md5 } from 'js-md5'

export function useUserExists(userIdentifier: string): Promise<any> {
  return get('/user/has_user/' + userIdentifier)
}

export function useRegisterVerification(
  captcha: string,
  email: string,
  username: string,
  password: string
): Promise<any> {
  return post(
    '/user/register/email',
    {
      email,
      username,
      password: md5(password)
    },
    {
      headers: {
        captcha
      }
    }
  )
}

export function useRegister(captcha: string, code: string, hex: string): Promise<any> {
  return post(
    '/user/register/verify',
    {
      code,
      hex
    },
    {
      headers: {
        captcha
      }
    }
  )
}

export function useLogin(captcha: string, username: string, password: string): Promise<any> {
  return post(
    '/user/login',
    {
      username,
      password: md5(password)
    },
    {
      headers: {
        captcha
      }
    }
  )
}
