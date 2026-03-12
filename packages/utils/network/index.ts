import { createNetworkClient } from './client'
import { createNetworkGuard } from './guard'
import { isHttpSource, isLocalHttpSource, resolveLocalFilePath } from './file'
import { createWebNodeNetworkRuntime } from './runtime-web-node'

export * from './client'
export * from './core/errors'
export * from './file'
export * from './guard'
export * from './request'
export * from './runtime-electron-main'
export * from './runtime-web-node'
export * from './types'

const sharedGuard = createNetworkGuard()
const runtime = createWebNodeNetworkRuntime()

export const networkClient = createNetworkClient(runtime, sharedGuard)

export const network = {
  request: networkClient.request,
  readText: networkClient.readText,
  readBinary: networkClient.readBinary,
  toTfileUrl: networkClient.toTfileUrl,
  file: {
    toTfileUrl: networkClient.toTfileUrl,
    resolveLocalFilePath,
    readText: networkClient.readText,
    readBinary: networkClient.readBinary,
    isHttpSource,
    isLocalHttpSource
  },
  guard: networkClient.guard,
  createGuard: createNetworkGuard
}
