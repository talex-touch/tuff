'use strict'

const loadNative = require('node-gyp-build')

let nativeBinding = null
let loadError = null

try {
  nativeBinding = loadNative(__dirname)
} catch (error) {
  loadError = error
}

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_OCR'

function isDisabledByEnv() {
  return process.env[DISABLE_FLAG] === '1'
}

function getNativeOcrSupport() {
  if (isDisabledByEnv()) {
    return {
      supported: false,
      platform: process.platform,
      reason: 'disabled-by-env'
    }
  }

  if (!nativeBinding || typeof nativeBinding.getNativeOcrSupport !== 'function') {
    return {
      supported: false,
      platform: process.platform,
      reason: loadError instanceof Error ? loadError.message : 'native-module-not-loaded'
    }
  }

  return nativeBinding.getNativeOcrSupport()
}

async function recognizeImageText(options) {
  if (isDisabledByEnv()) {
    const error = new Error('Native OCR is disabled by TUFF_DISABLE_NATIVE_OCR=1')
    error.code = 'ERR_OCR_DISABLED'
    throw error
  }

  if (!nativeBinding || typeof nativeBinding.recognizeImageText !== 'function') {
    const error = new Error('Native OCR module is unavailable')
    error.code = 'ERR_OCR_ENGINE_UNAVAILABLE'
    throw error
  }

  return nativeBinding.recognizeImageText(options)
}

module.exports = {
  getNativeOcrSupport,
  recognizeImageText
}
