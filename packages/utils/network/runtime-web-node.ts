import type { NetworkClientRuntime } from './client'
import { toTfileUrl } from './file'
import { readBinary, readText, request } from './request'

export function createWebNodeNetworkRuntime(): NetworkClientRuntime {
  return {
    request,
    readText,
    readBinary,
    toTfileUrl
  }
}
