const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

function resolveFdBinary() {
  const runtimeRequire = createRequire(__filename)
  const wrapperManifest = runtimeRequire.resolve('@prebuilt-binary/fd/package.json')
  const wrapperRequire = createRequire(wrapperManifest)
  const binaryName = process.platform === 'win32' ? 'fd.exe' : 'fd'
  const platformPackage = `@prebuilt-binary/fd-${process.platform}-${process.arch}`
  return wrapperRequire.resolve(`${platformPackage}/bin/${binaryName}`)
}

try {
  const binaryPath = resolveFdBinary()
  if (process.platform !== 'win32') fs.chmodSync(binaryPath, 0o755)
  fs.accessSync(binaryPath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
  console.log(`[ensure-fd-binary] Ready: ${path.basename(binaryPath)}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(
    `[ensure-fd-binary] Bundled fd is unavailable for ${process.platform}-${process.arch}; ` +
      `the runtime will use the legacy walker (${message})`
  )
}
