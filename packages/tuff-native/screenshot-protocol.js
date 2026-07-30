'use strict'

const process = require('node:process')
const { loadNativeBinding } = require('./native-loader')
const { EXPECTED_EXPORTS, NapiCarrier, NativeCarrierError } = require('./protocol')

const DISABLE_FLAG = 'TUFF_DISABLE_NATIVE_SCREENSHOT'
const SCREENSHOT_PROTOCOL_EXPORTS = EXPECTED_EXPORTS

function createScreenshotCarrier(options = {}) {
  return new NapiCarrier({
    id: options.id ?? 'screenshot',
    binding: options.binding,
    logger: options.logger,
    clientName: options.clientName ?? 'core-app',
    clientVersion: options.clientVersion ?? '0.0.0',
  })
}

function loadScreenshotCarrier(options = {}) {
  if (process.env[DISABLE_FLAG] === '1') {
    return { carrier: null, reason: 'disabled-by-env' }
  }

  const binding = Object.hasOwn(options, 'binding')
    ? options.binding
    : loadNativeBinding({
      baseDir: options.baseDir ?? __dirname,
      moduleName: 'tuff_native_screenshot',
      expectedExports: SCREENSHOT_PROTOCOL_EXPORTS,
    }).nativeBinding
  if (!binding) {
    return { carrier: null, reason: 'binding-unavailable' }
  }

  try {
    return {
      carrier: createScreenshotCarrier({
        ...options,
        binding,
      }),
      reason: null,
    }
  }
  catch (error) {
    if (error instanceof NativeCarrierError && error.code === 'CARRIER_EXPORT_MISMATCH') {
      return { carrier: null, reason: 'export-mismatch' }
    }
    return { carrier: null, reason: 'binding-unavailable' }
  }
}

module.exports = {
  SCREENSHOT_PROTOCOL_EXPORTS,
  createScreenshotCarrier,
  loadScreenshotCarrier,
}
