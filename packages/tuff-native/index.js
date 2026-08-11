'use strict'

const process = require('node:process')
const { loadNativeBinding } = require('./native-loader')

const { nativeBinding, loadError } = loadNativeBinding({
  baseDir: __dirname,
  moduleName: 'tuff_native_ocr',
  expectedExports: ['getNativeOcrSupport', 'recognizeImageText'],
})

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_OCR'

function isDisabledByEnv() {
  return process.env[DISABLE_FLAG] === '1'
}

function getNativeOcrSupport() {
  if (isDisabledByEnv()) {
    return {
      supported: false,
      platform: process.platform,
      reason: 'disabled-by-env',
    }
  }

  if (
    !nativeBinding
    || typeof nativeBinding.getNativeOcrSupport !== 'function'
  ) {
    return {
      supported: false,
      platform: process.platform,
      reason:
        loadError instanceof Error
          ? loadError.message
          : 'native-module-not-loaded',
    }
  }

  return nativeBinding.getNativeOcrSupport()
}

async function recognizeImageText(options) {
  if (isDisabledByEnv()) {
    const error = new Error(
      'Native OCR is disabled by TUFF_DISABLE_NATIVE_OCR=1',
    )
    error.code = 'ERR_OCR_DISABLED'
    throw error
  }

  if (
    !nativeBinding
    || typeof nativeBinding.recognizeImageText !== 'function'
  ) {
    const error = new Error(
      loadError instanceof Error
        ? `Native OCR module is unavailable: ${loadError.message}`
        : 'Native OCR module is unavailable',
    )
    error.code = 'ERR_OCR_ENGINE_UNAVAILABLE'
    throw error
  }

  return nativeBinding.recognizeImageText(options)
}

/**
 * Writes a macOS app icon. `async` in signature only -- the work runs on the calling thread.
 *
 * `iconForFile:` is AppKit, and AppKit here means the main thread: app_icon.mm:140 rejects any
 * other with `ERR_DARWIN_APP_ICON_WRONG_THREAD`. In Electron the main thread *is* the JS thread,
 * so there is nowhere to move it to. An AsyncWorker version was written, compiled, and threw that
 * error on the first call (#857) -- worth knowing before writing it a second time.
 *
 * The `setImmediate` below defers when the block starts, not that it blocks. Measured cost is
 * ~28 ms p50 per app on a cold index; of that only ~6 ms is AppKit work
 * (fetch 1.0 / draw 3.6 / encode 1.4 warm) and the rest is bundle icon I/O happening *inside*
 * `iconForFile:`, which cannot leave the main thread either. Moving just the PNG encode and the
 * file write off-thread would save single digits of the 28.
 *
 * The alternative is ImageIO, which is ~50x kinder to the event loop and returns the wrong asset:
 * it hands back the light-paper icon where AppKit returns the dark-paper one, so on a dark-mode
 * system essentially every modern app gets the wrong icon. That trade is open on #857.
 */
async function writeDarwinAppIcon(options) {
  if (
    !nativeBinding
    || typeof nativeBinding.writeDarwinAppIconSync !== 'function'
  ) {
    const error = new Error(
      loadError instanceof Error
        ? `Native Darwin app icon module is unavailable: ${loadError.message}`
        : 'Native Darwin app icon module is unavailable',
    )
    error.code = 'ERR_DARWIN_APP_ICON_UNAVAILABLE'
    throw error
  }

  await new Promise(resolve => setImmediate(resolve))
  return nativeBinding.writeDarwinAppIconSync(options)
}

/**
 * Reads the current process's macOS notification authorization status.
 * Resolves to { status, reason? } where status is one of:
 * 'granted' | 'denied' | 'notDetermined' | 'unverifiable' | 'unsupported'.
 * Degrades to 'unsupported'/'unverifiable' instead of throwing when the native
 * module (or the function) is unavailable, so callers can treat it as best-effort.
 */
async function getNotificationAuthorizationStatus() {
  if (
    !nativeBinding
    || typeof nativeBinding.getNotificationAuthorizationStatus !== 'function'
  ) {
    return {
      status: 'unsupported',
      reason:
        loadError instanceof Error
          ? loadError.message
          : 'native-module-not-loaded',
    }
  }

  try {
    return await nativeBinding.getNotificationAuthorizationStatus()
  }
  catch (error) {
    return {
      status: 'unverifiable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

module.exports = {
  getNativeOcrSupport,
  recognizeImageText,
  writeDarwinAppIcon,
  getNotificationAuthorizationStatus,
}
