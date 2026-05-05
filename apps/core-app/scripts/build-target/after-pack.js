const {
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
} = require('./runtime-modules')

module.exports = async function afterPack(context) {
  syncPackagedResourceModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
  syncMissingPackagedRuntimeModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
}
