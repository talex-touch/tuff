'use strict'

const path = require('node:path')

function buildExportMismatchError(moduleName, expectedExports, binding) {
  const exported = binding && typeof binding === 'object' ? Object.keys(binding) : []
  const missing = expectedExports.filter(name => typeof binding?.[name] !== 'function')
  const error = new Error(
    `Native module export mismatch (${moduleName}): missing [${missing.join(', ')}], actual [${exported.join(', ')}]`,
  )
  error.code = 'ERR_NATIVE_EXPORT_MISMATCH'
  return error
}

function loadNativeBinding(options) {
  const moduleName = options?.moduleName
  const expectedExports = Array.isArray(options?.expectedExports) ? options.expectedExports : []
  const baseDir = options?.baseDir || __dirname

  if (typeof moduleName !== 'string' || moduleName.length === 0) {
    const error = new Error('Native module name is required')
    error.code = 'ERR_NATIVE_MODULE_NAME_REQUIRED'
    return { nativeBinding: null, loadError: error }
  }

  const modulePath = path.join(baseDir, 'build/Release', `${moduleName}.node`)

  try {
    const binding = require(modulePath)

    if (expectedExports.length > 0) {
      const missing = expectedExports.filter(name => typeof binding?.[name] !== 'function')
      if (missing.length > 0) {
        return {
          nativeBinding: null,
          loadError: buildExportMismatchError(moduleName, expectedExports, binding),
        }
      }
    }

    return { nativeBinding: binding, loadError: null }
  }
  catch (error) {
    return { nativeBinding: null, loadError: error }
  }
}

module.exports = {
  loadNativeBinding,
}
