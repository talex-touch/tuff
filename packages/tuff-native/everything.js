'use strict'

const { loadNativeBinding } = require('./native-loader')

const { nativeBinding, loadError } = loadNativeBinding({
  baseDir: __dirname,
  moduleName: 'tuff_native_everything',
  expectedExports: ['search', 'query', 'getVersion'],
})

function createUnavailableError() {
  const error = new Error(
    loadError instanceof Error
      ? `Everything native module is unavailable: ${loadError.message}`
      : 'Everything native module is unavailable',
  )
  error.code = 'ERR_EVERYTHING_NATIVE_UNAVAILABLE'
  return error
}

function search(query, options) {
  if (!nativeBinding || typeof nativeBinding.search !== 'function') {
    throw createUnavailableError()
  }
  return nativeBinding.search(query, options || {})
}

function query(keyword, options) {
  return search(keyword, options)
}

function getVersion() {
  if (!nativeBinding || typeof nativeBinding.getVersion !== 'function') {
    return null
  }
  const version = nativeBinding.getVersion()
  return typeof version === 'string' ? version : null
}

module.exports = {
  search,
  query,
  getVersion,
}
