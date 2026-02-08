'use strict'

const path = require('node:path')

let nativeBinding = null
let loadError = null

try {
  nativeBinding = require(path.join(__dirname, 'build/Release/tuff_native_everything.node'))
} catch (error) {
  loadError = error
}

function createUnavailableError() {
  const error = new Error(
    loadError instanceof Error
      ? `Everything native module is unavailable: ${loadError.message}`
      : 'Everything native module is unavailable'
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
  getVersion
}
