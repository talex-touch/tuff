'use strict'

const process = require('node:process')
const { loadNativeBinding } = require('./native-loader')

const { nativeBinding, loadError } = loadNativeBinding({
  baseDir: __dirname,
  moduleName: 'tuff_native_file_index',
  expectedExports: [
    'getFileIndexCapabilities',
    'getFrontmostApplicationDarwin',
    'querySpotlightNative',
    'scanDirectoryBulk',
    'getFseventsVolumeCheckpoint',
    'NativeFileArena',
    'NativeFsEventsWatcher',
  ],
})

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_FILE_INDEX'

function isDisabledByEnv() {
  return process.env[DISABLE_FLAG] === '1'
}

function getFileIndexSupport() {
  if (isDisabledByEnv()) {
    return {
      supported: false,
      platform: process.platform,
      hasBulkScanner: false,
      hasNativeFsevents: false,
      hasNativeSpotlight: false,
      hasNativeFrontmostApp: false,
      reason: 'disabled-by-env',
    }
  }
  if (!nativeBinding) {
    return {
      supported: false,
      platform: process.platform,
      hasBulkScanner: false,
      hasNativeFsevents: false,
      hasNativeSpotlight: false,
      hasNativeFrontmostApp: false,
      reason: loadError instanceof Error ? loadError.message : 'native-module-not-loaded',
    }
  }
  return {
    ...nativeBinding.getFileIndexCapabilities(),
    reason: null,
  }
}

function getNativeBinding() {
  if (isDisabledByEnv() || !nativeBinding) {
    return null
  }
  return nativeBinding
}

function getFrontmostApplicationDarwin() {
  const binding = getNativeBinding()
  if (!binding)
    return null
  return binding.getFrontmostApplicationDarwin()
}

async function querySpotlightNative(query, roots, limit = 150, timeoutMs = 500) {
  const binding = getNativeBinding()
  if (!binding) {
    const err = new Error('Native file-index module is unavailable')
    err.code = 'ERR_NATIVE_FILE_INDEX_UNAVAILABLE'
    throw err
  }
  return binding.querySpotlightNative(query, roots, limit, timeoutMs)
}

async function scanDirectoryBulk(roots, options) {
  const binding = getNativeBinding()
  if (!binding) {
    const err = new Error('Native file-index module is unavailable')
    err.code = 'ERR_NATIVE_FILE_INDEX_UNAVAILABLE'
    throw err
  }
  return binding.scanDirectoryBulk(roots, options)
}

function getFseventsVolumeCheckpoint(rootPath) {
  const binding = getNativeBinding()
  if (!binding) {
    return {
      supported: false,
      volumeUuid: null,
      currentEventId: null,
    }
  }
  return binding.getFseventsVolumeCheckpoint(rootPath)
}

function createNativeFileArena() {
  const binding = getNativeBinding()
  if (!binding)
    return null
  return new binding.NativeFileArena()
}

function createNativeFsEventsWatcher() {
  const binding = getNativeBinding()
  if (!binding)
    return null
  return new binding.NativeFsEventsWatcher()
}

module.exports = {
  getFileIndexSupport,
  getLoadError: () => loadError,
  getFrontmostApplicationDarwin,
  querySpotlightNative,
  scanDirectoryBulk,
  getFseventsVolumeCheckpoint,
  createNativeFileArena,
  createNativeFsEventsWatcher,
}
