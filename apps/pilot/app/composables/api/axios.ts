/*
 * Copyright (c) 2024. TalexDreamSoul
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import axios, { type AxiosResponse, type CreateAxiosDefaults } from 'axios'
import { $event } from '../events'
import type { IStandardResponse } from './base/index.type'
import { globalOptions } from '~/constants'

const refreshOptions: {
  pending: boolean
  queue: {
    resolve: (value: any) => void
    reject: (value: any) => void
    reqConfig: any
  }[]
} = {
  pending: false,
  queue: [],
}

export function genAxios(options: CreateAxiosDefaults) {
  const $http = axios.create(options)

  $http.interceptors.request.use(
    (originConfig) => {
      const reqConfig = { ...originConfig }
      if (!reqConfig.url)
        console.error('Request url must not be null.')

      const method = String(reqConfig?.method).toUpperCase()

      if (method === 'POST') {
        if (!reqConfig.data)
          reqConfig.data = reqConfig.params || {}

        let hasFile = false
        Object.keys(reqConfig.data).forEach((key) => {
          typeof reqConfig.data[key] === 'object' && (
            item => (item instanceof FileList || item instanceof File || item instanceof Blob) ? hasFile = true : 0
          )(reqConfig.data[key])
        })

        hasFile && ((data) => {
          const formData = new FormData()

          Object.keys(data).forEach(key => formData.append('file', data[key]))

          reqConfig.data = formData
        })(reqConfig.data)
      }

      const accessToken = String(userStore.value.token?.accessToken || '').trim()
      if (accessToken)
        reqConfig.headers.Authorization = `Bearer ${accessToken}`

      if (!refreshOptions.pending) {
        if (refreshOptions.queue.length > 0) {
          refreshOptions.queue.forEach((item) => {
            $http(item.reqConfig).then(item.resolve).catch(item.reject)
          })

          refreshOptions.queue.length = 0
        }
      }

      return reqConfig
    },
    error => Promise.reject(error),
  )

  async function timeoutLogout() {
    $event.emit('USER_LOGOUT_SUCCESS', LogoutType.TOKEN_EXPIRED)
  }

  $http.interceptors.response.use(
    async (res: AxiosResponse) => {
      if (res.data.code === 429)
        return ElMessage.error(res.data.message)

      if ((res.data.code === 1101 || res.data?.code === 401)) {
        const refreshToken = String(userStore.value.token?.refreshToken || '').trim()
        if (!refreshToken) {
          return res.data
        }

        if (!userStore.value.isLogin)
          return timeoutLogout()

        // refresh
        const { config } = res

        // url不包含 renew_token
        if (!config.url?.includes('renew_token')) {
          if (!refreshOptions.pending) {
            refreshOptions.pending = true

            console.log('refresh new token', userStore.value.token, userStore.value.token?.refreshToken)

            const res: any = await $http({
              method: 'GET',
              url: 'auth/renew_token',
              params: {
                refresh_token: refreshToken,
              },
            })

            refreshOptions.pending = false
            if (res.code === 200) {
              userStore.value.token = res.data

              return $http(config)
            }
            else {
              return timeoutLogout()
            }
          }
          else {
            return new Promise((resolve, reject) => {
              refreshOptions.queue.push({ resolve, reject, reqConfig: config })
            })
          }
        }
        else {
          return timeoutLogout()
        }
      }

      return res.data
    },
    async (res) => {
      console.error(res)

      if (!res.response || res.code === 'ERR_INTERNET_DISCONNECTED') {
        return ElMessage.error({
          message: '无法连接至远程服务器!',
          grouping: true,
        })
      }

      if (res.code === 'ERR_NETWORK' && (res.message.includes('timeout') || res.message === 'Network Error'))
        return ElMessage.error('请检查您的网络!')

      return res.response.data
    },
  )

  // 导出常用函数

  /**
   * @param {string} url
   * @param {object} data
   * @param {object} params
   */
  function post(url: string, data = {}, params = {}) {
    return $http({
      method: 'POST',
      url,
      data,
      params,
    }) as Promise<IStandardResponse>
  }

  function get(url: string, params = {}) {
    return $http({
      method: 'GET',
      url,
      params,
    }) as Promise<IStandardResponse>
  }

  function put(url: string, data = {}, params = {}) {
    return $http({
      method: 'PUT',
      url,
      data,
      params,
    }) as Promise<IStandardResponse>
  }

  function del(url: string, data = {}, params = {}) {
    return $http({
      method: 'DELETE',
      url,
      data,
      params,
    }) as Promise<IStandardResponse>
  }

  function patch(url: string, data = {}, params = {}) {
    return $http({
      method: 'PATCH',
      url,
      data,
      params,
    }) as Promise<IStandardResponse>
  }

  // declare module 'axios' {
  //   export interface AxiosRequestConfig {
  //     hideError?: boolean
  //   }
  // }

  return {
    $http,
    post,
    get,
    put,
    del,
    patch,
    timeoutLogout,
  }
}

export const endHttp = genAxios({
  baseURL: `${globalOptions.getEndsUrl()}api`,
  withCredentials: true,
})
