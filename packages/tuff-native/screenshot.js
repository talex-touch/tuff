'use strict'

const process = require('node:process')
const { loadNativeBinding } = require('./native-loader')

const { nativeBinding, loadError } = loadNativeBinding({
  baseDir: __dirname,
  moduleName: 'tuff_native_screenshot',
  expectedExports: [
    'getNativeScreenshotSupport',
    'listDisplays',
    'captureDisplay',
    'captureRegion',
    'capture',
  ],
})

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_SCREENSHOT'

function isDisabledByEnv() {
  return process.env[DISABLE_FLAG] === '1'
}

function getNativeScreenshotSupport() {
  if (isDisabledByEnv()) {
    return {
      supported: false,
      platform: process.platform,
      reason: 'disabled-by-env',
    }
  }

  if (!nativeBinding || typeof nativeBinding.getNativeScreenshotSupport !== 'function') {
    return {
      supported: false,
      platform: process.platform,
      reason: loadError instanceof Error ? loadError.message : 'native-module-not-loaded',
    }
  }

  return nativeBinding.getNativeScreenshotSupport()
}

function createUnavailableError() {
  const error = new Error(
    loadError instanceof Error
      ? `Native screenshot module is unavailable: ${loadError.message}`
      : 'Native screenshot module is unavailable',
  )
  error.code = 'ERR_NATIVE_SCREENSHOT_UNAVAILABLE'
  return error
}

function requireBinding(name) {
  if (isDisabledByEnv()) {
    const error = new Error('Native screenshot is disabled by TUFF_DISABLE_NATIVE_SCREENSHOT=1')
    error.code = 'ERR_NATIVE_SCREENSHOT_DISABLED'
    throw error
  }

  if (!nativeBinding || typeof nativeBinding[name] !== 'function') {
    throw createUnavailableError()
  }

  return nativeBinding[name]
}

function listDisplays() {
  return requireBinding('listDisplays')()
}

function captureDisplay(displayId) {
  return requireBinding('captureDisplay')(displayId)
}

function captureRegion(options) {
  return requireBinding('captureRegion')(options || {})
}

function capture(options) {
  return requireBinding('capture')(options || {})
}

module.exports = {
  getNativeScreenshotSupport,
  listDisplays,
  captureDisplay,
  captureRegion,
  capture,
}
