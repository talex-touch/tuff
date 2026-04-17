const { syncPackagedResourceModules } = require('./runtime-modules')

module.exports = async function afterPack(context) {
  syncPackagedResourceModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
}
