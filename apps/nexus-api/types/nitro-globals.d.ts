import type * as H3 from 'h3'
import type * as NitroRuntime from 'nitropack/runtime'

declare global {
  const defineEventHandler: typeof H3.defineEventHandler
  const eventHandler: typeof H3.eventHandler
  const createError: typeof H3.createError
  const getQuery: typeof H3.getQuery
  const readBody: typeof H3.readBody
  const readRawBody: typeof H3.readRawBody
  const readFormData: typeof H3.readFormData
  const readMultipartFormData: typeof H3.readMultipartFormData
  const getRouterParam: typeof H3.getRouterParam
  const getRouterParams: typeof H3.getRouterParams
  const getHeader: typeof H3.getHeader
  const getHeaders: typeof H3.getHeaders
  const getRequestHeader: typeof H3.getRequestHeader
  const getRequestHeaders: typeof H3.getRequestHeaders
  const getRequestURL: typeof H3.getRequestURL
  const getRequestIP: typeof H3.getRequestIP
  const getMethod: typeof H3.getMethod
  const isMethod: typeof H3.isMethod
  const setHeader: typeof H3.setHeader
  const setHeaders: typeof H3.setHeaders
  const setResponseHeader: typeof H3.setResponseHeader
  const setResponseHeaders: typeof H3.setResponseHeaders
  const setResponseStatus: typeof H3.setResponseStatus
  const send: typeof H3.send
  const sendStream: typeof H3.sendStream
  const sendNoContent: typeof H3.sendNoContent
  const sendRedirect: typeof H3.sendRedirect
  const getCookie: typeof H3.getCookie
  const setCookie: typeof H3.setCookie
  const deleteCookie: typeof H3.deleteCookie
  const defineNitroPlugin: typeof NitroRuntime.defineNitroPlugin
  const defineTask: typeof NitroRuntime.defineTask
  const defineCachedEventHandler: typeof NitroRuntime.defineCachedEventHandler
  const useRuntimeConfig: typeof NitroRuntime.useRuntimeConfig
  const useStorage: typeof NitroRuntime.useStorage
}

export {}
