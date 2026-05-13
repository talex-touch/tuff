const path = require('node:path')
const plist = require('simple-plist')
const {
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
} = require('./runtime-modules')

function ensureMacMainAppLsuiElement(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager?.appInfo?.productFilename || 'tuff'
  const plistPath = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Info.plist')
  const info = plist.readFileSync(plistPath)

  if (info.LSUIElement !== true) {
    info.LSUIElement = true
    plist.writeFileSync(plistPath, info)
    console.log(`[afterPack] Set LSUIElement=true in ${plistPath}`)
  }

  const verified = plist.readFileSync(plistPath)
  if (verified.LSUIElement !== true) {
    throw new Error(`[afterPack] Failed to verify LSUIElement=true in ${plistPath}`)
  }
}

module.exports = async function afterPack(context) {
  ensureMacMainAppLsuiElement(context)
  syncPackagedResourceModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
  syncMissingPackagedRuntimeModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
}
