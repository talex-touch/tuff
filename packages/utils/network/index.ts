import { createNetworkGuard } from './guard'
import { isHttpSource, isLocalHttpSource, resolveLocalFilePath, toTfileUrl } from './file'
import { readBinary, readText, request } from './request'

export * from './file'
export * from './guard'
export * from './request'
export * from './types'

const sharedGuard = createNetworkGuard()

export const network = {
  request,
  file: {
    toTfileUrl,
    resolveLocalFilePath,
    readText,
    readBinary,
    isHttpSource,
    isLocalHttpSource
  },
  guard: sharedGuard,
  createGuard: createNetworkGuard
}
