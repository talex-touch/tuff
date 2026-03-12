'use strict'

module.exports = class PgNativeUnavailable {
  constructor() {
    const error = new Error('pg-native is not available in this runtime')
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
}
