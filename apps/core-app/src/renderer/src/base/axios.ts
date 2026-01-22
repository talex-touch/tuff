import type { AxiosRequestConfig, CreateAxiosDefaults } from 'axios'
import _axios from 'axios'

export function wrapperAxios(
  url = 'http://localhost:9981',
  data: CreateAxiosDefaults = { timeout: 6000, proxy: false }
) {
  // Encapsulate the complete axios instance code
  const axios = _axios.create({
    baseURL: url,
    ...data
  })

  // Request interceptor
  axios.interceptors.request.use(
    (config) => {
      // Do something before sending the request
      return config
    },
    (error) => {
      // Do something with request error
      return Promise.reject(error)
    }
  )

  // Response interceptor
  axios.interceptors.response.use(
    (response) => {
      // Do something with response data
      // console.log( response )

      return response.data
    },
    (error) => {
      // Do something with response error
      console.log(error)

      return {
        code: 500,
        message: 'Server error',
        data: null,
        error
      } // Promise.reject(error)
    }
  )

  function post(url: string, data: unknown, config?: IReqConfig) {
    return axios.post(url, data, config)
  }

  function get(url: string, config?: IReqConfig) {
    return axios.get(url, config)
  }

  function put(url: string, data: unknown, config?: IReqConfig) {
    return axios.put(url, data, config)
  }

  function del(url: string, config?: IReqConfig) {
    return axios.delete(url, config)
  }

  function patch(url: string, data: unknown, config?: IReqConfig) {
    return axios.patch(url, data, config)
  }

  function head(url: string, config?: IReqConfig) {
    return axios.head(url, config)
  }

  function options(url: string, config?: IReqConfig) {
    return axios.options(url, config)
  }

  function request(config: IReqConfig) {
    return axios.request(config)
  }

  return {
    axios,
    post,
    get,
    put,
    del,
    patch,
    head,
    options,
    request
  }
}

export const { axios, get, put, del, patch, head, options, request, post } = wrapperAxios()

export interface IReqConfig extends AxiosRequestConfig {}
